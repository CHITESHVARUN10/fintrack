const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vendorDisplayName } = require('../utils/vendorDisplayName');

test('prefers the saved vendor label over a statement narration', () => {
  assert.equal(vendorDisplayName({ name: 'UPI/J DOE/HDFC/123456789' }, 'Corner Café'), 'Corner Café');
});

test('extracts the merchant from UPI narrations with or without a debit/reference prefix', () => {
  assert.equal(vendorDisplayName({ name: 'UPI/Ravi Kumar/HDFC/123456789' }), 'Ravi Kumar');
  assert.equal(vendorDisplayName({ name: 'UPI/DR/123456789/Corner Café/ICICI/store@upi' }), 'Corner Café');
  assert.equal(vendorDisplayName({ name: 'UPI/DR/123456789/24Seven/ICICI' }, 'store@upi'), '24Seven');
});

test('keeps the full source label when it contains no recognizable merchant', () => {
  for (const name of [
    'UPI/DR/123456789/HDFC/retailmerchant@bank/Payment',
    'UPI/DR/123456789/store@upi',
    'UPI/DR/123456789',
    'POS/Some vendor/000123',
  ]) {
    assert.equal(vendorDisplayName({ name }), name);
  }
});
