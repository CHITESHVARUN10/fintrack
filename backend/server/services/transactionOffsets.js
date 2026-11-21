const { isObjectIdOrHexString } = require('mongoose');
const Transaction = require('../models/transaction.model');
const TransactionOffset = require('../models/transactionoffset.model');

const settledTypes = ['ACTIVE', 'RECONCILED'];
const expenses = ['EXPENSE', 'CASH_EXPENSE'];
const offsetTypes = ['INCOME', ...expenses];
const offsetKinds = ['general', 'purchase_on_behalf', 'loan_repayment'];
const maxEntries = 30;
const fields = 'status type amountPaise currency familyId createdBy occurredAt sender recipient mode recipientVendorRef productName';

function oppositeTypes(type) {
  if (type === 'INCOME') return expenses;
  return expenses.includes(type) ? ['INCOME'] : [];
}

function balancedOffset(entries) {
  if (entries.length < 2 || entries.length > maxEntries || !entries[0]) return false;
  const first = entries[0];
  const ids = new Set();
  let incoming = 0;
  let outgoing = 0;
  for (const tx of entries) {
    if (!tx || !tx._id || ids.has(String(tx._id)) ||
        String(tx.familyId) !== String(first.familyId) || String(tx.createdBy) !== String(first.createdBy) ||
        (tx.currency || 'INR') !== (first.currency || 'INR') ||
        !settledTypes.includes(tx.status) || !offsetTypes.includes(tx.type) ||
        !Number.isSafeInteger(tx.amountPaise) || tx.amountPaise <= 0) return false;
    ids.add(String(tx._id));
    if (tx.type === 'INCOME') incoming += tx.amountPaise;
    else outgoing += tx.amountPaise;
  }
  return Number.isSafeInteger(incoming) && outgoing === incoming && incoming > 0;
}

async function activeOffsets(familyId, ownerId) {
  const groups = await TransactionOffset.find({ familyId, ...(ownerId ? { ownerId } : {}) }).lean();
  if (!groups.length) return new Map();
  const transactions = await Transaction.find({ _id: { $in: groups.flatMap(group => group.transactionIds) } })
    .select('status type amountPaise currency familyId createdBy').lean();
  const byId = new Map(transactions.map(tx => [String(tx._id), tx]));
  const offsets = new Map();
  for (const group of groups) {
    const ids = group.transactionIds.map(String);
    if (!balancedOffset(ids.map(id => byId.get(id)))) continue;
    for (const id of ids) offsets.set(id, group);
  }
  return offsets;
}

function registerOffsetRoutes(router) {
  const scope = req => ({ familyId: req.user.familyAccountId, createdBy: req.user._id });
  const owned = (req, id) => isObjectIdOrHexString(id)
    ? Transaction.findOne({ ...scope(req), _id: id }).select(fields).lean()
    : null;

  router.get('/:id/offset-candidates', async (req, res, next) => {
    try {
      const tx = await owned(req, req.params.id);
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      const groups = await TransactionOffset.find({ familyId: tx.familyId, ownerId: tx.createdBy })
        .select('transactionIds').lean();
      const occupied = groups.flatMap(group => group.transactionIds.map(String));
      if (!settledTypes.includes(tx.status) || !offsetTypes.includes(tx.type) || occupied.includes(String(tx._id))) {
        return res.json({ items: [], hasMore: false });
      }
      const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
      const currency = tx.currency || 'INR';
      const grouped = req.query.group === 'true';
      const filter = {
        ...scope(req), status: { $in: settledTypes },
        type: { $in: req.query.side === 'incoming' && grouped ? ['INCOME']
          : req.query.side === 'outgoing' && grouped ? expenses : grouped ? offsetTypes : oppositeTypes(tx.type) },
        amountPaise: grouped ? { $gt: 0 } : tx.amountPaise,
        _id: { $nin: [tx._id, ...occupied] },
        ...(currency === 'INR' ? { $or: [{ currency }, { currency: null }] } : { currency }),
      };
      const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
      if (query) {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: escaped, $options: 'i' };
        const matches = ['recipient.name', 'recipient.upiId', 'sender.name', 'sender.upiId', 'productName']
          .map(field => ({ [field]: regex }));
        if (/^\d{1,12}(?:\.\d{1,2})?$/.test(query)) matches.push({ amountPaise: Math.round(Number(query) * 100) });
        filter.$and = [{ $or: matches }];
      }
      const items = await Transaction.find(filter).select(fields).populate('recipientVendorRef', 'label upiId')
        .sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * 20).limit(21).lean();
      res.json({ items: items.slice(0, 20), hasMore: items.length > 20 });
    } catch (err) { next(err); }
  });

  router.put('/:id/offset', async (req, res, next) => {
    try {
      const { transactionId, transactionIds, purpose, kind = 'general' } = req.body || {};
      if (typeof purpose !== 'string' || !purpose.trim() || purpose.trim().length > 120) {
        return res.status(400).json({ error: 'Enter a purpose of 1 to 120 characters' });
      }
      if (!offsetKinds.includes(kind)) return res.status(400).json({ error: 'Choose a valid offset type' });
      const others = transactionIds === undefined ? [transactionId] : transactionIds;
      if (!Array.isArray(others) || !others.length || others.length >= maxEntries ||
          ![req.params.id, ...others].every(isObjectIdOrHexString)) {
        return res.status(400).json({ error: `Select between 2 and ${maxEntries} valid transactions` });
      }
      const ids = [req.params.id, ...others].map(id => String(id).toLowerCase());
      if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Select each transaction only once' });
      const entries = await Transaction.find({ ...scope(req), _id: { $in: ids } }).select(fields).lean();
      if (entries.length !== ids.length) return res.status(404).json({ error: 'Transaction not found' });
      if (!balancedOffset(entries)) {
        return res.status(409).json({ error: 'Incoming and outgoing totals must match in the same currency. All entries must be settled.' });
      }
      // Credits first and stable within each side, including on a retry from another entry.
      entries.sort((a, b) => Number(b.type === 'INCOME') - Number(a.type === 'INCOME') ||
        String(a._id).localeCompare(String(b._id)));
      const orderedIds = entries.map(entry => entry._id);
      const filter = { familyId: req.user.familyAccountId, ownerId: req.user._id, transactionIds: orderedIds };
      let group;
      try {
        await TransactionOffset.init();
        group = await TransactionOffset.findOneAndUpdate(filter,
          { $setOnInsert: { purpose: purpose.trim(), kind } },
          { upsert: true, returnDocument: 'after' });
      } catch (err) {
        if (err.code !== 11000) throw err;
        group = await TransactionOffset.findOne(filter);
      }
      if (!group) return res.status(409).json({ error: 'One of these transactions already belongs to an offset' });
      res.json({ offset: group });
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

module.exports = { activeOffsets, balancedOffset, registerOffsetRoutes };
