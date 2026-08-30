const Transaction = require('../models/transaction.model');
const Subscription = require('../models/subscription.model');
const RecurringPayment = require('../models/recurring.model');
const EMILoan = require('../models/loan.model');

// Helper: fuzzy name match (contains, case-insensitive, normalized)
function nameMatches(subName, recipientName) {
  if (!subName || !recipientName) return false;
  const a = String(subName).toLowerCase().trim();
  const b = String(recipientName).toLowerCase().trim();
  if (!a || !b) return false;
  // direct contains either way, or token overlap
  if (b.includes(a) || a.includes(b)) return true;
  const tokensA = a.split(/\s+/).filter((t) => t.length > 2);
  const tokensB = b.split(/\s+/);
  const overlap = tokensA.filter((t) => tokensB.some((tb) => tb.includes(t) || t.includes(tb)));
  return overlap.length > 0;
}

function daysDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

// Find transactions that likely correspond to a subscription/recurring/loan
async function findMatches({ familyId, name, amount, dueDay, type = 'subscription', tolerancePct = 0.05 }) {
  const amountPaise = Math.round(Number(amount || 0) * 100);
  if (!amountPaise) return [];
  const isVariable = type === 'recurring' || (type === 'subscription' && String(name).toLowerCase().includes('electric')) || type === 'utility';
  const tol = isVariable ? 0.15 : tolerancePct;
  const minPaise = Math.round(amountPaise * (1 - tol));
  const maxPaise = Math.round(amountPaise * (1 + tol));
  // look at last 6 months
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  const filter = {
    familyId,
    status: { $ne: 'VOIDED' },
    type: { $in: ['EXPENSE', 'CASH_EXPENSE'] },
    amountPaise: { $gte: minPaise, $lte: maxPaise },
    occurredAt: { $gte: since },
    visibility: { $ne: 'PRIVATE' },
    // Only search unlinked transactions
    ...(type === 'subscription' ? { subscriptionRef: null } : type === 'loan' ? { loanRef: null } : {}),
  };
  const candidates = await Transaction.find(filter).sort({ occurredAt: -1 }).limit(200).lean();
  const matched = [];
  for (const tx of candidates) {
    const recName = tx.recipient?.name || tx.productName || '';
    if (!nameMatches(name, recName)) continue;
    // date check: if dueDay provided, check day proximity ±4 days
    if (dueDay) {
      const day = new Date(tx.occurredAt).getDate();
      const diff = Math.min(Math.abs(day - dueDay), 31 - Math.abs(day - dueDay)); // handle month wrap
      if (diff > 4) continue;
    }
    matched.push(tx);
  }
  return matched.slice(0, 10);
}

async function buildSuggestionsForSubscriptions({ familyId, memberId }) {
  const filter = { familyAccountId: familyId };
  if (memberId) filter.memberId = memberId;
  const subs = await Subscription.find(filter).lean();
  const out = [];
  for (const sub of subs) {
    if (sub.status === 'Cancelled' || sub.status === 'Paused') continue;
    if (sub.notes && sub.notes.includes('[[DISMISSED_SUGGESTION]]')) continue;

    const matched = await findMatches({ familyId, name: sub.name, amount: sub.amount, dueDay: sub.billingDate, type: 'subscription' });
    if (matched.length >= 2) {
      // suggest median amount and median day
      const amounts = matched.map((m) => m.amountPaise).sort((a, b) => a - b);
      const medianPaise = amounts[Math.floor(amounts.length / 2)];
      const medianAmount = medianPaise / 100;
      const days = matched.map((m) => new Date(m.occurredAt).getDate()).sort((a, b) => a - b);
      const medianDay = days[Math.floor(days.length / 2)];
      const variance = Math.max(...amounts) - Math.min(...amounts);
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variancePct = avg ? variance / avg : 0;
      // drift
      const dateDrift = Math.abs((sub.billingDate || 0) - medianDay);
      const amountDriftPct = sub.amount ? Math.abs(medianAmount - sub.amount) / sub.amount : 0;

      // If already identical to current subscription and drift is 0, auto-link matched transactions directly
      if (dateDrift === 0 && amountDriftPct < 0.01) {
        // Automatically link matching transactions to subscription in background so ledger is organized
        await Transaction.updateMany(
          { _id: { $in: matched.map((m) => m._id) } },
          { $set: { subscriptionRef: sub._id } }
        ).catch(() => {});
        continue;
      }

      out.push({
        kind: 'subscription',
        id: sub._id,
        name: sub.name,
        current: { amount: sub.amount, billingDate: sub.billingDate, nextRenewalDate: sub.nextRenewalDate },
        suggested: { amount: medianAmount, billingDate: medianDay },
        matchedTxIds: matched.map((m) => m._id),
        matchedCount: matched.length,
        avgAmountPaise: Math.round(avg),
        amountVariancePct: variancePct,
        dateDriftDays: dateDrift,
        amountDriftPct,
        confidence: matched.length >= 3 && variancePct < 0.1 ? 85 : matched.length >= 2 ? 65 : 40,
        sample: matched.slice(0, 3).map((m) => ({ date: m.occurredAt, amount: m.amountPaise / 100, recipient: m.recipient?.name || m.productName })),
      });
    } else if (matched.length === 1) {
      // 1 matching transaction with drift
      const tx = matched[0];
      const txAmt = tx.amountPaise / 100;
      const txDay = new Date(tx.occurredAt).getDate();
      if (Math.abs(txAmt - sub.amount) > 1 || Math.abs(txDay - sub.billingDate) > 2) {
        out.push({
          kind: 'subscription',
          id: sub._id,
          name: sub.name,
          current: { amount: sub.amount, billingDate: sub.billingDate },
          suggested: { amount: txAmt, billingDate: txDay },
          matchedTxIds: [tx._id],
          matchedCount: 1,
          confidence: 35,
          sample: [{ date: tx.occurredAt, amount: txAmt, recipient: tx.recipient?.name || tx.productName }],
        });
      }
    }
  }
  return out;
}

async function buildSuggestionsForRecurring({ familyId, memberId }) {
  const filter = { familyAccountId: familyId };
  if (memberId) filter.memberId = memberId;
  const recs = await RecurringPayment.find(filter).lean();
  const out = [];
  for (const rec of recs) {
    if (rec.notes && rec.notes.includes('[[DISMISSED_SUGGESTION]]')) continue;
    const matched = await findMatches({ familyId, name: rec.title, amount: rec.amount, dueDay: rec.dueDate, type: 'recurring' });
    if (matched.length >= 2) {
      const amounts = matched.map((m) => m.amountPaise).sort((a, b) => a - b);
      const medianPaise = amounts[Math.floor(amounts.length / 2)];
      const medianAmount = medianPaise / 100;
      const days = matched.map((m) => new Date(m.occurredAt).getDate()).sort((a, b) => a - b);
      const medianDay = days[Math.floor(days.length / 2)];
      const variancePct = (Math.max(...amounts) - Math.min(...amounts)) / (amounts.reduce((a, b) => a + b, 0) / amounts.length);
      const dateDrift = Math.abs((rec.dueDate || 0) - medianDay);
      const amountDriftPct = rec.amount ? Math.abs(medianAmount - rec.amount) / rec.amount : 0;
      if (dateDrift === 0 && amountDriftPct < 0.01) continue;

      out.push({
        kind: 'recurring',
        id: rec._id,
        name: rec.title,
        current: { amount: rec.amount, dueDate: rec.dueDate },
        suggested: { amount: medianAmount, dueDate: medianDay },
        matchedTxIds: matched.map((m) => m._id),
        matchedCount: matched.length,
        confidence: variancePct < 0.15 ? 75 : 55,
        sample: matched.slice(0, 3),
      });
    }
  }
  return out;
}

async function buildSuggestionsForLoans({ familyId, memberId }) {
  const filter = { familyAccountId: familyId };
  if (memberId) filter.memberId = memberId;
  const loans = await EMILoan.find({ ...filter, status: 'Active' }).lean();
  const out = [];
  for (const loan of loans) {
    if (loan.notes && loan.notes.includes('[[DISMISSED_SUGGESTION]]')) continue;
    const matched = await findMatches({ familyId, name: loan.loanName, amount: loan.emiAmount, dueDay: loan.emiDate, type: 'loan' });
    if (matched.length >= 2) {
      out.push({
        kind: 'loan',
        id: loan._id,
        name: loan.loanName,
        current: { emiAmount: loan.emiAmount, emiDate: loan.emiDate },
        matchedTxIds: matched.map((m) => m._id),
        matchedCount: matched.length,
        confidence: 70,
        sample: matched.slice(0, 3),
      });
    }
  }
  return out;
}

async function applySuggestion({ kind, id, acceptAmount, acceptDate, matchedTxIds, familyId }) {
  if (kind === 'subscription') {
    const sub = await Subscription.findOne({ _id: id, familyAccountId: familyId });
    if (!sub) throw Object.assign(new Error('Subscription not found'), { status: 404 });
    if (acceptAmount != null) sub.amount = Number(acceptAmount);
    if (acceptDate != null) {
      sub.billingDate = Number(acceptDate);
      const now = new Date();
      let y = now.getFullYear();
      let m = now.getMonth();
      let d = Number(acceptDate);
      let next = new Date(y, m, d);
      if (next <= now) {
        next = new Date(y, m + 1, d);
      }
      sub.nextRenewalDate = next;
    }
    sub.lastRenewalDate = new Date();
    await sub.save();

    // Link matched transactions to this subscription
    if (Array.isArray(matchedTxIds) && matchedTxIds.length > 0) {
      await Transaction.updateMany(
        { _id: { $in: matchedTxIds } },
        { $set: { subscriptionRef: sub._id, category: sub.category || 'Entertainment' } }
      ).catch(() => {});
    }
    return sub;
  }
  if (kind === 'recurring') {
    const rec = await RecurringPayment.findOne({ _id: id, familyAccountId: familyId });
    if (!rec) throw Object.assign(new Error('Recurring not found'), { status: 404 });
    if (acceptAmount != null) rec.amount = Number(acceptAmount);
    if (acceptDate != null) rec.dueDate = Number(acceptDate);
    await rec.save();
    return rec;
  }
  if (kind === 'loan') {
    const loan = await EMILoan.findOne({ _id: id, familyAccountId: familyId });
    if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });
    if (acceptAmount != null) loan.emiAmount = Number(acceptAmount);
    if (acceptDate != null) loan.emiDate = Number(acceptDate);
    await loan.save();
    if (Array.isArray(matchedTxIds) && matchedTxIds.length > 0) {
      await Transaction.updateMany(
        { _id: { $in: matchedTxIds } },
        { $set: { loanRef: loan._id, loanMeta: { isLoanPayment: true, isPrepayment: false } } }
      ).catch(() => {});
    }
    return loan;
  }
  throw Object.assign(new Error('Unknown kind'), { status: 400 });
}

async function dismissSuggestion({ kind, id, familyId }) {
  const noteTag = '[[DISMISSED_SUGGESTION]]';
  if (kind === 'subscription') {
    const sub = await Subscription.findOne({ _id: id, familyAccountId: familyId });
    if (!sub) return { success: true };
    sub.notes = sub.notes ? `${sub.notes}\n${noteTag}` : noteTag;
    await sub.save();
    return { success: true };
  }
  if (kind === 'recurring') {
    const rec = await RecurringPayment.findOne({ _id: id, familyAccountId: familyId });
    if (!rec) return { success: true };
    rec.notes = rec.notes ? `${rec.notes}\n${noteTag}` : noteTag;
    await rec.save();
    return { success: true };
  }
  if (kind === 'loan') {
    const loan = await EMILoan.findOne({ _id: id, familyAccountId: familyId });
    if (!loan) return { success: true };
    loan.notes = loan.notes ? `${loan.notes}\n${noteTag}` : noteTag;
    await loan.save();
    return { success: true };
  }
  return { success: true };
}

module.exports = {
  findMatches,
  buildSuggestionsForSubscriptions,
  buildSuggestionsForRecurring,
  buildSuggestionsForLoans,
  applySuggestion,
  dismissSuggestion,
};
