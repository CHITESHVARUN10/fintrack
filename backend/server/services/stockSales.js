const mongoose = require('mongoose');
const { buildTransactionVisibilityFilter } = require('../utils/scope');

// Dividend links only count once the transaction is confirmed in the ledger.
const settledStatuses = { $in: ['ACTIVE', 'RECONCILED'] };

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function parseSaleInput(body) {
  const source = body || {};
  const quantity = numberValue(source.quantity);
  if (!(quantity > 0)) return { error: 'Enter a quantity greater than zero' };
  const pricePerShare = numberValue(source.pricePerShare);
  if (!(pricePerShare >= 0)) return { error: 'Enter a sale price of zero or more per share' };
  const soldAt = source.soldAt == null || source.soldAt === '' ? new Date() : new Date(source.soldAt);
  if (Number.isNaN(soldAt.getTime())) return { error: 'Enter a valid sale date' };
  const requestId = typeof source.requestId === 'string' ? source.requestId.trim() : '';
  if (!requestId || requestId.length > 100) {
    return { error: 'A requestId of 1 to 100 characters is required' };
  }
  return {
    sale: {
      _id: new mongoose.Types.ObjectId(),
      quantity,
      pricePerShare,
      soldAt,
      requestId,
    },
  };
}

function salesOf(item) {
  return (item.sales || []).map((sale) => ({
    _id: sale._id,
    quantity: sale.quantity,
    pricePerShare: sale.pricePerShare,
    soldAt: sale.soldAt,
  }));
}

// The public detail shape: remaining quantity, the original holding derived
// from remaining + recorded sales (legacy records have no sales), the sale
// history, and the confirmed dividend total.
function detailPayload(item, totalDividendPaise = 0) {
  const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  const sales = salesOf(plain);
  const soldQuantity = sales.reduce((total, sale) => total + (sale.quantity || 0), 0);
  const held = Number.isFinite(plain.quantity) ? plain.quantity : null;
  const original = Number.isFinite(plain.originalQuantity)
    ? plain.originalQuantity
    : held == null ? null : held + soldQuantity;
  return {
    ...plain,
    quantity: held,
    originalQuantity: original,
    sales,
    totalDividendPaise,
  };
}

// Confirmed dividend credits linked to this investment, restricted to the
// investment owner and the requester's visibility rules.
function dividendFilter(item, req) {
  return {
    'financeLink.resource': 'investments',
    'financeLink.recordId': item._id,
    'financeLink.role': 'dividend',
    familyId: item.familyAccountId,
    createdBy: item.memberId,
    type: 'INCOME',
    status: settledStatuses,
    ...buildTransactionVisibilityFilter(req),
  };
}

// Atomic sale write: the filter refuses overselling and duplicate requestIds,
// while the update decrements the holding and appends to the sale history.
function saleWrite(item, sale) {
  // Decimal subtraction keeps common fractional holdings exact, e.g. 0.3 - 0.2.
  const quantity = { $toDecimal: '$quantity' };
  const sold = mongoose.Types.Decimal128.fromString(String(sale.quantity));
  return {
    filter: {
      _id: item._id,
      familyAccountId: item.familyAccountId,
      memberId: item.memberId,
      investmentType: 'stock',
      $expr: { $gte: [quantity, sold] },
      'sales.requestId': { $ne: sale.requestId },
    },
    update: [{ $set: {
      originalQuantity: { $ifNull: ['$originalQuantity', { $add: ['$quantity', { $sum: '$sales.quantity' }] }] },
      quantity: { $toDouble: { $subtract: [quantity, sold] } },
      sales: { $concatArrays: [{ $ifNull: ['$sales', []] }, [{ $literal: sale }]] },
    } }],
  };
}

module.exports = { parseSaleInput, detailPayload, dividendFilter, saleWrite };
