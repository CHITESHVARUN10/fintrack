const { isObjectIdOrHexString } = require('mongoose');
const Transaction = require('../models/transaction.model');
const TransactionOffset = require('../models/transactionoffset.model');

const settledTypes = ['ACTIVE', 'RECONCILED'];
const expenses = ['EXPENSE', 'CASH_EXPENSE'];

function oppositeTypes(type) {
  if (type === 'INCOME') return expenses;
  return expenses.includes(type) ? ['INCOME'] : [];
}

function eligibleOffset(first, second) {
  return Boolean(first && second &&
    String(first._id) !== String(second._id) &&
    String(first.familyId) === String(second.familyId) &&
    String(first.createdBy) === String(second.createdBy) &&
    settledTypes.includes(first.status) && settledTypes.includes(second.status) &&
    oppositeTypes(first.type).includes(second.type) &&
    first.amountPaise > 0 && first.amountPaise === second.amountPaise &&
    (first.currency || 'INR') === (second.currency || 'INR'));
}

async function activeOffsets(familyId, ownerId) {
  const pairs = await TransactionOffset.find({ familyId, ...(ownerId ? { ownerId } : {}) }).lean();
  if (!pairs.length) return new Map();
  const transactions = await Transaction.find({ _id: { $in: pairs.flatMap(pair => pair.transactionIds) } })
    .select('status type amountPaise currency familyId createdBy').lean();
  const byId = new Map(transactions.map(tx => [String(tx._id), tx]));
  const offsets = new Map();
  for (const pair of pairs) {
    const [a, b] = pair.transactionIds.map(String);
    if (!eligibleOffset(byId.get(a), byId.get(b))) continue;
    offsets.set(a, pair);
    offsets.set(b, pair);
  }
  return offsets;
}

function registerOffsetRoutes(router) {
  const fields = 'status type amountPaise currency familyId createdBy occurredAt sender recipient mode recipientVendorRef';
  const scope = req => ({ familyId: req.user.familyAccountId, createdBy: req.user._id });
  const owned = (req, id) => isObjectIdOrHexString(id)
    ? Transaction.findOne({ ...scope(req), _id: id }).select(fields).lean()
    : null;

  router.get('/:id/offset-candidates', async (req, res, next) => {
    try {
      const tx = await owned(req, req.params.id);
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      const offsets = await activeOffsets(tx.familyId, tx.createdBy);
      if (!settledTypes.includes(tx.status) || offsets.has(String(tx._id))) return res.json({ items: [], hasMore: false });
      const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
      const currency = tx.currency || 'INR';
      const items = await Transaction.find({
        ...scope(req), status: { $in: settledTypes }, type: { $in: oppositeTypes(tx.type) },
        amountPaise: tx.amountPaise, _id: { $nin: [...offsets.keys()] },
        ...(currency === 'INR' ? { $or: [{ currency }, { currency: null }] } : { currency }),
      }).select(fields).populate('recipientVendorRef', 'label upiId').sort({ occurredAt: -1, _id: -1 })
        .skip((page - 1) * 20).limit(21).lean();
      res.json({ items: items.slice(0, 20), hasMore: items.length > 20 });
    } catch (err) { next(err); }
  });

  router.put('/:id/offset', async (req, res, next) => {
    try {
      const { transactionId, purpose } = req.body || {};
      if (typeof purpose !== 'string' || !purpose.trim() || purpose.trim().length > 120) {
        return res.status(400).json({ error: 'Enter a purpose of 1 to 120 characters' });
      }
      const [a, b] = await Promise.all([owned(req, req.params.id), owned(req, transactionId)]);
      if (!a || !b) return res.status(404).json({ error: 'Transaction not found' });
      if (!eligibleOffset(a, b)) {
        return res.status(409).json({ error: 'Choose a settled credit and debit with the same amount and currency' });
      }
      const transactionIds = a.type === 'INCOME' ? [a._id, b._id] : [b._id, a._id];
      const filter = { familyId: a.familyId, ownerId: a.createdBy, transactionIds };
      let pair;
      try {
        await TransactionOffset.init();
        pair = await TransactionOffset.findOneAndUpdate(filter,
          { $setOnInsert: { purpose: purpose.trim() } },
          { upsert: true, returnDocument: 'after' });
      } catch (err) {
        if (err.code !== 11000) throw err;
        pair = await TransactionOffset.findOne(filter);
      }
      if (!pair) return res.status(409).json({ error: 'One of these transactions is already offset' });
      res.json({ offset: pair });
    } catch (err) { next(err); }
  });

  router.delete('/:id/offset', async (req, res, next) => {
    try {
      const tx = await owned(req, req.params.id);
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      await TransactionOffset.deleteOne({ familyId: tx.familyId, ownerId: tx.createdBy, transactionIds: tx._id });
      res.json({ offset: null });
    } catch (err) { next(err); }
  });
}

module.exports = { activeOffsets, eligibleOffset, registerOffsetRoutes };
