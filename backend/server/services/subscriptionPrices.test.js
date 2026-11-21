const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectSubscriptionPrices } = require('./subscriptionPrices.service');
const { effectiveSubscriptionAmount } = require('../utils/subscriptionAmount');

const now = new Date('2026-11-21');
const sub = {
  _id: 'plan', memberId: 'owner', familyAccountId: 'family', name: 'Open AI',
  amount: 140, billingDate: 5, status: 'Active', startDate: '2026-08-01',
};
const charge = (occurredAt, amount, fields = {}) => ({
  createdBy: 'owner', familyId: 'family', occurredAt, amountPaise: amount * 100,
  type: 'EXPENSE', status: 'ACTIVE', mode: 'BANK', batchId: 'statement',
  recipient: { name: 'UPI/UPI/OPEN-AI/HDFC/123456789012' }, ...fields,
});
const project = (charges, plans = [sub]) => projectSubscriptionPrices(plans, charges, now);

test('recognizes large price changes without an amount match and preserves past prices', () => {
  const [priced] = project([
    charge('2026-11-07', 1100),
    charge('2026-10-05', 500),
    charge('2026-09-05', 140),
  ]);
  assert.equal(priced.amount, 1100);
  assert.deepEqual(priced.priceHistory.map(entry => entry.amount), [140, 500, 1100]);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-09-05'), 140);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-10-05'), 500);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-11-05'), 1100);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-12-05'), 1100);
});

test('ignores distant, unsettled, non-bank and ambiguous unlinked charges', () => {
  const [priced] = project([
    charge('2026-11-05', 1100, { status: 'PENDING_REVIEW' }),
    charge('2026-11-18', 1100),
    charge('2026-11-05', 1100, { mode: 'UPI' }),
    charge('2026-10-05', 300),
    charge('2026-10-07', 800),
  ]);
  assert.equal(priced.amount, 140);
  assert.equal(project([charge('2026-11-05', 1100)], [sub, { ...sub, _id: 'sibling' }])[0].amount, 140);
});

test('uses the merchant from a confirmed payment without crossing owner or family boundaries', () => {
  const renamed = { ...sub, name: 'Coding plan' };
  const [priced] = project([
    charge('2026-09-05', 140, { subscriptionRef: 'plan' }),
    charge('2026-10-05', 700, { createdBy: 'other' }),
    charge('2026-10-06', 700, { familyId: 'other' }),
    charge('2026-11-05', 1100),
  ], [renamed]);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-10-07'), 140);
  assert.equal(priced.amount, 1100);
});

test('an imported charge takes precedence over the old price entered through Mark paid', () => {
  const [priced] = project([
    charge('2026-11-05', 140, {
      mode: 'UPI', batchId: undefined, subscriptionRef: 'plan',
      productName: sub.name, sourceIds: [],
    }),
    charge('2026-11-06', 1100),
  ]);
  assert.equal(priced.amount, 1100);
});

test('manual price changes stay authoritative through the same renewal and future schedule', () => {
  const [priced] = project([charge('2026-11-07', 1100)], [{
    ...sub,
    priceHistory: [
      { amount: 140, effectiveFrom: '2026-08-01', source: 'baseline' },
      { amount: 800, effectiveFrom: '2026-11-06', source: 'manual' },
      { amount: 900, effectiveFrom: '2026-12-01', source: 'manual' },
    ],
  }]);
  assert.equal(priced.amount, 800);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-12-05'), 900);
});

test('can learn from a statement imported before a plan without a stated start date', () => {
  const [priced] = project([charge('2026-11-05', 1100)], [{
    ...sub, startDate: null, createdAt: '2026-11-21',
    priceHistory: [{ amount: 140, effectiveFrom: '2026-11-21', source: 'baseline' }],
  }]);
  assert.equal(priced.amount, 1100);
  assert.equal(effectiveSubscriptionAmount(priced, '2026-10-05'), 140);
});

test('annual renewals match in the scheduled month and account for the last calendar day', () => {
  const [priced] = project([
    charge('2026-09-30', 1100),
    charge('2026-10-31', 5000),
  ], [{
    ...sub, frequency: 'yearly', billingDate: 31, nextRenewalDate: '2027-09-30',
  }]);
  assert.equal(priced.amount, 1100);
});
