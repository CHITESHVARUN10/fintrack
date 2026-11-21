const test = require('node:test');
const assert = require('node:assert/strict');
const { balancedOffset } = require('./transactionOffsets');

const entry = (_id, type, amountPaise, more = {}) => ({
  _id, type, amountPaise, familyId: 'family', createdBy: 'owner', status: 'ACTIVE', ...more,
});

test('one credit covers a purchase and returned change in any order', () => {
  const received = entry('funding', 'INCOME', 749900);
  const game = entry('game', 'EXPENSE', 600000);
  const change = entry('returned', 'EXPENSE', 149900);
  assert.equal(balancedOffset([game, received, change]), true);
  assert.equal(balancedOffset([received, game]), false);
});

test('a loan and a repayment can balance across dates or split repayments', () => {
  const loan = entry('loan', 'EXPENSE', 50000, { occurredAt: '2026-10-01' });
  const repayment = entry('repay', 'INCOME', 50000, { occurredAt: '2026-11-01', status: 'RECONCILED' });
  assert.equal(balancedOffset([loan, repayment]), true);
  assert.equal(balancedOffset([loan, entry('part1', 'INCOME', 40000), entry('part2', 'INCOME', 10000)]), true);
});

test('invalid or missing entries cannot partly remove an offset from totals', () => {
  const credit = entry('one', 'INCOME', 50000);
  const debit = entry('two', 'EXPENSE', 50000);
  for (const extra of [
    { _id: credit._id }, { familyId: 'another family' }, { createdBy: 'another owner' },
    { currency: 'USD' }, { status: 'PENDING_REVIEW' }, { status: 'VOIDED' },
    { amountPaise: 50000.5 }, { type: 'INTERNAL_TRANSFER' }, { type: 'INCOME' },
  ]) {
    assert.equal(balancedOffset([credit, { ...debit, ...extra }]), false);
  }
  assert.equal(balancedOffset([credit, undefined]), false);
});
