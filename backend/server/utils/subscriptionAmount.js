// Subscription prices change over time (e.g. a coding plan going from ₹140 to
// ₹500 to ₹1,100). `priceHistory` keeps each price with the date it started so
// past months can still be read with the price that was actually in force.

function parseDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// The price that was in force on `date`. Falls back to the current amount for
// records created before price history existed.
function effectiveSubscriptionAmount(sub, date = new Date()) {
  const at = parseDate(date) || new Date();
  const history = (sub?.priceHistory || [])
    .map((entry) => ({
      amount: Number(entry.amount),
      from: parseDate(entry.effectiveFrom),
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.from && entry.from <= at)
    .sort((a, b) => a.from - b.from);
  if (history.length) return history[history.length - 1].amount;
  return Number(sub?.amount) || 0;
}

function monthlySubscriptionAmount(sub, date = new Date()) {
  const amount = effectiveSubscriptionAmount(sub, date);
  return sub?.frequency === 'yearly' ? amount / 12 : amount;
}

// The day the subscription bills in the given month, clamped to the month's
// last day (billing day 31 in February becomes the 28th/29th).
function subscriptionBillingDateInMonth(sub, base = new Date()) {
  const day = Math.max(1, Number(sub?.billingDate) || 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return new Date(base.getFullYear(), base.getMonth(), Math.min(day, last));
}

// Add the current price as the baseline before the first change, otherwise a
// backdated lookup would fall through to the *new* amount.
function seedSubscriptionPriceHistory(sub) {
  if (sub?.priceHistory?.length) return false;
  const amount = Number(sub?.amount) || 0;
  if (amount <= 0) return false;
  const from = parseDate(sub.startDate) || parseDate(sub.createdAt) || new Date();
  sub.priceHistory = [{ amount, effectiveFrom: from }];
  return true;
}

function appendSubscriptionPrice(sub, amount, effectiveFrom = new Date()) {
  const next = Number(amount);
  if (!Number.isFinite(next) || next <= 0) {
    throw Object.assign(new Error('Enter a valid subscription price'), { status: 400 });
  }
  const at = parseDate(effectiveFrom);
  if (!at) {
    throw Object.assign(new Error('Enter a valid effective date'), { status: 400 });
  }
  seedSubscriptionPriceHistory(sub);
  const key = dayKey(at);
  const existing = (sub.priceHistory || []).find(
    (entry) => dayKey(parseDate(entry.effectiveFrom) || new Date(0)) === key,
  );
  if (existing) {
    existing.amount = next;
  } else {
    sub.priceHistory.push({ amount: next, effectiveFrom: at });
  }
  sub.priceHistory.sort(
    (a, b) => (parseDate(a.effectiveFrom)?.getTime() || 0) - (parseDate(b.effectiveFrom)?.getTime() || 0),
  );
  // `amount` stays the price in force right now; a future-dated change waits
  // in history until its date arrives.
  sub.amount = effectiveSubscriptionAmount(sub, new Date());
  return sub;
}

module.exports = {
  parseDate,
  effectiveSubscriptionAmount,
  monthlySubscriptionAmount,
  subscriptionBillingDateInMonth,
  seedSubscriptionPriceHistory,
  appendSubscriptionPrice,
};
