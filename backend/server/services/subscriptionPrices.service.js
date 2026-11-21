const Subscription = require('../models/subscription.model');
const Transaction = require('../models/transaction.model');
const { buildTransactionVisibilityFilter, indiaCalendarDate, sameId } = require('../utils/scope');
const { vendorDisplayName } = require('../utils/vendorDisplayName');
const { effectiveSubscriptionAmount } = require('../utils/subscriptionAmount');
const { activeOffsets } = require('./transactionOffsets');

const dayMs = 86400000;
const renewalWindow = 4 * dayMs;

function calendarDay(value) {
  return indiaCalendarDate(value).setUTCHours(0, 0, 0, 0);
}

function merchantKeys(tx) {
  const key = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const name = vendorDisplayName(tx.recipient);
  return [
    tx.recipientVendorRef && `vendor:${tx.recipientVendorRef}`,
    tx.recipient?.upiId && `upi:${tx.recipient.upiId.trim().toLowerCase()}`,
    name !== 'Unknown' && key(name).length >= 3 && `name:${key(name)}`,
  ].filter(Boolean);
}

function renewalNear(sub, paidDay) {
  const day = Number(sub.billingDate);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if ((sub.startDate && paidDay < calendarDay(sub.startDate)) ||
      (sub.endDate && paidDay > calendarDay(sub.endDate))) return null;
  const paid = new Date(paidDay);
  const year = paid.getUTCFullYear();
  const month = paid.getUTCMonth();
  const yearly = sub.frequency === 'yearly';
  const anchor = sub.nextRenewalDate || sub.startDate;
  if (yearly && !anchor) return null;
  const billingMonth = yearly ? indiaCalendarDate(anchor).getUTCMonth() : month;
  for (const offset of [0, -1, 1]) {
    const y = year + (yearly ? offset : 0);
    const m = billingMonth + (yearly ? 0 : offset);
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const due = Date.UTC(y, m, Math.min(day, lastDay));
    if (Math.abs(due - paidDay) <= renewalWindow) return due;
  }
  return null;
}

// Derive prices from settled ledger evidence. Reversed or corrected rows then
// stop affecting the price without a migration or a second stored copy.
function projectSubscriptionPrices(subscriptions, transactions, now = new Date()) {
  const states = new Map(subscriptions.map(sub => [String(sub._id), {
    sub,
    keys: new Set(merchantKeys({ recipient: { name: sub.name } })),
    cycles: new Map(),
  }]));
  const charges = transactions.filter(tx =>
    ['ACTIVE', 'RECONCILED'].includes(tx.status) &&
    ['EXPENSE', 'CASH_EXPENSE'].includes(tx.type) &&
    (!tx.currency || tx.currency === 'INR') &&
    !tx.financeLink &&
    Number.isSafeInteger(tx.amountPaise) && tx.amountPaise > 0 &&
    new Date(tx.occurredAt) <= now,
  );
  const ownerMatches = (sub, tx) =>
    sameId(sub.memberId, tx.createdBy) && sameId(sub.familyAccountId, tx.familyId);
  for (const tx of charges) {
    const state = states.get(String(tx.subscriptionRef));
    if (!state || !ownerMatches(state.sub, tx)) continue;
    for (const key of merchantKeys(tx)) state.keys.add(key);
  }
  for (const tx of charges) {
    const paidDay = calendarDay(tx.occurredAt);
    const linked = tx.subscriptionRef != null;
    const keys = linked ? [] : merchantKeys(tx);
    if (!linked && (tx.mode !== 'BANK' || !tx.batchId || !keys.length)) continue;
    const candidates = [];
    for (const state of states.values()) {
      if (!ownerMatches(state.sub, tx)) continue;
      if (linked ? !sameId(state.sub._id, tx.subscriptionRef)
        : (state.sub.status || 'Active') !== 'Active' || !keys.some(key => state.keys.has(key))) continue;
      const renewal = renewalNear(state.sub, paidDay);
      if (renewal !== null) candidates.push({ state, renewal });
    }
    if (candidates.length !== 1) continue;
    const { state, renewal } = candidates[0];
    const cycle = state.cycles.get(renewal) || [];
    const loggedDirectly = linked && !tx.sourceIds?.length &&
      tx.productName === state.sub.name && !tx.batchId;
    cycle.push({ tx, paidDay, linked, loggedDirectly });
    state.cycles.set(renewal, cycle);
  }
  return subscriptions.map(sub => {
    const history = [...(sub.priceHistory || [])];
    const cycles = [...states.get(String(sub._id)).cycles].sort(([a], [b]) => a - b);
    for (const [renewal, cycle] of cycles) {
      const confirmed = cycle.filter(charge => charge.linked && !charge.loggedDirectly);
      const imported = cycle.filter(charge => !charge.loggedDirectly);
      const evidence = confirmed.length ? confirmed : imported.length ? imported : cycle;
      if (evidence.length !== 1) continue;
      const [{ tx, paidDay }] = evidence;
      const amount = tx.amountPaise / 100;
      const day = Math.min(renewal, paidDay);
      // An explicit price change in the charge window wins over the inference.
      if (sub.priceHistory?.some((entry, index) =>
        (entry.source === 'manual' || (!entry.source && index > 0)) &&
        calendarDay(entry.effectiveFrom) >= day &&
        calendarDay(entry.effectiveFrom) <= Math.max(paidDay, renewal),
      )) continue;
      const effectiveFrom = new Date(day);
      if (effectiveSubscriptionAmount({ ...sub, priceHistory: history }, effectiveFrom) === amount) continue;
      const baseline = history[0];
      if (!sub.startDate && baseline && calendarDay(baseline.effectiveFrom) >= day &&
          (baseline.source === 'baseline' ||
            (!baseline.source && calendarDay(baseline.effectiveFrom) === calendarDay(sub.createdAt)))) {
        history[0] = { ...baseline, effectiveFrom: new Date(day - dayMs) };
      }
      history.push({ amount, effectiveFrom, source: 'payment' });
    }
    if (history.length > (sub.priceHistory || []).length && !sub.priceHistory?.length && sub.amount > 0) {
      const first = Math.min(...history.map(entry => calendarDay(entry.effectiveFrom)));
      const baseline = Math.min(calendarDay(sub.startDate || sub.createdAt || first - dayMs), first - dayMs);
      history.unshift({ amount: sub.amount, effectiveFrom: new Date(baseline), source: 'baseline' });
    }
    history.sort((a, b) => calendarDay(a.effectiveFrom) - calendarDay(b.effectiveFrom));
    const projected = { ...sub, priceHistory: history };
    return { ...projected, amount: effectiveSubscriptionAmount(projected, now) };
  });
}

async function withObservedSubscriptionPrices(items, viewerId, now = new Date()) {
  const subscriptions = items.map(item => item.toObject ? item.toObject() : item);
  const groups = new Map();
  for (const sub of subscriptions) {
    if (!sub.familyAccountId || !sub.memberId) continue;
    const key = `${sub.familyAccountId}/${sub.memberId}`;
    if (!groups.has(key)) groups.set(key, sub);
  }
  const computed = new Map();
  await Promise.all([...groups.values()].map(async ({ familyAccountId, memberId }) => {
    // Include sibling plans even when the caller requests only one plan.
    const siblings = await Subscription.find({ familyAccountId, memberId }).lean();
    const visibility = await buildTransactionVisibilityFilter(null, {
      familyId: familyAccountId,
      userId: viewerId || memberId,
    });
    const [charges, offsets] = await Promise.all([
      Transaction.find({
        familyId: familyAccountId,
        createdBy: memberId,
        occurredAt: { $lte: now },
        status: { $in: ['ACTIVE', 'RECONCILED'] },
        type: { $in: ['EXPENSE', 'CASH_EXPENSE'] },
        $and: [visibility, {
          $or: [
            { subscriptionRef: { $in: siblings.map(sub => sub._id) } },
            { mode: 'BANK', batchId: { $type: 'string' }, subscriptionRef: null },
          ],
        }],
      }).select('familyId createdBy occurredAt status type amountPaise currency subscriptionRef financeLink mode batchId recipient recipientVendorRef productName sourceIds').lean(),
      activeOffsets(familyAccountId, memberId),
    ]);
    const eligible = charges.filter(charge => !offsets.has(String(charge._id)));
    for (const sub of projectSubscriptionPrices(siblings, eligible, now)) {
      computed.set(String(sub._id), sub);
    }
  }));
  return subscriptions.map(sub => computed.get(String(sub._id)) || sub);
}

module.exports = { projectSubscriptionPrices, withObservedSubscriptionPrices };
