const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Form16 = require('../../models/form16.model');
const TaxRecommendation = require('../../models/taxrecommendation.model');
const Income = require('../../models/income.model');
const Investment = require('../../models/investment.model');
const Insurance = require('../../models/insurance.model');
const EMILoan = require('../../models/loan.model');
const EducationPayment = require('../../models/education.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { extractForm16, generateRecommendation, normalizeForm16 } = require('../../services/gemini.service');
const { annualize, aggregateDeductions, buildDeductionBreakdown } = require('../../services/tax.service');

const router = express.Router();
router.use(isAuthenticated);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});

// Form16 is keyed by userId (no familyAccountId), so owner = creator or an admin.
function ownsForm16(req, doc) {
  return doc.userId.equals(req.user._id) || req.user.role === 'admin';
}

// normalizeForm16 (from gemini.service) coerces comma/₹-formatted numeric
// strings to Numbers and drops an invalid taxRegimeUsed, so the model's
// validation never rejects the document on save.

// Section 80C has a hard cap of ₹1,50,000 (incl. tuition fees).
const EIGHTYC_CAP = 150000;

// The education tuition fold-in now happens inside the canonical engine's
// `fromForm16` builder (which merges `eduTuition` into the 80C records
// figure with provenance). We no longer mutate the stored Form16 here.

// POST /api/form16/upload — PDF -> Gemini extraction.
router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
    const b64 = req.file.buffer.toString('base64');
    const data = normalizeForm16(await extractForm16(b64));
    const doc = new Form16({
      ...data,
      userId: req.user._id,
      sourceType: 'PDF',
      pdfReference: req.file.originalname,
    });
    await doc.save();
    res.status(201).json({ _id: doc._id, sourceType: doc.sourceType });
  } catch (err) {
    next(err);
  }
});

// POST /api/form16/manual — manual entry.
router.post('/manual', async (req, res, next) => {
  try {
    const doc = new Form16({ ...normalizeForm16({ ...req.body }), userId: req.user._id, sourceType: 'Manual' });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// POST /api/form16/:id/duplicate
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const src = await Form16.findById(req.params.id);
    if (!src) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, src)) return res.status(403).json({ error: 'Forbidden' });
    const copy = src.toObject();
    delete copy._id;
    delete copy.__v;
    delete copy.createdAt;
    delete copy.updatedAt;
    copy.userId = req.user._id;
    copy.sourceType = 'Duplicate';
    copy.originalForm16Id = src._id;
    copy.isEdited = false;
    if (req.body.financialYear) copy.financialYear = req.body.financialYear;
    normalizeForm16(copy);
    const doc = new Form16(copy);
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// GET /api/form16/:id/recommendation (cached + stale-aware)
router.get('/:id/recommendation', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const form16 = await Form16.findById(req.params.id);
    if (!form16) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, form16)) return res.status(403).json({ error: 'Forbidden' });

    const existing = await TaxRecommendation.findOne({ form16Id: form16._id });
    if (existing && !existing.isStale) return res.json(existing);

    const financials = {
      income: await Income.find({ memberId: form16.userId }),
      investments: await Investment.find({ memberId: form16.userId }),
      insurance: await Insurance.find({ memberId: form16.userId }),
      loans: await EMILoan.find({ memberId: form16.userId }),
      education: await EducationPayment.find({ memberId: form16.userId }),
    };

    // Aggregate deductions across investments, insurance, loans (home-loan
    // interest under 24 + principal under 80C) and education tuition fees.
    // This is the SAME data used to compute both regimes below, so loans and
    // education are reflected in the tax calculation.
    const agg = await aggregateDeductions(form16.userId);

    // Fold education tuition fees into the 80C records figure inside the
    // canonical engine builder (the stored Form16 doc is NOT mutated).
    const eduTuition = financials.education.reduce(
      (s, e) => s + annualize(e.amount, e.frequency),
      0,
    );
    const rec = await generateRecommendation(form16, financials, agg, eduTuition);

    // Static, plain-English breakdown of what was claimed (no AI involved).
    const deductionBreakdown = buildDeductionBreakdown(agg);

    // totalDeductions must come from the canonical engine result (which includes
    // standard deduction + all verified Chapter VI-A deductions), NOT from agg
    // (which only sums investment/insurance/loan records without standard deduction).
    // Using agg.totalDeductions here was the root cause of the Review/Recommendation
    // mismatch reported in Part 6 of the audit.
    const canonicalTotalDeductions =
      rec.regimes && rec.regimes.old
        ? rec.regimes.old.totalDeductions
        : agg.totalDeductions;

    const upserted = await TaxRecommendation.findOneAndUpdate(
      { form16Id: form16._id },
      {
        userId: form16.userId,
        form16Id: form16._id,
        ...rec,
        totalDeductions: canonicalTotalDeductions,
        deductionBreakdown,
        isStale: false,
        generatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json(upserted);
  } catch (err) {
    next(err);
  }
});

// GET /api/form16 — list user's Form 16 records.
router.get('/', async (req, res, next) => {
  try {
    const items = await Form16.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// GET /api/form16/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const doc = await Form16.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, doc)) return res.status(403).json({ error: 'Forbidden' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PUT /api/form16/:id
router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const doc = await Form16.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, doc)) return res.status(403).json({ error: 'Forbidden' });
    const { userId, sourceType, originalForm16Id, pdfReference, _id, ...updates } = req.body;
    normalizeForm16(updates);
    Object.assign(doc, updates);
    doc.isEdited = true; // triggers the stale hook on save
    await doc.save();
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/form16/:id — also removes the linked recommendation.
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const doc = await Form16.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, doc)) return res.status(403).json({ error: 'Forbidden' });
    await TaxRecommendation.deleteMany({ form16Id: doc._id });
    await doc.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
