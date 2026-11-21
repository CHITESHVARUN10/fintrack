const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  effectiveSubscriptionAmount,
  monthlySubscriptionAmount,
  subscriptionBillingDateInMonth,
  seedSubscriptionPriceHistory,
  appendSubscriptionPrice,
} = require('./subscriptionAmount');

test('uses the current amount when there is no price history', () => {
  assert.equal(
    effectiveSubscriptionAmount({ amount: 499 }, new Date(2026, 10, 21)),
    499,
  );
});

test('selects the price that was in force on a date', () => {
  const sub = {
    amount: 1100,
    priceHistory: [
      { amount: 140, effectiveFrom: new Date(2026, 0, 1) },
      { amount: 500, effectiveFrom: new Date(2026, 2, 1) },
      { amount: 1100, effectiveFrom: new Date(2026, 5, 1) },
    ],
  };
  assert.equal(effectiveSubscriptionAmount(sub, new Date(2026, 1, 15)), 140);
  assert.equal(effectiveSubscriptionAmount(sub, new Date(2026, 3, 15)), 500);
  assert.equal(effectiveSubscriptionAmount(sub, new Date(2026, 10, 1)), 1100);
});

test('the first change keeps the old price as a baseline', () => {
  const createdAt = new Date(Date.now() - 30 * 86400000);
  const sub = { amount: 500, createdAt };
  appendSubscriptionPrice(sub, 1100, new Date(Date.now() - 86400000));
  assert.equal(sub.priceHistory.length, 2);
  assert.equal(sub.priceHistory[0].amount, 500);
  assert.equal(sub.priceHistory[1].amount, 1100);
  assert.equal(sub.amount, 1100);
  assert.equal(
    effectiveSubscriptionAmount(sub, new Date(createdAt.getTime() + 86400000)),
    500,
  );
});

test('a future-dated change leaves the price in force today alone', () => {
  const sub = { amount: 500, createdAt: new Date(Date.now() - 30 * 86400000) };
  appendSubscriptionPrice(sub, 1100, new Date(Date.now() + 30 * 86400000));
  assert.equal(sub.amount, 500);
  assert.equal(effectiveSubscriptionAmount(sub, new Date()), 500);
});

test('a same-day change replaces the entry instead of stacking', () => {
  const sub = { amount: 500, createdAt: new Date(Date.now() - 30 * 86400000) };
  const day = new Date(Date.now() - 86400000);
  appendSubscriptionPrice(sub, 1100, day);
  appendSubscriptionPrice(sub, 1200, day);
  assert.equal(sub.priceHistory.length, 2);
  assert.equal(sub.priceHistory[1].amount, 1200);
});

test('yearly subscriptions use a monthly equivalent and clamp billing days', () => {
  const sub = { amount: 12000, frequency: 'yearly', billingDate: 31 };
  assert.equal(monthlySubscriptionAmount(sub, new Date(2026, 1, 1)), 1000);
  assert.equal(
    subscriptionBillingDateInMonth(sub, new Date(2026, 0, 15)).getDate(),
    31,
  );
  assert.equal(
    subscriptionBillingDateInMonth(sub, new Date(2026, 1, 15)).getDate(),
    28,
  );
});

test('seeding price history is idempotent', () => {
  const sub = { amount: 500, createdAt: new Date(Date.now() - 86400000) };
  assert.equal(seedSubscriptionPriceHistory(sub), true);
  assert.equal(seedSubscriptionPriceHistory(sub), false);
  assert.equal(sub.priceHistory.length, 1);
});
