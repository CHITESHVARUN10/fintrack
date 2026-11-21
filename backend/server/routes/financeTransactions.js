const mongoose = require('mongoose');
const Transaction = require('../models/transaction.model');
const { sameId, buildTransactionVisibilityFilter } = require('../utils/scope');
const { vendorDisplayName } = require('../utils/vendorDisplayName');

const settled = { $in: ['ACTIVE', 'RECONCILED'] };
const debits = ['EXPENSE', 'CASH_EXPENSE', 'INTERNAL_TRANSFER'];
const linkKinds = {
  fd: {
    deposit: ['Investment', 'Fixed Deposit', debits],
    maturity: ['Investment', 'Fixed Deposit', ['INCOME', 'INTERNAL_TRANSFER']],
  },
  stock: {
    purchase: ['Investment', 'Stocks', debits],
    dividend: ['Investment', 'Stocks', ['INCOME']],
  },
};

function incomeSubcategory(income) {
  return income.category && income.category !== 'Other'
    ? income.category
    : income.payPattern === 'variable' ? 'Variable' : 'Regular';
}

function roles(resource, item) {
  return resource === 'income'
    ? { receipt: ['Income', incomeSubcategory(item), ['INCOME']] }
    : linkKinds[item.investmentType] || {};
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function payerOf(tx) {
  const sender = tx.sender || {};
  const recipient = tx.recipient || {};
  const party = sender.upiId || sender.accountRef || sender.name ? sender : recipient;
  const identifier = party.upiId || party.accountRef;
  if (identifier) return identifier.trim().toLowerCase();
  if (!party.name?.trim()) return '';
  // Bank imports put the statement narration in recipient.name, including for credits.
  const raw = vendorDisplayName(party);
  const bankParts = raw.match(/^(?:neft|imps|rtgs)\s*[-/]\s*([a-z]*[\d]{5,}[a-z\d]*)\s*[-/]\s*([^/-]+)/i);
  const name = bankParts?.[2] || raw;
  return name.trim().replace(/\s+/g, ' ').toLowerCase();

}

function isSuggested(tx, income, payers) {
  if (!payers.has(payerOf(tx))) return false;
  if (income.startDate && tx.occurredAt < income.startDate) return false;
  if (income.endDate && tx.occurredAt.toISOString().slice(0, 10) > income.endDate.toISOString().slice(0, 10)) return false;
  if (income.payPattern === 'variable') return true;

  const expected = Math.round((income.amount || 0) * 100);
  if (expected && Math.abs(tx.amountPaise - expected) > Math.max(100, expected * 0.05)) return false;
  if (!income.creditDate) return true;
  const local = new Date(tx.occurredAt.getTime() + 330 * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  // Payday can fall at the end of a short month or land near a month boundary.
  return [-1, 0, 1].some(offset => {
    const days = new Date(Date.UTC(year, month + offset + 1, 0)).getUTCDate();
    const payday = Date.UTC(year, month + offset, Math.min(days, income.creditDate));
    return Math.abs(Date.UTC(year, month, local.getUTCDate()) - payday) <= 3 * 86400000;
  });
}

const linkedTo = (resource, recordId) => ({
  'financeLink.resource': resource,
  'financeLink.recordId': recordId,
});
const transactionFields = 'amountPaise occurredAt type sender recipient category subcategory productName financeLink';

function registerFinanceTransactions(router, Model, resource) {
  const route = '/:id/transactions';
  async function load(req, res, next) {
    try {
      if (!mongoose.isObjectIdOrHexString(req.params.id) || !req.user.familyAccountId) {
        return res.status(404).json({ error: 'Record not found' });
      }
      const item = await Model.findOne({ _id: req.params.id, familyAccountId: req.user.familyAccountId }).lean();
      if (!item || (!sameId(item.memberId, req.user._id) && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Record not found' });
      }
      req.financeItem = item;
      next();
    } catch (err) { next(err); }
  }

  router.get(route, load, async (req, res, next) => {
    try {
      const item = req.financeItem;
      const canManage = sameId(item.memberId, req.user._id);
      const scope = { familyId: item.familyAccountId, createdBy: item.memberId, status: settled };
      const linked = linkedTo(resource, item._id);
      const candidates = req.query.view === 'available';
      const options = roles(resource, item);
      const role = typeof req.query.role === 'string' && Object.hasOwn(options, req.query.role) ? options[req.query.role] : null;
      if (candidates && (!canManage || !role)) return res.json({ items: [], hasMore: false, canManage });
      const filter = {
        ...scope,
        ...(candidates
          ? { financeLink: null, subscriptionRef: null, type: { $in: role[2] } }
          : { ...linked, ...buildTransactionVisibilityFilter(req) }),
      };
      const search = String(req.query.q || '').trim().slice(0, 100);
      if (search) {
        const value = { $regex: escapeRegex(search), $options: 'i' };
        filter.$and = [{ $or: ['sender.name', 'sender.upiId', 'recipient.name', 'recipient.upiId', 'productName']
          .map(field => ({ [field]: value })) }];
      }
      const pageSize = 20;
      const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
      const [rows, examples] = await Promise.all([
        Transaction.find(filter).select(transactionFields).sort({ occurredAt: -1, _id: -1 })
          .skip((page - 1) * pageSize).limit(pageSize + 1).lean(),
        candidates && resource === 'income'
          ? Transaction.find({ ...scope, ...linked }).select('sender recipient').sort({ occurredAt: -1 }).limit(100).lean()
          : [],
      ]);
      const payers = new Set(examples.map(payerOf).filter(Boolean));
      const items = rows.slice(0, pageSize).map(row => ({
        ...row,
        suggested: candidates && resource === 'income' && isSuggested(row, item, payers),
      }));
      if (candidates && resource === 'income') items.sort((a, b) => Number(b.suggested) - Number(a.suggested));
      res.json({ items, hasMore: rows.length > pageSize, canManage });
    } catch (err) { next(err); }
  });

  router.put(`${route}/:transactionId`, load, async (req, res, next) => {
    try {
      const item = req.financeItem;
      if (!sameId(item.memberId, req.user._id)) return res.status(403).json({ error: 'Only the transaction owner can link it' });
      const { transactionId } = req.params;
      if (!mongoose.isObjectIdOrHexString(transactionId)) return res.status(404).json({ error: 'Transaction not found' });
      const role = req.body?.role;
      const options = roles(resource, item);
      if (typeof role !== 'string' || !Object.hasOwn(options, role)) return res.status(400).json({ error: 'Choose a valid transaction purpose' });
      const [category, subcategory, types] = options[role];
      const scope = { _id: transactionId, familyId: item.familyAccountId, createdBy: item.memberId, status: settled };
      const match = { ...scope, ...linkedTo(resource, item._id), 'financeLink.role': role };
      const result = await Transaction.updateOne(
        { ...scope, type: { $in: types }, financeLink: null, subscriptionRef: null },
        [{ $set: {
          financeLink: {
            resource, recordId: item._id, role,
            previousCategory: { $ifNull: ['$category', null] },
            previousSubcategory: { $ifNull: ['$subcategory', null] },
          },
          category, subcategory,
        } }],
        { updatePipeline: true },
      );
      if (!result.modifiedCount && !await Transaction.exists(match)) {
        return res.status(409).json({ error: 'This transaction is linked elsewhere or is unavailable for this purpose' });
      }
      // Resolve a concurrent record deletion or investment type change.
      const record = { _id: item._id, familyAccountId: item.familyAccountId };
      if (resource === 'investments') record.investmentType = item.investmentType;
      if (!await Model.exists(record)) {
        await unlink(match);
        return res.status(409).json({ error: 'This record was changed or removed. Reload and try again.' });
      }
      res.json({ linked: true });
    } catch (err) { next(err); }
  });

  router.delete(`${route}/:transactionId`, load, async (req, res, next) => {
    try {
      const item = req.financeItem;
      if (!sameId(item.memberId, req.user._id)) return res.status(403).json({ error: 'Only the transaction owner can unlink it' });
      if (!mongoose.isObjectIdOrHexString(req.params.transactionId)) return res.status(404).json({ error: 'Transaction not found' });
      await unlink({
        _id: req.params.transactionId,
        familyId: item.familyAccountId,
        createdBy: item.memberId,
        ...linkedTo(resource, item._id),
      });
      res.json({ linked: false });
    } catch (err) { next(err); }
  });
}

const restoreCategory = [
  { $set: {
    category: { $ifNull: ['$financeLink.previousCategory', '$$REMOVE'] },
    subcategory: { $ifNull: ['$financeLink.previousSubcategory', '$$REMOVE'] },
  } },
  { $unset: 'financeLink' },
];

function unlink(filter) {
  return Transaction.updateOne(filter, restoreCategory, { updatePipeline: true });
}

async function clearRetiredLinks(resource, item, previousType) {
  const filter = linkedTo(resource, item._id);
  if (previousType) filter['financeLink.role'] = { $in: Object.keys(linkKinds[previousType] || {}) };
  // A link may commit after the deletion/type-change precheck. Release it
  // without touching links for the new investment type.
  await Transaction.updateMany(filter, restoreCategory, { updatePipeline: true });
}

async function requireUnlinked(res, resource, item) {
  if (!await Transaction.exists({ status: settled, ...linkedTo(resource, item._id) })) return true;
  res.status(409).json({ error: 'Unlink the ledger transactions before changing the investment type or deleting this record' });
  return false;
}

module.exports = { registerFinanceTransactions, requireUnlinked, clearRetiredLinks, isSuggested, payerOf };
