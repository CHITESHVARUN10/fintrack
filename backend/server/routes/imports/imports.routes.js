const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { parseCSV, parseXLSX, hashFile, derivePeriod, rowHash } = require('../../services/import.service');
const { extractScreenshot } = require('../../services/ocr.service');
const { ingest } = require('../../services/transactionEngine.service');
const ImportBatch = require('../../models/importbatch.model');

const router = express.Router();
router.use(isAuthenticated);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15*1024*1024 } });

function requireFamily(req,res){ if(!req.user.familyAccountId){ res.status(400).json({ error:'Join or create a family first'}); return false } return true }

// GET /api/imports/history — recent batches for this family
router.get('/history', async (req, res, next) => {
  try{
    if(!requireFamily(req,res)) return;
    const batches = await ImportBatch.find({ familyId: req.user.familyAccountId }).sort({ createdAt: -1 }).limit(20).populate('createdBy', 'name email').lean();
    res.json({ batches });
  } catch(err){ next(err) }
});

// POST /api/imports/bank — CSV/XLSX
router.post('/bank', upload.single('file'), async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    if(!req.file) return res.status(400).json({ error:'file required' });
    const fHash = hashFile(req.file.buffer);
    const existing = await ImportBatch.findOne({ familyId: req.user.familyAccountId, fileHash: fHash }).lean();
    if(existing){
      return res.json({ status:'duplicate_file', duplicateOf: existing.batchId, fileName: req.file.originalname, fileHash: fHash, message: `Already imported on ${new Date(existing.createdAt).toLocaleString('en-IN')} — ${existing.total} rows`, batch: existing });
    }
    const isXlsx = req.file.originalname.toLowerCase().endsWith('.xlsx') || req.file.originalname.toLowerCase().endsWith('.xls');
    const candidates = isXlsx ? await parseXLSX(req.file.buffer) : parseCSV(req.file.buffer);
    if (candidates.length === 0) {
      const batchId = crypto.randomBytes(8).toString('hex');
      await ImportBatch.create({ familyId: req.user.familyAccountId, createdBy: req.user._id, batchId, source: 'BANK_STATEMENT', fileName: req.file.originalname, fileHash: fHash, fileSize: req.file.size, total: 0, failed: 0, status: 'failed' });
      return res.json({ batchId, total: 0, results: [], status: 'failed', message: 'No rows parsed — check file format/headers' });
    }
    const rh = rowHash(candidates);
    const rowDup = await ImportBatch.findOne({ familyId: req.user.familyAccountId, rowHash: rh }).lean();
    if(rowDup){
      return res.json({ status:'duplicate_file', duplicateOf: rowDup.batchId, fileName: req.file.originalname, fileHash: fHash, rowHash: rh, message: `Same transactions already imported on ${new Date(rowDup.createdAt).toLocaleString('en-IN')} — ${rowDup.total} rows (different file bytes)`, batch: rowDup });
    }
    const { periodFrom, periodTo } = derivePeriod(candidates);
    const batchId = crypto.randomBytes(8).toString('hex');
    const results=[];
    let created=0, reconciled=0, pendingReview=0, deduped=0, failed=0;
    for(const c of candidates){
      try{
        const cand = { ...c, category: c.category||'Other' };
        const r = await ingest(cand, { familyId: req.user.familyAccountId, createdBy: req.user._id, source:'BANK_STATEMENT', batchId, rawPayload: c.rawPayload });
        results.push({ ok:true, transactionId: r.transaction._id, status: r.transaction.status });
        if (r.deduped) deduped++;
        else if (r.pendingReview) pendingReview++;
        else if (r.reconciled) reconciled++;
        else created++;
      } catch(e){ results.push({ ok:false, error: e.message }); failed++; }
    }
    const status = failed === candidates.length ? 'failed' : failed > 0 ? 'partial' : 'success';
    await ImportBatch.create({ familyId: req.user.familyAccountId, createdBy: req.user._id, batchId, source: 'BANK_STATEMENT', fileName: req.file.originalname, fileHash: fHash, fileSize: req.file.size, rowHash: rh, periodFrom, periodTo, total: candidates.length, created, reconciled, pendingReview, deduped, failed, status });
    res.json({ batchId, total: candidates.length, results, status, periodFrom, periodTo, fileHash: fHash, summary: { created, reconciled, pendingReview, deduped, failed } });
  } catch(err){ next(err) }
});

// POST /api/imports/screenshot — image → Gemini
router.post('/screenshot', upload.single('file'), async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    if(!req.file) return res.status(400).json({ error:'file required'});
    const fHash = hashFile(req.file.buffer);
    const existingImg = await ImportBatch.findOne({ familyId: req.user.familyAccountId, fileHash: fHash }).lean();
    if(existingImg){
      return res.json({ status:'duplicate_file', duplicateOf: existingImg.batchId, message: `Same screenshot already imported on ${new Date(existingImg.createdAt).toLocaleString('en-IN')}`, batch: existingImg });
    }
    const batchId = crypto.randomBytes(8).toString('hex');
    const parsed = await extractScreenshot(req.file.buffer, req.file.mimetype);
    if(!parsed.amountPaise) {
      await ImportBatch.create({ familyId: req.user.familyAccountId, createdBy: req.user._id, batchId, source: 'SCREENSHOT', fileName: req.file.originalname, fileHash: fHash, fileSize: req.file.size, total: 1, failed: 1, status: 'failed' });
      return res.status(422).json({ error:'Could not extract amount from screenshot' });
    }
    const candidate = { amountPaise: parsed.amountPaise, occurredAt: parsed.occurredAt || new Date(), type:'EXPENSE', mode:'UPI', category:'Other', recipient: parsed.recipient, upiId: parsed.upiId, transactionIdExt: parsed.transactionIdExt, utr: parsed.utr, metadata:{ screenshot: true } };
    const result = await ingest(candidate, { familyId: req.user.familyAccountId, createdBy: req.user._id, source:'SCREENSHOT', rawPayload: parsed.raw, batchId });
    await ImportBatch.create({ familyId: req.user.familyAccountId, createdBy: req.user._id, batchId, source: 'SCREENSHOT', fileName: req.file.originalname, fileHash: fHash, fileSize: req.file.size, total: 1, created: result.created ? 1 : 0, reconciled: result.reconciled ? 1 : 0, pendingReview: result.pendingReview ? 1 : 0, deduped: result.deduped ? 1 : 0, failed: 0, status: 'success' });
    res.json({ batchId, parsed, ...result, status: 'success' });
  } catch(err){ next(err) }
});

// GET /api/imports/batches/:id
router.get('/batches/:id', async (req,res,next)=>{
  try{
    const batch = await ImportBatch.findOne({ batchId: req.params.id }).populate('createdBy','name email');
    if(!batch) return res.status(404).json({ error:'Batch not found' });
    res.json({ batch });
  } catch(err){ next(err) }
});

module.exports = router;
