const Transaction = require('../models/transaction.model');
const Investment = require('../models/investment.model');
const { payerOf } = require('../routes/financeTransactions');
const { vendorDisplayName } = require('../utils/vendorDisplayName');
const { activeOffsets } = require('./transactionOffsets');

const dividendWords = /\b(?:dividend|dividends|divd|div)\b/i;
const purchaseWords = /\b(?:buy|purchase|stock|shares|trade|settlement)\b/i;
const otherCreditWords = /\b(?:salary|payroll|refund|reimbursement|withdrawal)\b/i;
const settled = { $in: ['ACTIVE', 'RECONCILED'] };
const creditText = tx => [tx.sender?.name, tx.recipient?.name, tx.productName].filter(Boolean).join(' ');
const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const purchaser = tx => {
  const party = tx.recipient || {};
  return String(party.upiId || party.accountRef || (party.name && vendorDisplayName(party)) || '').trim().toLowerCase();
};

function stockSuggestions(stocks, examples, rows) {
  const holdings = new Map(stocks.map(stock => [String(stock._id), stock]));
  const byRole = { dividend: new Map(), purchase: new Map() };
  for (const tx of examples) {
    const { role, recordId } = tx.financeLink;
    if (!holdings.has(String(recordId)) || !Object.hasOwn(byRole, role)) continue;
    const identity = role === 'dividend' ? payerOf(tx) : purchaser(tx);
    if (!identity) continue;
    const matches = byRole[role].get(identity) || [];
    matches.push(tx);
    byRole[role].set(identity, matches);
  }
  return rows.flatMap(tx => {
    const role = tx.type === 'INCOME' ? 'dividend' : 'purchase';
    const text = creditText(tx);
    const identity = role === 'dividend' ? payerOf(tx) : purchaser(tx);
    const known = byRole[role].get(identity) || [];
    const normalizedText = ` ${normalize(text)} `;
    const mentions = stock => [stock.ticker, stock.stockName].some(value => {
      const term = normalize(value);
      return term.length >= 2 && normalizedText.includes(` ${term} `);
    });
    const explicit = stocks.filter(mentions);
    const matched = new Set(known.map(example => String(example.financeLink.recordId)));
    const named = explicit.filter(stock => matched.has(String(stock._id)));
    const party = role === 'dividend' && (tx.sender?.upiId || tx.sender?.accountRef || tx.sender?.name)
      ? tx.sender : tx.recipient;
    const stablePaymentId = Boolean(party?.upiId || party?.accountRef);
    let stock;
    if (role === 'dividend' && dividendWords.test(text) && !otherCreditWords.test(text)) {
      // The issuer and dividend wording let us handle a changing payout amount.
      stock = named.length === 1 ? named[0] : explicit.length > 0 || matched.size !== 1 ? null : holdings.get([...matched][0]);
      if (!stock && explicit.length === 1 && examples.some(e =>
        e.financeLink.role === role && String(e.financeLink.recordId) === String(explicit[0]._id))) stock = explicit[0];
    } else if (role === 'dividend' && !otherCreditWords.test(text)) {
      if (named.length === 1) stock = named[0];
      else if (!explicit.length && stablePaymentId && matched.size === 1) stock = holdings.get([...matched][0]);
    } else if (role === 'purchase' && !dividendWords.test(text)) {
      if (named.length === 1) stock = named[0];
      else if (!explicit.length && matched.size === 1 && (stablePaymentId || purchaseWords.test(text)) && known.some(e => e.amountPaise === tx.amountPaise)) {
        stock = holdings.get([...matched][0]);
      }
    }
    return stock ? [{ transaction: tx, investmentId: stock._id, name: stock.stockName || stock.ticker, role }] : [];
  });
}

async function findStockSuggestions({ familyId, ownerId, from, to, page }) {
  const base = { familyId, createdBy: ownerId, status: settled };
  const stock = await Investment.find({ familyAccountId: familyId, memberId: ownerId, investmentType: 'stock' })
    .select('stockName ticker').lean();
  if (!stock.length) return { items: [], hasMore: false };
  const filter = {
    ...base, financeLink: null, subscriptionRef: null,
    type: { $in: ['INCOME', 'EXPENSE', 'CASH_EXPENSE', 'INTERNAL_TRANSFER'] },
  };
  if (from || to) filter.occurredAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const [examples, offsets] = await Promise.all([
    Transaction.find({
      ...base, 'financeLink.resource': 'investments',
      'financeLink.role': { $in: ['purchase', 'dividend'] },
      'financeLink.recordId': { $in: stock.map(item => item._id) },
    }).select('financeLink amountPaise sender recipient productName').sort({ occurredAt: -1 }).limit(500).lean(),
    activeOffsets(familyId, ownerId),
  ]);
  if (!examples.length) return { items: [], hasMore: false };
  const batch = 150;
  const rows = await Transaction.find({ ...filter, _id: { $nin: [...offsets.keys()] } })
    .select('amountPaise type mode occurredAt sender recipient productName recipientVendorRef')
    .sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * batch).limit(batch + 1).lean();
  return { items: stockSuggestions(stock, examples, rows.slice(0, batch)), hasMore: rows.length > batch };
}

module.exports = { findStockSuggestions, stockSuggestions };
