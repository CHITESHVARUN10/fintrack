const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Investment = require('../models/investment.model');
const { parseSaleInput, detailPayload, dividendFilter, saleWrite } = require('./stockSales');

const oid = () => new mongoose.Types.ObjectId();

test('sale input accepts numbers and numeric strings, trims the requestId', () => {
  const before = Date.now();
  const parsed = parseSaleInput({ quantity: '4', pricePerShare: '125.5', soldAt: '2024-03-01', requestId: ' retry-1 ' });
  assert.equal(parsed.sale.quantity, 4);
  assert.equal(parsed.sale.pricePerShare, 125.5);
  assert.equal(parsed.sale.soldAt.toISOString(), '2024-03-01T00:00:00.000Z');
  assert.equal(parsed.sale.requestId, 'retry-1');
  assert.ok(parsed.sale._id instanceof mongoose.Types.ObjectId);

  const undated = parseSaleInput({ quantity: 1, pricePerShare: 0, requestId: 'retry-2' });
  assert.ok(undated.sale.soldAt.getTime() >= before);
});

test('sale input rejects missing, negative, or unsafe values', () => {
  const valid = { quantity: 2, pricePerShare: 10, soldAt: '2024-01-02', requestId: 'req-1' };
  assert.match(parseSaleInput({ ...valid, quantity: 0 }).error, /quantity/);
  assert.match(parseSaleInput({ ...valid, quantity: -1 }).error, /quantity/);
  assert.match(parseSaleInput({ ...valid, quantity: null }).error, /quantity/);
  assert.match(parseSaleInput({ ...valid, pricePerShare: -1 }).error, /price/i);
  assert.match(parseSaleInput({ ...valid, pricePerShare: null }).error, /price/i);
  assert.match(parseSaleInput({ ...valid, soldAt: 'not-a-date' }).error, /date/i);
  assert.match(parseSaleInput({ ...valid, requestId: '   ' }).error, /requestId/);
  assert.match(parseSaleInput({ ...valid, requestId: 'x'.repeat(101) }).error, /requestId/);
  assert.equal(parseSaleInput(valid).error, undefined);
});

test('detail payload keeps legacy holdings untouched', () => {
  const detail = detailPayload({ quantity: 12.5, stockName: 'Acme', sales: [] }, 4200);
  assert.equal(detail.quantity, 12.5);
  assert.equal(detail.originalQuantity, 12.5);
  assert.deepEqual(detail.sales, []);
  assert.equal(detail.totalDividendPaise, 4200);
  assert.equal(detail.stockName, 'Acme');
});

test('detail payload derives the original quantity and hides request ids', () => {
  const soldAt = new Date('2024-02-01T00:00:00Z');
  const saleId = oid();
  const detail = detailPayload({
    quantity: 60,
    sales: [{ _id: saleId, quantity: 40, pricePerShare: 210, soldAt, requestId: 'internal-key' }],
  });
  assert.equal(detail.quantity, 60);
  assert.equal(detail.originalQuantity, 100);
  assert.deepEqual(detail.sales, [{ _id: saleId, quantity: 40, pricePerShare: 210, soldAt }]);
  assert.equal(detail.totalDividendPaise, 0);
});

test('detail payload reports null quantities for non-stock records', () => {
  const detail = detailPayload({ investmentType: 'fd', principalAmount: 1000 });
  assert.equal(detail.quantity, null);
  assert.equal(detail.originalQuantity, null);
  assert.deepEqual(detail.sales, []);
});

test('dividend filter is owner, family, status, and visibility scoped', () => {
  const ownerId = oid();
  const familyId = oid();
  const investment = { _id: oid(), memberId: ownerId, familyAccountId: familyId };
  const ownerFilter = dividendFilter(investment, { user: { _id: ownerId, familyAccountId: familyId } });
  assert.equal(String(ownerFilter['financeLink.recordId']), String(investment._id));
  assert.equal(ownerFilter['financeLink.role'], 'dividend');
  assert.equal(String(ownerFilter.createdBy), String(ownerId));
  assert.deepEqual(ownerFilter.status, { $in: ['ACTIVE', 'RECONCILED'] });
  assert.ok(ownerFilter.$or);

  const adminId = oid();
  const adminFilter = dividendFilter(investment, { user: { _id: adminId, role: 'admin', familyAccountId: familyId } });
  assert.deepEqual(adminFilter.$or, [{ visibility: { $ne: 'PRIVATE' } }, { createdBy: adminId }]);
});

test('sale write decrements atomically and guards overselling and retries', () => {
  const item = { _id: oid(), memberId: oid(), familyAccountId: oid() };
  const sale = { _id: oid(), quantity: 5, pricePerShare: 100, soldAt: new Date(), requestId: 'req-9' };
  const { filter, update } = saleWrite(item, sale);
  assert.equal(filter.investmentType, 'stock');
  assert.equal(filter.$expr.$gte[1].toString(), '5');
  assert.deepEqual(filter['sales.requestId'], { $ne: 'req-9' });
  assert.deepEqual(update[0].$set.quantity.$toDouble.$subtract[0], { $toDecimal: '$quantity' });
  assert.deepEqual(update[0].$set.sales.$concatArrays[1], [{ $literal: sale }]);
});

test('sale records are validated and default to an empty history', async () => {
  const base = { memberId: oid(), familyAccountId: oid(), investmentType: 'stock', stockName: 'Acme' };
  const holding = new Investment({ ...base, quantity: 10 });
  await holding.validate();
  assert.deepEqual(holding.sales, []);

  const sold = new Investment({
    ...base,
    quantity: 8,
    sales: [{ quantity: 2, pricePerShare: 150, soldAt: new Date(), requestId: 'req-10' }],
  });
  await sold.validate();
  assert.ok(sold.sales[0]._id);

  const missingRequest = new Investment({
    ...base,
    quantity: 8,
    sales: [{ quantity: 2, pricePerShare: 150, soldAt: new Date() }],
  });
  await assert.rejects(missingRequest.validate(), /requestId/);
});
