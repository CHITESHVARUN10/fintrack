const express = require('express');
const Joi = require('joi');
const Transaction = require('../../models/transaction.model');
let SourceRecord;
try { SourceRecord = require('../../models/sourcerecord.model'); } catch {}
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { ingest, computeLedgerSummary } = require('../../services/transactionEngine.service');
const { canModify } = require('../../utils/scope');

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
    else {
      if (req.query.memberId) {
        // only admin can filter by other member
        if (String(req.query.memberId) !== String(req.user._id) && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Only admin can filter by member' });
        }
        filter.createdBy = req.query.memberId;
      }
      // hide PRIVATE transactions from other members in family view (completely invisible)
      filter.$and = [{ $or: [{ visibility: { $ne: 'PRIVATE' } }, { createdBy: req.user._id }] }];
    }
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
    if (req.query.loanRef) {
      filter.loanRef = req.query.loanRef;
    }
    if (req.query.subscriptionRef) {
      filter.subscriptionRef = req.query.subscriptionRef;
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
    const items = await Transaction.find(filter).sort({ occurredAt: -1 }).limit(500).populate('createdBy', 'name email').populate('familyTransfer.fromUserId', 'name email').populate('familyTransfer.toUserId', 'name email').populate('subscriptionRef').populate('loanRef').lean();
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
      const tx = await Transaction.findById(req.params.id).populate('createdBy', 'name email').populate('familyTransfer.fromUserId', 'name email').populate('familyTransfer.toUserId', 'name email').populate('recipientVendorRef').populate('subscriptionRef').populate('loanRef');
      if (!tx) return res.status(404).json({ error: 'Not found' });
      if (String(tx.familyId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Forbidden' });
      if (tx.visibility === 'PRIVATE' && String(tx.createdBy?._id || tx.createdBy) !== String(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Private transaction' });
      }
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
        subcategory: Joi.string().allow('', null),
        productName: Joi.string().allow('', null),
        productRef: Joi.string().allow('', null),
        subscriptionRef: Joi.string().allow('', null),
        loanRef: Joi.string().allow('', null),
        loanMeta: Joi.object({ isLoanPayment: Joi.boolean().allow(null), isPrepayment: Joi.boolean().allow(null) }).allow(null),
        categorySplit: Joi.array().items(Joi.object({ category: Joi.string().required(), amountPaise: Joi.number().integer().min(1).required() })).allow(null),
        lineItems: Joi.array().items(Joi.object({
          productName: Joi.string().allow('', null),
          productRef: Joi.string().allow('', null),
          category: Joi.string().allow('', null),
          subcategory: Joi.string().allow('', null),
          quantity: Joi.number().allow(null),
          unit: Joi.string().allow('', null),
          amountPaise: Joi.number().integer().min(1).required(),
        })).allow(null),
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

// POST /api/transactions/bulk-categorize — categorize Other transactions using CategoryEngine (BHIM-like)
router.post('/bulk-categorize', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const { dryRun = false, confidenceThreshold = 30, limit = 200, familyView = true } = req.body || {};
    const threshold = Math.max(0, Math.min(100, Number(confidenceThreshold) || 30));
    const lim = Math.min(500, Math.max(1, Number(limit) || 200));
    // build filter for Other category
    const filter = {
      familyId: req.user.familyAccountId,
      status: { $ne: 'VOIDED' },
      $and: [
        { $or: [{ category: 'Other' }, { category: '' }, { category: { $exists: false } }, { category: null }] },
        { $or: [{ visibility: { $ne: 'PRIVATE' } }, { createdBy: req.user._id }] },
      ],
    };
    // if not familyView and not admin, only own Others
    const doFamily = familyView === true || familyView === 'true';
    if (!doFamily) {
      filter.createdBy = req.user._id;
      // remove the visibility $or and keep only category $or, since we already filter by own
      filter.$and = [{ $or: [{ category: 'Other' }, { category: '' }, { category: { $exists: false } }, { category: null }] }];
    } else if (req.body.memberId && String(req.body.memberId) !== String(req.user._id)) {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admin can bulk categorize for other member' });
      filter.createdBy = req.body.memberId;
    }
    const items = await Transaction.find(filter).sort({ occurredAt: -1 }).limit(lim).lean();
    const { predictCategory } = require('../../services/categoryEngine.service');
    const { normalizeVendorKey } = require('../../services/recipient.service');
    let updated = 0;
    let stillOther = 0;
    const details = [];
    for (const tx of items) {
      const vk = normalizeVendorKey(tx.recipient?.name || '', tx.upiId || tx.recipient?.upiId || '');
      const upiId = tx.upiId || tx.recipient?.upiId || '';
      const description = tx.recipient?.name || '';
      try {
        const pred = await predictCategory({ familyId: tx.familyId, vendorKey: vk, upiId, amountPaise: tx.amountPaise, description });
        if (pred.category && pred.category !== 'Other' && pred.confidence >= threshold) {
          details.push({ id: tx._id, oldCategory: tx.category || 'Other', newCategory: pred.category, confidence: pred.confidence, rule: pred.rule, amount: tx.amountPaise });
          if (!dryRun) {
            await Transaction.updateOne({ _id: tx._id }, { $set: { category: pred.category, subcategory: pred.subcategory || undefined, metadata: { ...(tx.metadata || {}), bulkCategorized: true, bulkCategoryConfidence: pred.confidence, bulkCategoryRule: pred.rule, bulkCategoryTrace: pred.trace } } });
            // also teach vendor directory for future
            try {
              const { upsertFromCategory } = require('../../services/recipient.service');
              const label = tx.recipient?.name || upiId || vk;
              await upsertFromCategory({ familyId: tx.familyId, vendorKey: vk, upiId, label, categories: [pred.category], amountPaise: tx.amountPaise }).catch(() => {});
            } catch {}
          }
          updated++;
        } else {
          stillOther++;
          details.push({ id: tx._id, oldCategory: tx.category || 'Other', newCategory: 'Other', confidence: pred.confidence || 0, rule: pred.rule || 'none', amount: tx.amountPaise });
        }
      } catch (e) {
        stillOther++;
      }
    }
    // if dryRun, don't count as updated for stillOther? already handled
    const scanned = items.length;
    res.json({ scanned, updated, stillOther, dryRun: !!dryRun, threshold, details: details.slice(0, 50) });
  } catch (err) { next(err); }
});

  // PATCH /api/transactions/:id
  router.patch('/:id', async (req, res, next) => {
    try {
      const tx = await Transaction.findById(req.params.id);
      if (!tx) return res.status(404).json({ error: 'Not found' });
      if (String(tx.createdBy) !== String(req.user._id) && req.user.role!=='admin') return res.status(403).json({ error: 'Forbidden' });
      // Validate subscriptionRef belongs to same family if provided
      if (req.body.subscriptionRef) {
        const Subscription = require('../../models/subscription.model');
        const sub = await Subscription.findById(req.body.subscriptionRef);
        if (!sub) return res.status(400).json({ error: 'Subscription not found' });
        if (String(sub.familyAccountId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Subscription not in family' });
      }
      if (req.body.loanRef) {
        const EMILoan = require('../../models/loan.model');
        const loan = await EMILoan.findById(req.body.loanRef);
        if (!loan) return res.status(400).json({ error: 'Loan not found' });
        if (String(loan.familyAccountId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Loan not in family' });
        if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden loan' });
        if (!req.body.loanMeta) req.body.loanMeta = { isLoanPayment: true, isPrepayment: false };
      }
      if (req.body.subscriptionRef === '' || req.body.subscriptionRef === null) req.body.subscriptionRef = null;
      if (req.body.loanRef === '' || req.body.loanRef === null) req.body.loanRef = null;
      const allowed = ['category','subcategory','productName','productRef','subscriptionRef','loanRef','loanMeta','categorySplit','lineItems','mode','type','visibility','recipient','sender','recipientVendorRef'];
      for (const k of allowed) if (req.body[k]!==undefined) tx[k]=req.body[k] || null;
    // if category changed, also learn vendor directory
    try{
      if (req.body.category && req.body.category!=='Other' && tx.recipientVendorRef){
        const RecipientDirectory = require('../../models/recipientdirectory.model');
        const vendor = await RecipientDirectory.findById(tx.recipientVendorRef);
        if (vendor){
          const cats = [req.body.category];
          const { upsertFromCategory } = require('../../services/recipient.service');
          await upsertFromCategory({ familyId: vendor.familyId, vendorKey: vendor.vendorKey, upiId: vendor.upiId, label: vendor.label, categories: cats, amountPaise: tx.amountPaise });
        }
      }
      // if product info changed, upsert product
      if ((req.body.productName || (req.body.lineItems && req.body.lineItems.length)) && tx.recipientVendorRef){
        const RecipientDirectory = require('../../models/recipientdirectory.model');
        const vendor = await RecipientDirectory.findById(tx.recipientVendorRef);
        if (vendor){
          const { upsertProduct } = require('../../services/recipient.service');
          if (req.body.productName){
            await upsertProduct({ familyId: vendor.familyId, vendorKey: vendor.vendorKey, upiId: vendor.upiId, label: vendor.label, product: { name: req.body.productName, category: req.body.category || vendor.primaryCategory, subcategory: req.body.subcategory||'', typicalAmountPaise: tx.amountPaise } });
          }
          if (req.body.lineItems){
            for(const li of req.body.lineItems){
              if(li.productName) await upsertProduct({ familyId: vendor.familyId, vendorKey: vendor.vendorKey, upiId: vendor.upiId, label: vendor.label, product: { name: li.productName, category: li.category||req.body.category||vendor.primaryCategory, subcategory: li.subcategory||'', typicalAmountPaise: li.amountPaise } });
            }
          }
        }
      }
    } catch(e){ console.warn('[patch vendor learn]', e.message); }
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
