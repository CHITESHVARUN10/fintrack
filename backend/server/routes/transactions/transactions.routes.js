const express = require('express');
const { ledgerDateRange } = require('../../utils/ledgerDates');
const Joi = require('joi');
const { isObjectIdOrHexString } = require('mongoose');
const Investment = require('../../models/investment.model');
const Income = require('../../models/income.model');
const { activeOffsets, registerOffsetRoutes } = require('../../services/transactionOffsets');
const { findStockSuggestions } = require('../../services/stockLinkSuggestions');
const { transactionCounterparty } = require('../../utils/vendorDisplayName');
const Transaction = require('../../models/transaction.model');
let SourceRecord;
try { SourceRecord = require('../../models/sourcerecord.model'); } catch {}
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { ingest, computeLedgerSummary } = require('../../services/transactionEngine.service');
const { canModify, canModifyTransaction, buildTransactionVisibilityFilter } = require('../../utils/scope');

const router = express.Router();
const manualSubmissions = new Map();
router.use(isAuthenticated);
registerOffsetRoutes(router);

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
      // Other members' rows require a month they have explicitly shared, and
      // PRIVATE rows stay hidden even inside a shared month.
      filter.$and = [await buildTransactionVisibilityFilter(req, { familyId: req.user.familyAccountId })];
    }
    if (req.query.type) filter.type = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.mode) filter.mode = req.query.mode;
    if (req.query.vendor || req.query.vendorId) {
      const q = String(req.query.vendor || '').trim().slice(0, 120);
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escaped, $options: 'i' };
      const lookup = escaped ? ['recipient.name', 'recipient.upiId', 'sender.name', 'sender.upiId', 'upiId', 'utr']
        .map(field => ({ [field]: regex })) : [];
      if (isObjectIdOrHexString(req.query.vendorId)) lookup.push({ recipientVendorRef: req.query.vendorId });
      if (lookup.length) filter.$or = lookup;
    }
    if (req.query.subscriptionRef) {
      filter.subscriptionRef = req.query.subscriptionRef;
    }
    if (req.query.minAmountPaise || req.query.maxAmountPaise) {
      filter.amountPaise = {};
      if (req.query.minAmountPaise) filter.amountPaise.$gte = Number(req.query.minAmountPaise);
      if (req.query.maxAmountPaise) filter.amountPaise.$lte = Number(req.query.maxAmountPaise);
    }
    const range = ledgerDateRange(req.query.from, req.query.to);
    if (range?.error) return res.status(400).json(range);
    if (range) filter.occurredAt = range;
    const pageParam = req.query.page;
    const paginated = pageParam !== undefined || req.query.limit !== undefined;
    const limit = Math.min(
      200,
      Math.max(1, Number(req.query.limit) || (paginated ? 50 : 500)),
    );
    const page = Math.max(1, Number(pageParam) || 1);
    const skip = paginated ? (page - 1) * limit : 0;

    const [total, items, offsets] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter)
        .sort({ occurredAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name email')
        .populate('familyTransfer.fromUserId', 'name email')
        .populate('familyTransfer.toUserId', 'name email')
        .populate('subscriptionRef')
        .populate('recipientVendorRef', 'label upiId')
        .lean(),
      activeOffsets(req.user.familyAccountId, familyView ? undefined : req.user._id),
    ]);

    // The summary covers every matching row, not just the current page, so the
    // header totals stay correct while the list is paginated. Only the first
    // page computes it.
    let summary = {};
    if (!paginated || page === 1) {
      const all = limit >= total ? items : await Transaction.find(filter).select('amountPaise type status').lean();
      summary = computeLedgerSummary(all, offsets);
    }

    res.json({
      items: items.map(tx => ({
        ...tx,
        counterpartyName: transactionCounterparty(tx),
        ...(offsets.has(String(tx._id)) ? { isOffset: true } : {}),
      })),
      summary,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    });
  } catch (err) { next(err); }
});

// GET /api/transactions/compare?ids=id1,id2
router.get('/compare', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 4);
    if (ids.length < 2) return res.status(400).json({ error: 'Provide at least 2 ids' });
    const visibility = await buildTransactionVisibilityFilter(req);
    const items = await Transaction.find({ _id: { $in: ids }, familyId: req.user.familyAccountId, ...visibility }).populate('createdBy', 'name email').lean();
    const sourcesByTx = {};
    for (const t of items) {
      sourcesByTx[String(t._id)] = await SourceRecord.find({ transactionId: t._id }).lean();
    }
    res.json({ items, sourcesByTx });
  } catch (err) { next(err); }
});

  // GET /api/transactions/duplicate-groups — automatic suspected-duplicate finder.
  // Groups non-voided transactions by type+amountPaise with occurredAt within
  // a 2-day window (mirrors ingest reconciliation window), and annotates
  // members that the engine already linked via candidateOf.
router.get('/duplicate-groups', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const familyView = req.query.familyView !== 'false';
    const filter = { familyId: req.user.familyAccountId, status: { $ne: 'VOIDED' } };
    if (!familyView) {
      filter.createdBy = req.user._id;
    } else {
      filter.$and = [await buildTransactionVisibilityFilter(req)];
    }
    if (req.query.from || req.query.to) {
      filter.occurredAt = {};
      if (req.query.from) filter.occurredAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setHours(23, 59, 59, 999);
        filter.occurredAt.$lte = to;
      }
    }
    const offsets = await activeOffsets(req.user.familyAccountId, familyView ? undefined : req.user._id);
    filter._id = { $nin: [...offsets.keys()] };
    const items = await Transaction.find(filter).sort({ occurredAt: -1 }).limit(1000)
      .populate('recipientVendorRef', 'label upiId').lean();
    items.reverse();
    const WINDOW_MS = 2 * 86400000;
    const byKey = new Map();
    for (const t of items) {
      const key = `${t.type}:${t.amountPaise}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(t);
    }
    const groups = [];
    for (const [key, arr] of byKey.entries()) {
      if (arr.length < 2) continue;
      let cluster = [arr[0]];
      const flush = () => {
        if (cluster.length > 1) {
          const linked = cluster.filter((t) => t.candidateOf).length;
          groups.push({
            key,
            type: cluster[0].type,
            amountPaise: cluster[0].amountPaise,
            reason: linked > 0 ? 'CANDIDATE_LINK' : 'AMOUNT_WINDOW',
            items: cluster.map((t) => ({
              _id: String(t._id),
              amountPaise: t.amountPaise,
              type: t.type,
              mode: t.mode,
              occurredAt: t.occurredAt,
              status: t.status,
              candidateOf: t.candidateOf ? String(t.candidateOf) : undefined,
              recipient: transactionCounterparty(t),
            })),
          });
        }
        cluster = [];
      };
      for (let i = 1; i < arr.length; i++) {
        const gap = new Date(arr[i].occurredAt).getTime() - new Date(cluster[cluster.length - 1].occurredAt).getTime();
        if (gap <= WINDOW_MS) {
          cluster.push(arr[i]);
        } else {
          flush();
          cluster = [arr[i]];
        }
      }
      flush();
    }
    groups.sort((a, b) => b.items.length - a.items.length);
    res.json({ groups: groups.slice(0, 50), scanned: items.length });
  } catch (err) { next(err); }
});

// GET /api/transactions/investment-suggestions — suggestions for the owner's ledger.
router.get('/investment-suggestions', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const from = req.query.from && new Date(req.query.from);
    const to = req.query.to && new Date(req.query.to);
    if ((from && Number.isNaN(+from)) || (to && Number.isNaN(+to)) || (from && to && from > to)) {
      return res.status(400).json({ error: 'Choose a valid date range' });
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) to.setUTCHours(23, 59, 59, 999);
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const result = await findStockSuggestions({
      familyId: req.user.familyAccountId, ownerId: req.user._id, from, to, page,
    });
    res.json(result);
  } catch (err) { next(err); }
});

  // GET /api/transactions/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const tx = await Transaction.findById(req.params.id).populate('createdBy', 'name email').populate('familyTransfer.fromUserId', 'name email').populate('familyTransfer.toUserId', 'name email').populate('recipientVendorRef').populate('subscriptionRef');
      if (!tx) return res.status(404).json({ error: 'Not found' });
      if (String(tx.familyId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Forbidden' });
      const visibility = await buildTransactionVisibilityFilter(req, { familyId: tx.familyId });
      const visible = await Transaction.exists({ _id: tx._id, ...visibility });
      if (!visible) return res.status(403).json({ error: 'This transaction is not visible to you' });
      const canModify = canModifyTransaction(req, tx);
      const recordModel = tx.financeLink?.resource === 'investments' ? Investment : Income;
      const [sources, offsets, financeRecord] = await Promise.all([
        SourceRecord.find({ transactionId: tx._id }),
        activeOffsets(tx.familyId, tx.createdBy?._id),
        tx.financeLink && canModify
          ? recordModel.findOne({ _id: tx.financeLink.recordId, familyAccountId: tx.familyId, memberId: tx.createdBy?._id })
            .select('assetName stockName ticker fundName title').lean()
          : null,
      ]);
      const offset = offsets.get(String(tx._id));
      let counterEntries = [];
      if (offset && canModify) {
        const others = offset.transactionIds.filter(id => String(id) !== String(tx._id));
        const rows = await Transaction.find({ _id: { $in: others }, familyId: tx.familyId, createdBy: req.user._id })
          .select('type amountPaise occurredAt sender recipient mode recipientVendorRef')
          .populate('recipientVendorRef', 'label upiId').sort({ occurredAt: 1, _id: 1 }).lean();
        counterEntries = rows.map(row => ({ ...row, counterpartyName: transactionCounterparty(row) }));
      }
      let candidateOfTx = null;
      if (tx.candidateOf) {
        const visibility = await buildTransactionVisibilityFilter(req);
        candidateOfTx = await Transaction.findOne({ _id: tx.candidateOf, familyId: req.user.familyAccountId, ...visibility }).populate('createdBy', 'name email').lean();
      }
      res.json({
        transaction: { ...tx.toObject(), counterpartyName: transactionCounterparty(tx), ...(offset ? { isOffset: true } : {}) },
        sources, candidateOfTx, canModify,
        ...(financeRecord ? { financeRecordName: financeRecord.stockName || financeRecord.assetName ||
          financeRecord.fundName || financeRecord.title || financeRecord.ticker } : {}),
        ...(offset && counterEntries.length ? { offset: {
          purpose: offset.purpose, kind: offset.kind || 'general',
          transaction: counterEntries[0], transactions: counterEntries,
        } } : {}),
      });
    } catch (err) { next(err); }
  });

// POST /api/transactions — manual ingest
  router.post('/', async (req, res, next) => {
    try {
      if (!requireFamily(req, res)) return;
      const schema = Joi.object({
        submissionId: Joi.string().uuid().optional(),
        amountPaise: Joi.number().integer().min(1).required(),
        type: Joi.string().valid('EXPENSE','INCOME','INTERNAL_TRANSFER','CASH_WITHDRAWAL','CASH_EXPENSE').required(),
        mode: Joi.string().valid('UPI','BANK','CASH','CARD','OTHER').default('OTHER'),
        occurredAt: Joi.date().required(),
        category: Joi.string().allow('', null),
        subcategory: Joi.string().allow('', null),
        productName: Joi.string().allow('', null),
        productRef: Joi.string().allow('', null),
        subscriptionRef: Joi.string().allow('', null),
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
        origin: Joi.string().valid('MANUAL','QR_SCAN').default('MANUAL'),
        metadata: Joi.object().unknown(true).allow(null),
        upiId: Joi.string().allow('', null),
        transactionIdExt: Joi.string().allow('', null),
        utr: Joi.string().allow('', null),
      });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: 'Validation failed', details: error.details.map(d=> d.message) });
    for (const [field, model] of [['subscriptionRef', '../../models/subscription.model']]) {
      if (value[field]) {
        const linked = await require(model).findById(value[field]);
        if (!linked || !canModify(req, linked)) return res.status(403).json({ error: 'Forbidden linked record' });
      }
    }
    if (value.familyTransfer?.toUserId) {
      const member = await require('../../models/user.model').exists({ _id: value.familyTransfer.toUserId, familyAccountId: req.user.familyAccountId, isActive: true });
      if (!member || String(value.familyTransfer.toUserId) === String(req.user._id)) return res.status(400).json({ error: 'Choose another active member of your family' });
    }
    const { submissionId, ...fields } = value;
    const origin = fields.origin || 'MANUAL';
    const candidate = {
      ...fields,
      occurredAt: new Date(value.occurredAt),
      metadata: {
        ...(value.metadata || {}),
        origin,
        ...(origin === 'QR_SCAN' ? { timePrecision: 'minute' } : {}),
      },
    };
    if (candidate.type==='INTERNAL_TRANSFER' && candidate.familyTransfer?.toUserId) {
      candidate.familyTransfer.fromUserId = req.user._id;
    }
    const context = { familyId: req.user.familyAccountId, createdBy: req.user._id, source: origin, rawPayload: req.body };
    if (!submissionId || origin !== 'MANUAL') return res.status(201).json(await ingest(candidate, context));

    // Persist the submission key on its source so a retry after a lost
    // response still finds the recorded entry. Concurrent requests in this
    // process share the same write, including reconciliation and vendor work.
    const requestId = submissionId.toLowerCase();
    const key = `${context.familyId}:${context.createdBy}:${requestId}`;
    let submission = manualSubmissions.get(key);
    if (!submission) {
      submission = (async () => {
        const sourceRecord = await SourceRecord.findOne({
          familyId: context.familyId, createdBy: context.createdBy, source: origin, 'rawPayload.submissionId': requestId,
        });
        if (sourceRecord) {
          const transaction = await Transaction.findById(sourceRecord.transactionId);
          if (!transaction) throw Object.assign(new Error('The recorded transaction could not be found'), { status: 409 });
          return { transaction, sourceRecord, deduped: true };
        }
        return ingest(candidate, { ...context, rawPayload: { ...req.body, submissionId: requestId } });
      })().finally(() => manualSubmissions.delete(key));
      manualSubmissions.set(key, submission);
    }
    res.status(201).json(await submission);
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
      financeLink: null,
      $and: [
        { $or: [{ category: 'Other' }, { category: '' }, { category: { $exists: false } }, { category: null }] },
      ],
    };
    // if not familyView and not admin, only own Others
    // Categorization changes transactions, so it is always creator-scoped.
    const doFamily = false;
    if (!doFamily) {
      filter.createdBy = req.user._id;
      // keep only the category clause, since we already filter by own
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
      const description = tx.recipient?.name || tx.sender?.name || '';
      try {
        const pred = await predictCategory({ familyId: tx.familyId, vendorKey: vk, upiId, amountPaise: tx.amountPaise, description, type: tx.type });
        if (pred.category && pred.category !== 'Other' && pred.confidence >= threshold) {
          details.push({ id: tx._id, oldCategory: tx.category || 'Other', newCategory: pred.category, confidence: pred.confidence, rule: pred.rule, amount: tx.amountPaise });
          if (!dryRun) {
            const updateDoc = {
              category: pred.category,
              subcategory: pred.subcategory || undefined,
              metadata: {
                ...(tx.metadata || {}),
                bulkCategorized: true,
                bulkCategoryConfidence: pred.confidence,
                bulkCategoryRule: pred.rule,
                bulkCategoryTrace: pred.trace,
              },
            };
            if (pred.subscriptionRef && !tx.subscriptionRef) {
              updateDoc.subscriptionRef = pred.subscriptionRef;
            }
            const change = await Transaction.updateOne({ _id: tx._id, financeLink: null }, { $set: updateDoc });
            if (!change.modifiedCount) continue;
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

  // Keep statement source records intact when correcting or voiding a ledger entry.
  router.patch('/:id/correction', async (req, res, next) => {
    try {
      if (!isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Transaction not found' });
      const tx = await Transaction.findById(req.params.id).lean();
      if (!tx || !canModifyTransaction(req, tx)) return res.status(404).json({ error: 'Transaction not found' });
      const { error, value } = Joi.object({
        amountPaise: Joi.number().integer().min(1),
        occurredAt: Joi.date().iso(),
        void: Joi.boolean().valid(true),
      }).or('amountPaise', 'occurredAt', 'void').validate(req.body);
      if (error) return res.status(400).json({ error: 'Enter a positive amount and a valid date.' });
      if (tx.status === 'VOIDED' && value.void) return res.json({ transaction: tx });
      if (!['ACTIVE', 'RECONCILED'].includes(tx.status)) {
        return res.status(409).json({ error: 'Settle this transaction before correcting it.' });
      }
      if (tx.financeLink || tx.subscriptionRef) {
        return res.status(409).json({ error: 'Unlink this transaction before correcting or voiding it.' });
      }
      const TransactionOffset = require('../../models/transactionoffset.model');
      if (await TransactionOffset.exists({ familyId: tx.familyId, ownerId: tx.createdBy, transactionIds: tx._id })) {
        return res.status(409).json({ error: 'Remove the offset group before correcting or voiding this entry.' });
      }
      if (!value.void && value.amountPaise != null && value.amountPaise !== tx.amountPaise &&
          (tx.lineItems?.length || tx.categorySplit?.length)) {
        return res.status(409).json({ error: 'This entry has split amounts. Update the split before changing the total.' });
      }
      const changes = value.void ? { status: 'VOIDED' } : {
        amountPaise: value.amountPaise ?? tx.amountPaise,
        occurredAt: value.occurredAt ?? tx.occurredAt,
      };
      const updated = await Transaction.findOneAndUpdate({
        _id: tx._id, updatedAt: tx.updatedAt, status: tx.status, financeLink: null, subscriptionRef: null,
      }, {
        $set: changes,
        $push: { 'metadata.corrections': {
          at: new Date(), by: req.user._id, amountPaise: tx.amountPaise, occurredAt: tx.occurredAt, status: tx.status,
        } },
      }, { returnDocument: 'after' });
      if (!updated) return res.status(409).json({ error: 'This entry changed. Reload it and try again.' });
      res.json({ transaction: updated });
    } catch (err) { next(err); }
  });

  // PATCH /api/transactions/:id
  router.patch('/:id', async (req, res, next) => {
    try {
      const tx = await Transaction.findById(req.params.id);
      if (!tx) return res.status(404).json({ error: 'Not found' });
      if (!canModifyTransaction(req, tx)) return res.status(403).json({ error: 'Forbidden' });
      if (tx.status === 'VOIDED') return res.status(409).json({ error: 'This transaction has been voided.' });
      if (tx.financeLink && (
        ['category', 'subcategory', 'type'].some(field => Object.hasOwn(req.body, field) &&
          (req.body[field] || null) !== (tx[field] || null)) || req.body.subscriptionRef
      )) {
        return res.status(409).json({ error: 'Unlink this transaction from its investment or income source before reclassifying it' });
      }
      if (Object.hasOwn(req.body, 'type') && req.body.type !== tx.type) {
        const offsets = await activeOffsets(tx.familyId, req.user._id);
        if (offsets.has(String(tx._id))) return res.status(409).json({ error: 'Remove the offset before changing the transaction type' });
      }
      // Validate subscriptionRef belongs to same family if provided
      if (req.body.subscriptionRef) {
        const Subscription = require('../../models/subscription.model');
        const sub = await Subscription.findById(req.body.subscriptionRef);
        if (!sub) return res.status(400).json({ error: 'Subscription not found' });
        if (String(sub.familyAccountId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Subscription not in family' });
      }
      if (req.body.recipientVendorRef) {
        const vendor = await require('../../models/recipientdirectory.model').findById(req.body.recipientVendorRef);
        if (!vendor || String(vendor.familyId) !== String(req.user.familyAccountId)) return res.status(403).json({ error: 'Vendor not in family' });
      }
      if (req.body.subscriptionRef === '' || req.body.subscriptionRef === null) req.body.subscriptionRef = null;
      const allowed = ['category','subcategory','productName','productRef','subscriptionRef','categorySplit','lineItems','mode','type','visibility','recipient','sender','recipientVendorRef'];
      const categoryChanged = req.body.category && req.body.category !== tx.category;
      const productChanged = req.body.productName && req.body.productName !== tx.productName;
      if (!tx.financeLink && ['category', 'subcategory', 'type', 'subscriptionRef'].some(field => Object.hasOwn(req.body, field))) {
        tx.$where = { financeLink: null };
      }
      if (categoryChanged && !Object.hasOwn(req.body, 'subcategory')) tx.subcategory = undefined;
      for (const k of allowed) if (req.body[k] !== undefined) tx[k] = req.body[k] || null;
      await tx.save();

      const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
      if (tx.visibility !== 'PRIVATE' && (categoryChanged || productChanged || lineItems.length)) {
        try {
          const RecipientDirectory = require('../../models/recipientdirectory.model');
          const { upsertFromCategory, upsertProduct } = require('../../services/recipient.service');
          const directoryEntry = tx.recipientVendorRef
            ? await RecipientDirectory.findOne({ _id: tx.recipientVendorRef, familyId: tx.familyId })
            : null;
          let vendor = directoryEntry && {
            familyId: tx.familyId,
            vendorKey: directoryEntry.vendorKey,
            upiId: directoryEntry.upiId,
            label: directoryEntry.label,
          };

          // A QR scan attached to a bank transaction or queued for review can lack a vendor reference.
          if (!vendor && SourceRecord) {
            const scan = await SourceRecord.findOne({
              transactionId: tx._id,
              familyId: tx.familyId,
              createdBy: req.user._id,
              source: 'QR_SCAN',
            }).sort({ createdAt: -1 }).lean();
            const upiId = scan?.parsedFields?.recipient?.upiId || scan?.upiId;
            const label = scan?.parsedFields?.recipient?.name;
            if (upiId) vendor = { familyId: tx.familyId, upiId, label };
          }

          if (vendor) {
            if (categoryChanged && tx.category !== 'Other') {
              await upsertFromCategory({ ...vendor, category: tx.category, amountPaise: tx.amountPaise });
            }
            if (tx.productName && (productChanged || categoryChanged)) {
              await upsertProduct({
                ...vendor,
                product: {
                  name: tx.productName,
                  category: tx.category || directoryEntry?.primaryCategory,
                  subcategory: tx.subcategory,
                  typicalAmountPaise: tx.amountPaise,
                },
              });
            }
            for (const item of lineItems) {
              if (item.productName) {
                await upsertProduct({
                  ...vendor,
                  product: {
                    name: item.productName,
                    category: item.category || tx.category || directoryEntry?.primaryCategory,
                    subcategory: item.subcategory,
                    typicalAmountPaise: item.amountPaise,
                  },
                });
              }
            }
          }
        } catch (error) {
          console.warn('[patch vendor learn]', error.message);
        }
      }
      res.json({ transaction: tx });
    } catch (err) {
      if (err.name === 'DocumentNotFoundError') return res.status(409).json({ error: 'This transaction changed. Reload it and try again.' });
      next(err);
    }
  });

// POST /api/transactions/bulk-merge-duplicates — user-selected ids are treated
// as duplicates. Groups by type+amountPaise so e.g. 5x ₹500 + 5x ₹20 collapse
// to one ₹500 and one ₹20 (keeps earliest occurredAt per group, voids rest).
router.post('/bulk-merge-duplicates', async (req, res, next) => {
  try {
    if (!requireFamily(req, res)) return;
    const schema = Joi.object({
      ids: Joi.array().items(Joi.string().min(1)).min(2).max(100).required(),
    });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ error: error.message });
    const offsets = await activeOffsets(req.user.familyAccountId, req.user._id);
    if (value.ids.some(id => offsets.has(id))) {
      return res.status(409).json({ error: 'Remove the offset before merging one of its transactions' });
    }
    const docs = await Transaction.find({
      _id: { $in: value.ids },
      createdBy: req.user._id,
      familyId: req.user.familyAccountId,
      status: { $ne: 'VOIDED' },
    });
    if (docs.length < 2) return res.status(400).json({ error: 'Select at least 2 valid transactions' });
    const groups = new Map();
    for (const d of docs) {
      const key = `${d.type}:${d.amountPaise}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    const resultGroups = [];
    let voided = 0;
    let skipped = Math.max(0, value.ids.length - docs.length);
    for (const [key, arr] of groups.entries()) {
      if (arr.length < 2) {
        resultGroups.push({ key, type: arr[0].type, amountPaise: arr[0].amountPaise, count: 1, keptId: String(arr[0]._id), mergedIds: [] });
        continue;
      }
      // Survivor: prefer already-reconciled/active, then earliest occurredAt
      const rank = { RECONCILED: 0, ACTIVE: 1, PENDING_REVIEW: 2 };
      arr.sort((a, b) => {
        if (Boolean(a.financeLink) !== Boolean(b.financeLink)) return a.financeLink ? -1 : 1;
        const r = (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
        if (r !== 0) return r;
        const t = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
        if (t !== 0) return t;
        return String(a._id).localeCompare(String(b._id));
      });
      const survivor = arr[0];
      const rest = arr.slice(1).filter(tx => !tx.financeLink && !(survivor.financeLink && tx.subscriptionRef));
      skipped += arr.length - rest.length - 1;
      if (!rest.length) continue;
      const restIds = rest.map((d) => d._id);
      if (SourceRecord) {
        await SourceRecord.updateMany({ transactionId: { $in: restIds } }, { transactionId: survivor._id });
        const srs = await SourceRecord.find({ transactionId: survivor._id });
        survivor.sourceIds = srs.map((s) => s._id);
      }
      survivor.mergedFrom = [...(survivor.mergedFrom || []), ...restIds];
      survivor.candidateOf = undefined;
      if (survivor.status === 'PENDING_REVIEW') survivor.status = 'RECONCILED';
      await survivor.save();
      for (const d of rest) {
        d.status = 'VOIDED';
        d.candidateOf = undefined;
        await d.save();
        voided += 1;
      }
      resultGroups.push({
        key,
        type: survivor.type,
        amountPaise: survivor.amountPaise,
        count: rest.length + 1,
        keptId: String(survivor._id),
        mergedIds: restIds.map(String),
      });
    }
    res.json({ groups: resultGroups, kept: resultGroups.filter((g) => g.count > 1).length, voided, skipped });
  } catch (err) { next(err); }
});

// POST /api/transactions/:id/resolve — PENDING_REVIEW → merge or keepSeparate
router.post('/:id/resolve', async (req, res, next) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Not found' });
    if (!canModifyTransaction(req, tx)) return res.status(403).json({ error: 'Only the transaction creator can modify it' });
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
      if (!canModifyTransaction(req, target)) return res.status(403).json({ error: 'Forbidden target' });
      if (String(tx._id) === String(target._id) || tx.type !== target.type || tx.amountPaise !== target.amountPaise || target.status === 'VOIDED') return res.status(400).json({ error: 'Incompatible merge target' });
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
