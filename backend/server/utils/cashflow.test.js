const { test } = require('node:test');
const assert = require('node:assert/strict');
const { incomeForMonth, outflowForMonth } = require('./cashflow');

const monthStart = new Date(2026, 10, 1);
const monthEnd = new Date(2026, 11, 1);

test('variable income counts only actual receipts', () => {
  const incomes = [
    {
      _id: 'free',
      amount: 10000,
      payPattern: 'variable',
      startDate: new Date(2025, 0, 1),
    },
  ];
  const receipts = [
    { amountPaise: 1500000, financeLink: { resource: 'income', recordId: 'free' } },
    { amountPaise: 500000 },
  ];
  assert.deepEqual(
    incomeForMonth({ incomes, receipts, monthStart, monthEnd }),
    {
      received: 20000,
      plannedFallback: 0,
      plannedTotal: 10000,
      total: 20000,
    },
  );
});

test('regular income without a receipt still counts once', () => {
  const incomes = [{ _id: 'salary', amount: 30000, payPattern: 'regular' }];
  assert.equal(
    incomeForMonth({ incomes, receipts: [], monthStart, monthEnd }).total,
    30000,
  );
  const linked = [
    {
      amountPaise: 3100000,
      financeLink: { resource: 'income', recordId: 'salary' },
    },
  ];
  assert.deepEqual(
    incomeForMonth({ incomes, receipts: linked, monthStart, monthEnd }),
    {
      received: 31000,
      plannedFallback: 0,
      plannedTotal: 30000,
      total: 31000,
    },
  );
});

test('income outside its start/end window is ignored', () => {
  const incomes = [
    {
      _id: 'old',
      amount: 20000,
      payPattern: 'regular',
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 9, 31),
    },
  ];
  assert.equal(
    incomeForMonth({ incomes, receipts: [], monthStart, monthEnd }).total,
    0,
  );
});

test('outflow adds spend, unlogged subscriptions and SIPs', () => {
  const subs = [
    { _id: 'a', amount: 1100, frequency: 'monthly', billingDate: 5, status: 'Active' },
    { _id: 'b', amount: 499, frequency: 'monthly', billingDate: 5, status: 'Active' },
  ];
  const result = outflowForMonth({
    spent: 8000,
    subscriptions: subs,
    paidSubscriptionIds: new Set(['b']),
    sipMonthly: 2000,
    monthStart,
    monthEnd,
    now: new Date(2026, 10, 21),
  });
  assert.equal(result.committedSubscriptions, 1100);
  assert.equal(result.committed, 3100);
  assert.equal(result.total, 11100);
  assert.equal(result.subscriptionsMonthly, 1599);
});

test('a price change applies from the billing date', () => {
  const sub = {
    _id: 'code',
    amount: 1100,
    frequency: 'monthly',
    billingDate: 5,
    status: 'Active',
    priceHistory: [
      { amount: 500, effectiveFrom: new Date(2026, 2, 1) },
      { amount: 1100, effectiveFrom: new Date(2026, 10, 20) },
    ],
  };
  const november = outflowForMonth({
    spent: 0,
    subscriptions: [sub],
    monthStart,
    monthEnd,
    now: new Date(2026, 10, 21),
  });
  assert.equal(november.committed, 500);

  const december = outflowForMonth({
    spent: 0,
    subscriptions: [sub],
    monthStart: new Date(2026, 11, 1),
    monthEnd: new Date(2027, 0, 1),
    now: new Date(2026, 11, 21),
  });
  assert.equal(december.committed, 1100);
});

test('paused subscriptions and future starts are not committed', () => {
  const subs = [
    { _id: 'paused', amount: 500, status: 'Paused' },
    {
      _id: 'future',
      amount: 500,
      status: 'Active',
      startDate: new Date(2027, 0, 1),
    },
  ];
  const result = outflowForMonth({
    spent: 0,
    subscriptions: subs,
    monthStart,
    monthEnd,
    now: new Date(2026, 10, 21),
  });
  assert.equal(result.total, 0);
});
