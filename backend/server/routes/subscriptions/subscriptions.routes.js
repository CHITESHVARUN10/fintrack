const express = require('express');
const Subscription = require('../../models/subscription.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// Compute the next renewal date from the billing day-of-month and frequency.
function computeNextRenewal(frequency, billingDate, base = new Date()) {
  if (!billingDate) return undefined;
  const day = billingDate;
  const y = base.getFullYear();
  const m = base.getMonth();
  let next = new Date(y, m, day);
  if (frequency === 'yearly') {
    if (next <= base) next = new Date(y + 1, m, day);
  } else {
    if (next <= base) next = new Date(y, m + 1, day);
  }
  return next;
}

// GET /api/subscriptions
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.frequency) filter.frequency = req.query.frequency;
    const items = await Subscription.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions
router.post('/', async (req, res, next) => {
  try {
    const body = { ...req.body, memberId: req.user._id, familyAccountId: req.user.familyAccountId };
    if (body.frequency && body.billingDate) {
      body.nextRenewalDate = computeNextRenewal(body.frequency, body.billingDate);
    }
    const item = new Subscription(body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/suggestions — global linker: detect monthly recurring via ledger
router.get('/suggestions', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { buildSuggestionsForSubscriptions } = require('../../services/subscriptionLinker.service');
    const memberId = req.user.role === 'admin' && req.query.memberId ? req.query.memberId : undefined;
    const suggestions = await buildSuggestionsForSubscriptions({ familyId: req.user.familyAccountId, memberId });
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:id/apply-suggestion
router.post('/:id/apply-suggestion', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { applySuggestion } = require('../../services/subscriptionLinker.service');
    const { acceptAmount, acceptDate, matchedTxIds } = req.body;
    const updated = await applySuggestion({
      kind: 'subscription',
      id: req.params.id,
      acceptAmount,
      acceptDate,
      matchedTxIds,
      familyId: req.user.familyAccountId,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:id/dismiss-suggestion
router.post('/:id/dismiss-suggestion', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { dismissSuggestion } = require('../../services/subscriptionLinker.service');
    const result = await dismissSuggestion({
      kind: 'subscription',
      id: req.params.id,
      familyId: req.user.familyAccountId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/:id/transactions — linked transactions & matching candidates
router.get('/:id/transactions', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscription not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });

    const Transaction = require('../../models/transaction.model');
    const familyId = item.familyAccountId || req.user.familyAccountId;

    // 1. Linked transactions
    const linked = await Transaction.find({ subscriptionRef: item._id })
      .sort({ occurredAt: -1 })
      .populate('createdBy', 'name email')
      .populate('recipient', 'name upiId');

    const totalPaidPaise = linked.reduce((sum, t) => sum + (t.amountPaise || 0), 0);

    // 2. Unlinked suggestions in family ledger that match name, keyword, or approximate amount
    const subNameLow = (item.name || '').toLowerCase().trim();
    const subAmtPaise = Math.round(Number(item.amount || 0) * 100);
    const tolerance = 0.15; // 15% tolerance
    const minPaise = subAmtPaise * (1 - tolerance);
    const maxPaise = subAmtPaise * (1 + tolerance);

    const baseFilter = {
      subscriptionRef: null,
      type: 'EXPENSE',
    };
    if (familyId) {
      baseFilter.familyId = familyId;
    } else {
      baseFilter.createdBy = req.user._id;
    }

    const firstWord = subNameLow.split(/\s+/)[0];
    const candidateFilters = [];
    if (firstWord && firstWord.length > 2) {
      const nameRegex = new RegExp(firstWord, 'i');
      candidateFilters.push({ 'recipient.name': nameRegex });
      candidateFilters.push({ productName: nameRegex });
    }
    if (item.category && item.category !== 'Other') {
      candidateFilters.push({ category: item.category });
    }
    if (subAmtPaise > 0) {
      candidateFilters.push({ amountPaise: { $gte: minPaise, $lte: maxPaise } });
    }

    let suggestions = [];
    if (candidateFilters.length > 0) {
      suggestions = await Transaction.find({
        ...baseFilter,
        $or: candidateFilters,
      })
        .sort({ occurredAt: -1 })
        .limit(25)
        .populate('createdBy', 'name email')
        .populate('recipient', 'name upiId');
    }

    res.json({
      linked,
      suggestions,
      totalPaidPaise,
      totalCount: linked.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:id/link-transaction
router.post('/:id/link-transaction', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscription not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });

    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

    const Transaction = require('../../models/transaction.model');
    const tx = await Transaction.findById(transactionId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    tx.subscriptionRef = item._id;
    if (!tx.category || tx.category === 'Other') {
      tx.category = item.category || 'Entertainment';
    }
    await tx.save();

    res.json({ success: true, transaction: tx, subscription: item });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:id/unlink-transaction
router.post('/:id/unlink-transaction', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscription not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });

    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

    const Transaction = require('../../models/transaction.model');
    await Transaction.updateOne({ _id: transactionId, subscriptionRef: item._id }, { $set: { subscriptionRef: null } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:id/record-payment
router.post('/:id/record-payment', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscription not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });

    const Transaction = require('../../models/transaction.model');
    const { amount, date, mode = 'UPI', notes, transactionId } = req.body;

    if (transactionId) {
      const tx = await Transaction.findById(transactionId);
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      tx.subscriptionRef = item._id;
      if (notes) tx.notes = notes;
      await tx.save();
      return res.json({ success: true, transaction: tx });
    }

    const amountNum = Number(amount || item.amount);
    if (!amountNum || amountNum <= 0) return res.status(400).json({ error: 'Valid amount is required' });

    const occurredAt = date ? new Date(date) : new Date();
    const newTx = new Transaction({
      amountPaise: Math.round(amountNum * 100),
      type: 'EXPENSE',
      mode: String(mode).toUpperCase(),
      category: item.category || 'Entertainment',
      productName: item.name,
      subscriptionRef: item._id,
      status: 'ACTIVE',
      visibility: 'FAMILY',
      occurredAt,
      createdBy: req.user._id,
      familyId: req.user.familyAccountId,
      recipient: { name: item.name },
      notes: notes || `Manual subscription renewal payment for ${item.name}`,
    });
    await newTx.save();

    res.status(201).json({ success: true, transaction: newTx });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscription not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscription not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    const { memberId, familyAccountId, _id, ...updates } = req.body;
    Object.assign(item, updates);
    if (item.frequency && item.billingDate) {
      item.nextRenewalDate = computeNextRenewal(item.frequency, item.billingDate);
    }
    await item.save();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
