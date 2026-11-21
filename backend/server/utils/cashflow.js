const {
  monthlySubscriptionAmount,
  subscriptionBillingDateInMonth,
} = require('./subscriptionAmount');

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// A source is active for the month when its start is before the exclusive
// month end and its end is not before the month start.
function activeInMonth(item, monthStart, monthEnd) {
  const start = item?.startDate ? new Date(item.startDate) : null;
  const end = item?.endDate ? new Date(item.endDate) : null;
  if (start && Number.isFinite(start.getTime()) && start >= monthEnd) return false;
  if (end && Number.isFinite(end.getTime()) && end < monthStart) return false;
  return true;
}

// Irregular income is recognised from actual receipts. A regular source that
// has no linked receipt this month still contributes its planned amount, so
// salaried users who do not log every credit keep seeing income. Variable
// sources deliberately contribute nothing until a receipt exists.
function incomeForMonth({ incomes = [], receipts = [], monthStart, monthEnd }) {
  const linked = new Set();
  for (const tx of receipts) {
    const link = tx?.financeLink;
    if (link?.resource === 'income' && link.recordId) {
      linked.add(String(link.recordId));
    }
  }
  const received = receipts.reduce(
    (sum, tx) => sum + (Number(tx.amountPaise) || 0),
    0,
  ) / 100;
  let plannedFallback = 0;
  let plannedTotal = 0;
  for (const income of incomes) {
    if (!activeInMonth(income, monthStart, monthEnd)) continue;
    const amount = Math.max(0, Number(income.amount) || 0);
    plannedTotal += amount;
    if (income.payPattern === 'variable') continue;
    if (!amount || linked.has(String(income._id))) continue;
    plannedFallback += amount;
  }
  return {
    received: round2(received),
    plannedFallback: round2(plannedFallback),
    plannedTotal: round2(plannedTotal),
    total: round2(received + plannedFallback),
  };
}

// Outflow is what actually left the account this month plus recurring costs
// that were not already recorded in the ledger. A subscription whose payment
// is linked to a transaction is already inside `spent`, so its monthly price is
// not added again.
function outflowForMonth({
  spent = 0,
  subscriptions = [],
  paidSubscriptionIds = new Set(),
  sipMonthly = 0,
  monthStart,
  monthEnd,
  now = new Date(),
}) {
  const paid = paidSubscriptionIds instanceof Set
    ? paidSubscriptionIds
    : new Set(paidSubscriptionIds || []);
  let subscriptionsMonthly = 0;
  let committedSubscriptions = 0;
  for (const sub of subscriptions) {
    if ((sub.status || 'Active') !== 'Active') continue;
    if (!activeInMonth(sub, monthStart, monthEnd)) continue;
    const billingDate = subscriptionBillingDateInMonth(sub, now);
    const monthly = monthlySubscriptionAmount(sub, billingDate);
    subscriptionsMonthly += monthly;
    if (!paid.has(String(sub._id))) committedSubscriptions += monthly;
  }
  const sip = Math.max(0, Number(sipMonthly) || 0);
  const committed = committedSubscriptions + sip;
  return {
    spent: round2(spent),
    committedSubscriptions: round2(committedSubscriptions),
    sip: round2(sip),
    committed: round2(committed),
    total: round2(spent + committed),
    subscriptionsMonthly: round2(subscriptionsMonthly),
  };
}

module.exports = { activeInMonth, incomeForMonth, outflowForMonth, round2 };
