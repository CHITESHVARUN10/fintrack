const express = require('express');
const Joi = require('joi');
const Transaction = require('../../models/transaction.model');
let SourceRecord;
try { SourceRecord = require('../../models/sourcerecord.model'); } catch {}
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { ingest, computeLedgerSummary } = require('../../services/transactionEngine.service');

const router = express.Router();
router.use(isAuthenticated);

function requireFamily(req, res) {
  if (!req.user.familyAccountId) { res.status(400).json({ error: 'Join or create a family first' }); return false; }
  return true;
}

// GET /api/transactions
router.get('/', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const familyView = req.query.familyView === 'true';
    const filter = { familyId: req.user.familyAccountId, status: { $ne: 'VOIDED' } };
    if (!familyView) filter.createdBy = req.user._id;
    else if (req.query.memberId) filter.createdBy = req.query.memberId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.mode) filter.mode = req.query.mode;
    if (req.query.vendor) {
      const v = String(req.query.vendor).trim();
      // case-insensitive substring on recipient.name or upiId/utr
      filter.$or = [
        { 'recipient.name': { $regex: v, $options: 'i' } },
        { upiId: { $regex: v, $options: 'i' } },
        { utr: { $regex: v, $options: 'i' } },
      ];
    }
    if (req.query.minAmountPaise || req.query.maxAmountPaise) {
      filter.amountPaise = {};
      if (req.query.minAmountPaise) filter.amountPaise.$gte = Number(req.query.minAmountPaise);
      if (req.query.maxAmountPaise) filter.amountPaise.$lte = Number(req.query.maxAmountPaise);
    }
    if (req.query.from || req.query.to) {
      filter.occurredAt = {};
      if (req.query.from) filter.occurredAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        // inclusive end-of-day when only date part
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setHours(23,59,59,999);
        filter.occurredAt.$lte = to;
      }
    }
    const items = await Transaction.find(filter).sort({ occurredAt: -1 }).limit(500).populate('createdBy', 'name email').populate('familyTransfer.fromUserId', 'name email').populate('familyTransfer.toUserId', 'name email').lean();
    const summary = computeLedgerSummary(items);
    res.json({ items, summary });
  } catch (err) { next(err); }
});

// GET /api/transactions/compare?ids=id1,id2
router.get('/compare', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 4);
    if (ids.length < 2) return res.status(400).json({ error: 'Provide at least 2 ids' });
    const items = await Transaction.find({ _id: { $in: ids }, familyId: req.user.familyAccountId }).populate('createdBy', 'name email').lean();
    const sourcesByTx = {};
    for (const t of items) {
      sourcesByTx[String(t._id)] = await SourceRecord.find({ transactionId: t._id }).lean();
    }
    res.json({ items, sourcesByTx });
  } catch (err) { next(err); }
});

// GET /api/transactions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.id).populate('createdBy', 'name email').populate('familyTransfer.fromUserId', 'name email').populate('familyTransfer.toUserId', 'name email');
    if (!tx) return res.status(404).json({ error: 'Not found' });
    if (String(tx.familyId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Forbidden' });
    const sources = await SourceRecord.find({ transactionId: tx._id });
    let candidateOfTx = null;
    if (tx.candidateOf) {
      candidateOfTx = await Transaction.findById(tx.candidateOf).populate('createdBy', 'name email').lean();
    }
    res.json({ transaction: tx, sources, candidateOfTx });
  } catch (err) { next(err); }
});

// POST /api/transactions — manual ingest
router.post('/', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const schema = Joi.object({
      amountPaise: Joi.number().integer().min(1).required(),
      type: Joi.string().valid('EXPENSE','INCOME','INTERNAL_TRANSFER','CASH_WITHDRAWAL','CASH_EXPENSE').required(),
      mode: Joi.string().valid('UPI','BANK','CASH','CARD','OTHER').default('OTHER'),
      occurredAt: Joi.date().required(),
      category: Joi.string().allow('', null),
      recipient: Joi.object({ name: Joi.string().allow('', null), upiId: Joi.string().allow('', null) }).allow(null),
      sender: Joi.object({ name: Joi.string().allow('', null), upiId: Joi.string().allow('', null) }).allow(null),
      familyTransfer: Joi.object({ fromUserId: Joi.string().allow(null), toUserId: Joi.string().required() }).allow(null),
      cashLeg: Joi.object({ from: Joi.string().valid('BANK','CASH'), to: Joi.string().valid('BANK','CASH') }).allow(null),
      visibility: Joi.string().valid('FAMILY','PRIVATE').default('FAMILY'),
      upiId: Joi.string().allow('', null),
      transactionIdExt: Joi.string().allow('', null),
      utr: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error.details.map(d=> d.message) });
    const candidate = { ...value, occurredAt: new Date(value.occurredAt) };
    if (candidate.type==='INTERNAL_TRANSFER' && candidate.familyTransfer?.toUserId) {
      candidate.familyTransfer.fromUserId = req.user._id;
    }
    const result = await ingest(candidate, { familyId: req.user.familyAccountId, createdBy: req.user._id, source: 'MANUAL', rawPayload: req.body });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// PATCH /api/transactions/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Not found' });
    if (String(tx.createdBy) !== String(req.user._id) && req.user.role!=='admin') return res.status(403).json({ error: 'Forbidden' });
    const allowed = ['category','mode','type','visibility','recipient','sender'];
    for (const k of allowed) if (req.body[k]!==undefined) tx[k]=req.body[k];
    await tx.save();
    res.json({ transaction: tx });
  } catch (err) { next(err); }
});

// POST /api/transactions/:id/resolve — PENDING_REVIEW → merge or keepSeparate
router.post('/:id/resolve', async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Not found' });
    if (tx.status!=='PENDING_REVIEW') return res.status(400).json({ error: 'Not pending review' });
    const action = req.body.action;
    if (action==='keepSeparate') {
      tx.status='ACTIVE'; tx.candidateOf=undefined; await tx.save(); return res.json({ transaction: tx });
    }
    if (action==='merge') {
      const targetId = req.body.targetId || tx.candidateOf;
      if (!targetId) return res.status(400).json({ error: 'targetId required' });
      const target = await Transaction.findById(targetId);
      if (!target) return res.status(404).json({ error: 'Target not found' });
      // Move source records to target
      await SourceRecord.updateMany({ transactionId: tx._id }, { transactionId: target._id });
      const srs = await SourceRecord.find({ transactionId: target._id });
      target.sourceIds = srs.map(s=> s._id);
      target.mergedFrom = [...(target.mergedFrom||[]), tx._id];
      target.status='RECONCILED';
      await target.save();
      tx.status='VOIDED'; await tx.save();
      return res.json({ transaction: target, voided: tx._id });
    }
    return res.status(400).json({ error: 'action must be merge or keepSeparate' });
  } catch (err) { next(err); }
});

module.exports = router;
