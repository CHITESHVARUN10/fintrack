const { test } = require('node:test');
const assert = require('node:assert/strict');
const { incomeForMonth, isRefundReceipt } = require('./cashflow');

const monthStart = new Date('2026-10-31T18:30:00Z');
const monthEnd = new Date('2026-11-30T18:30:00Z');

test('planned regular and variable income remains separate from actual receipts', () => {
  const incomes = [
    { _id: 'salary', amount: 30000, payPattern: 'regular' },
    { _id: 'free', amount: 10000, payPattern: 'variable' },
  ];
  assert.deepEqual(incomeForMonth({ incomes, monthStart, monthEnd }), {
    received: 0,
    planned: 40000,
  });
  const receipts = [
    { amountPaise: 1500025, financeLink: { resource: 'income', recordId: 'free' } },
    { amountPaise: 500050 },
  ];
  assert.deepEqual(incomeForMonth({ incomes, receipts, monthStart, monthEnd }), {
    received: 20000.75,
    planned: 40000,
  });
});

test('an ended income source does not contribute to the planning estimate', () => {
  const incomes = [{ amount: 20000, endDate: new Date('2026-10-25') }];
  assert.equal(incomeForMonth({ incomes, monthStart, monthEnd }).planned, 0);
});

test('manual credits are never treated as refunds', () => {
  assert.equal(
    isRefundReceipt({
      metadata: { origin: 'MANUAL' },
      batchId: 'batch-1',
      recipient: { name: 'Refund' },
    }),
    false,
  );
});

test('bank reversals are detected as refunds', () => {
  assert.equal(
    isRefundReceipt({
      metadata: { origin: 'BANK_STATEMENT' },
      batchId: 'batch-1',
      recipient: { name: 'UPI/CR/123456/REFUND/ACME' },
    }),
    true,
  );
  assert.equal(
    isRefundReceipt({
      metadata: {},
      batchId: 'batch-1',
      sender: { name: 'NEFT-REFUND' },
    }),
    true,
  );
  assert.equal(
    isRefundReceipt({
      metadata: { origin: 'BANK_STATEMENT' },
      batchId: 'batch-1',
      recipient: { name: 'ACME SALARY' },
    }),
    false,
  );
});
