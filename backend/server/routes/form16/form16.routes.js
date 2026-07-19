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
const { annualize, aggregateDeductions } = require('../../services/tax.service');
const { fromForm16 } = require('../../services/taxEngine.service');

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

// The education tuition fold-in happens inside the canonical engine's
// `fromForm16` builder (which merges `eduTuition` into the 80C records
// figure with provenance). We no longer mutate the stored Form16 here.

// =============================================================================
// GET /api/form16/:id/deductions-preview
//
// Returns the COMPLETE merged DeductionLineItem array built from all three sources:
//   1. FORM16_OCR  — items extracted from the Form 16 PDF
//   2. INVESTMENT_RECORD — items pulled from the user's loans, insurance, and
//                          investment MongoDB collections for the current FY
//   3. USER_MANUAL — any manually entered items (currently folded in via Form16)
//
// This runs the SAME merging logic the recommendation flow uses (fromForm16 +
// aggregateDeductions) so the two are GUARANTEED to produce the same input to
// computeTax. The Review page calls this on mount and stores the result in
// TaxpayerContext.deductions before rendering the deduction list.
// =============================================================================
router.get('/:id/deductions-preview', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const form16 = await Form16.findById(req.params.id);
    if (!form16) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, form16)) return res.status(403).json({ error: 'Forbidden' });

    // If already finalized, return the stored array — never re-merge.
    if (form16.isFinalized && form16.finalizedDeductions) {
      return res.json({ deductions: form16.finalizedDeductions, isFinalized: true });
    }

    // Aggregate deductions from all investment/insurance/loan/education records.
    const agg = await aggregateDeductions(form16.userId);
    const education = await EducationPayment.find({ memberId: form16.userId });
    const eduTuition = education.reduce(
      (s, e) => s + annualize(e.amount, e.frequency),
      0,
    );

    // Build the canonical context using the SAME logic as the recommendation flow.
    const ctx = fromForm16(form16, { recordsAgg: agg, eduTuition });

    res.json({ deductions: ctx.deductions, isFinalized: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/form16/upload — PDF -> Gemini extraction.
router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
    const b64 = req.file.buffer.toString('base64');
    const data = normalizeForm16(await extractForm16(b64));

    // Keep the same Form 16 identity for this user/FY so the stale hook marks
    // any cached recommendation stale. Uploading a replacement never deletes a
    // document before its linked recommendation can be invalidated.
    const updatePayload = {
      ...data,
      userId: req.user._id,
      sourceType: 'PDF',
      pdfReference: req.file.originalname,
      financialYear: '2025-26'
    };
    
    const doc = await Form16.findOneAndUpdate(
      { userId: req.user._id, financialYear: '2025-26' },
      {
        $set: { ...updatePayload, isFinalized: false, isEdited: false },
        $unset: { finalizedDeductions: 1 },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    
    const respBody = { _id: doc._id, sourceType: doc.sourceType };
    res.status(201).json(respBody);
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
    // -----------------------------------------------------------------
    // FINALIZATION GUARD (Final 3% Part 1):
    // When the user has clicked "Save and Continue" on the Review page,
    // form16.isFinalized is true and form16.finalizedDeductions holds
    // the exact DeductionLineItem array the user saw and approved.
    // In that case, pass a special sentinel to generateRecommendation so
    // computeTax reads from the stored array — never re-merges from records.
    // -----------------------------------------------------------------
    let agg;
    let eduTuition;
    let overrideDeductions = null;

    if (form16.isFinalized && form16.finalizedDeductions) {
      // Use the stored finalized deductions array directly.
      overrideDeductions = form16.finalizedDeductions;
      // Set agg + eduTuition to zero so generateRecommendation's fromForm16 call
      // produces only FormOCR items — which will then be replaced by the override.
      agg = { section80C: 0, section80CCD: 0, section80D: 0, section80E: 0, section24: 0, totalDeductions: 0 };
      eduTuition = 0;
    } else {
      agg = await aggregateDeductions(form16.userId);
      const education = await EducationPayment.find({ memberId: form16.userId });
      eduTuition = education.reduce(
        (s, e) => s + annualize(e.amount, e.frequency),
        0,
      );
    }

    const rec = await generateRecommendation(form16, financials, agg, eduTuition, overrideDeductions);

    // The breakdown is derived from the saved canonical Old-regime trace, not
    // from a separate aggregate. Therefore every displayed amount is present
    // in the calculation trace that produced the recommendation.
    const deductionBreakdown = (rec.regimes?.old?.deductions || [])
      .filter((d) => d.claimed > 0)
      .map((d) => ({ section: d.key, label: d.label, amount: d.claimed, note: d.note }));

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

// PATCH /api/form16/:id — finalization endpoint.
// Called by the Review page's "Save and Continue" button.
// Stores isFinalized=true and the complete finalizedDeductions array.
// Once stored, the recommendation flow reads exclusively from this array.
router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const doc = await Form16.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!ownsForm16(req, doc)) return res.status(403).json({ error: 'Forbidden' });
    if (req.body.isFinalized === true && req.body.finalizedDeductions) {
      doc.isFinalized = true;
      doc.finalizedDeductions = req.body.finalizedDeductions;
      doc.isEdited = true; // mark stale so recommendation is regenerated
    }
    await doc.save();
    res.json({ isFinalized: doc.isFinalized });
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



const PDFDocument = require('pdfkit');

// POST /api/form16/recommendation/pdf
router.post('/recommendation/pdf', (req, res, next) => {
  try {
    const data = req.body;
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="finstack-tax-summary.pdf"');
    doc.pipe(res);

    // Background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F5F0E8');

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#FFD700');
    doc.moveTo(0, 80).lineTo(doc.page.width, 80).lineWidth(3).stroke('#111111');
    
    doc.fillColor('#111111');
    doc.font('Helvetica-Bold').fontSize(24).text('FINSTACK', 40, 25);
    doc.fontSize(14).text('TAX RECOMMENDATION SUMMARY', 40, 28, { align: 'right' });
    doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, 40, 48, { align: 'right' });

    let y = 110;

    // Helper for section headers
    const sectionHeader = (title, yPos) => {
      doc.rect(40, yPos, doc.page.width - 80, 24).fill('#FFD700').stroke('#111111');
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(12).text(title.toUpperCase(), 48, yPos + 6);
      return yPos + 36;
    };

    y = sectionHeader('Income & Tax Summary', y);
    
    const trace = data.recommendedRegime === 'Old' ? data.regimes.old : data.regimes.new;
    if (trace) {
      doc.font('Helvetica-Bold').fontSize(10).text('Gross Income', 40, y);
      doc.font('Helvetica').text(`Rs. ${trace.grossIncome?.toLocaleString() || 0}`, 40, y + 14);

      doc.font('Helvetica-Bold').text('Total Deductions', 200, y);
      doc.font('Helvetica').text(`Rs. ${trace.totalDeductions?.toLocaleString() || 0}`, 200, y + 14);

      doc.font('Helvetica-Bold').text('Taxable Income', 360, y);
      doc.font('Helvetica').text(`Rs. ${trace.taxableIncome?.toLocaleString() || 0}`, 360, y + 14);

      y += 40;

      doc.font('Helvetica-Bold').text('Tax Liability', 40, y);
      doc.font('Helvetica').text(`Rs. ${trace.finalTax?.toLocaleString() || 0}`, 40, y + 14);

      doc.font('Helvetica-Bold').text('TDS Deducted', 200, y);
      doc.font('Helvetica').text(`Rs. ${trace.tdsDeducted?.toLocaleString() || 0}`, 200, y + 14);

      const balance = (trace.finalTax || 0) - (trace.tdsDeducted || 0) - (trace.advanceTax || 0) - (trace.selfAssessmentTax || 0);
      doc.font('Helvetica-Bold').text('Balance / Refund', 360, y);
      doc.font('Helvetica').text(`Rs. ${balance.toLocaleString()}`, 360, y + 14);
      
      y += 40;
    }

    if (data.deductionBreakdown && data.deductionBreakdown.length > 0) {
      y = sectionHeader('Deductions Breakdown', y);
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Section', 40, y);
      doc.text('Deduction Type', 120, y);
      doc.text('Amount', 450, y, { align: 'right' });
      y += 16;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).lineWidth(1).stroke('#111111');
      y += 8;

      doc.font('Helvetica');
      data.deductionBreakdown.forEach((d, i) => {
        if (i % 2 === 0) {
          doc.rect(40, y - 4, doc.page.width - 80, 20).fill('#E8E2D6');
          doc.fillColor('#111111');
        }
        doc.text(d.section || '', 45, y);
        doc.text(d.label || '', 125, y);
        if (d.amount) {
          doc.text(`Rs. ${d.amount.toLocaleString()}`, 445, y, { align: 'right' });
        }
        y += 20;
      });
      y += 20;
    }

    if (data.taxSavingSuggestions && data.taxSavingSuggestions.length > 0) {
      if (y > doc.page.height - 200) { doc.addPage(); doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F5F0E8'); y = 40; }
      y = sectionHeader('Recommendations & Suggestions', y);
      
      data.taxSavingSuggestions.forEach((s, idx) => {
        if (y > doc.page.height - 80) { doc.addPage(); doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F5F0E8'); y = 40; }
        doc.font('Helvetica-Bold').fontSize(11).text(`${idx + 1}. ${s.title}`, 40, y);
        if (s.potentialSaving) {
          doc.rect(doc.page.width - 140, y - 2, 100, 16).fill('#FFD700');
          doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9).text(`Save: Rs. ${s.potentialSaving.toLocaleString()}`, doc.page.width - 135, y + 2);
        }
        doc.fillColor('#111111');
        y += 16;
        doc.font('Helvetica').fontSize(10).text(s.detail, 55, y, { width: 400 });
        y += Math.ceil(doc.heightOfString(s.detail, { width: 400 })) + 12;
      });
    }

    // Footer
    const footerY = doc.page.height - 50;
    doc.moveTo(40, footerY).lineTo(doc.page.width - 40, footerY).lineWidth(1).stroke('#111111');
    doc.font('Helvetica').fontSize(9).text('This is an AI-generated summary for reference only.', 40, footerY + 10);
    doc.text(`FinStack © ${new Date().getFullYear()}`, 40, footerY + 10, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error('PDF Gen Error:', err);
    next(err);
  }
});

module.exports = router;
