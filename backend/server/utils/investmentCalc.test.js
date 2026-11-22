const test = require('node:test');
const assert = require('node:assert/strict');
const { investedValue, currentValueOf } = require('./investmentCalc');

test('real estate uses the purchase cost and preserves a zero current valuation', () => {
  const property = { investmentType: 'real_estate', purchaseValue: 8500000, totalInvested: 0, currentValue: 0 };
  assert.equal(investedValue(property), 8500000);
  assert.equal(currentValueOf(property), 0);
});

test('legacy stock values are used without changing a fully sold position', () => {
  const legacy = { investmentType: 'stock', totalInvested: 10000, currentValue: 12000 };
  assert.equal(investedValue(legacy), 10000);
  assert.equal(currentValueOf(legacy), 12000);
  const sold = { ...legacy, quantity: 0, buyPrice: 100, currentPrice: 120 };
  assert.equal(investedValue(sold), 0);
  assert.equal(currentValueOf(sold), 0);
});
