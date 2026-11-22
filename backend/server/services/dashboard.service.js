const Income = require('../models/income.model');
const Subscription = require('../models/subscription.model');
const Investment = require('../models/investment.model');
const Transaction = require('../models/transaction.model');
const RecipientDirectory = require('../models/recipientdirectory.model');
const { activeOffsets } = require('./transactionOffsets');
const { buildTransactionVisibilityFilter, indiaCalendarDate, monthRange } = require('../utils/scope');
const { withObservedSubscriptionPrices } = require('./subscriptionPrices.service');
const { vendorDisplayName, paymentId } = require('../utils/vendorDisplayName');
const { investedValue, currentValueOf } = require('../utils/investmentCalc');
const { computeLiability, aggregateDeductions } = require('../services/tax.service');
const { activeInMonth, incomeForMonth, round2 } = require('../utils/cashflow');
const {
  effectiveSubscriptionAmount,
  monthlySubscriptionAmount,
} = require('../utils/subscriptionAmount');

function investmentMonthlyAmount(inv) {
  if (inv.investmentType === 'mf_sip') return inv.sipAmount || 0;
  return 0;
}

// Next calendar occurrence of a day-of-month within [today, today+lookaheadDays].
function nextOccurrence(dayOfMonth, lookaheadDays = 7, base = new Date()) {
  if (!dayOfMonth) return null;
  const startToday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const y = base.getFullYear();
  const m = base.getMonth();
  let d = new Date(y, m, dayOfMonth);
  if (d < startToday) d = new Date(y, m + 1, dayOfMonth);
  const limit = new Date(startToday.getTime() + lookaheadDays * 864e5 + 86399999); // end of lookahead day
  if (d > limit) return null;
  return d;
}

// --- Placeholder until Phase 8 wires the real taxService.calculateTax ---

async function buildDashboard(userId, viewerId = userId) {
  const [incomes, savedSubscriptions, invs] = await Promise.all([
    Income.find({ memberId: userId }),
    Subscription.find({ memberId: userId, status: 'Active' }),
    Investment.find({ memberId: userId }),
  ]);

  const now = new Date();
  const calendarDate = indiaCalendarDate(now);
  const period = monthRange(calendarDate.toISOString().slice(0, 7));
  const monthStart = period.$gte;
  const monthEnd = period.$lt;
  const subs = await withObservedSubscriptionPrices(savedSubscriptions, viewerId, now);

  // Upcoming payments within the next 7 days.
  const upcoming = [];
  const pushUpcoming = (items, getDay, label, amountFn) => {
    for (const it of items) {
      const occ = nextOccurrence(getDay(it), 7);
      if (occ) {
        upcoming.push({
          type: label,
          id: it._id,
          name: it.name || it.loanName || it.title || it.policyName || 'Item',
          amount: amountFn(it, occ),
          dueDate: occ,
        });
      }
    }
  };
  pushUpcoming(subs.filter(s => s.frequency !== 'yearly'), (s) => s.billingDate, 'subscription', (s, occ) => effectiveSubscriptionAmount(s, occ));
  const nowDue = new Date();
  const dueLimit = new Date(nowDue.getFullYear(), nowDue.getMonth(), nowDue.getDate() + 8);
  const dueStart = new Date(nowDue.getFullYear(), nowDue.getMonth(), nowDue.getDate());
  for (const item of subs.filter(s => s.frequency === 'yearly')) {
    const dueDate = item.nextRenewalDate && new Date(item.nextRenewalDate);
    if (dueDate && dueDate >= dueStart && dueDate < dueLimit) upcoming.push({ type: 'subscription', id: item._id, name: item.name, amount: effectiveSubscriptionAmount(item, dueDate), dueDate });
  }
  pushUpcoming(
    invs.filter((x) => x.investmentType === 'mf_sip'),
    (x) => x.sipDate,
    'sip',
    (x) => x.sipAmount || 0,
  );
  upcoming.sort((a, b) => a.dueDate - b.dueDate);

  let totalInvested = 0;
  let totalCurrentValue = 0;
  for (const d of invs) {
    totalInvested += investedValue(d);
    totalCurrentValue += currentValueOf(d);
  }

  const deductions = await aggregateDeductions(userId);

  // Transaction-based actual cash flow this month (individual, not family)
  const User = require('../models/user.model');
  const me = await User.findById(userId).select('familyAccountId').lean();
  let transactionSpendThisMonth = 0;
  let transactionCountThisMonth = 0;
  let transactionCategoryBreakdown = {};
  let transactionVendorBreakdown = {};
  let transactionCategoryEntries = [];
  let transactionVendorEntries = [];
  let incomeEntries = [];
  let refundPaise = 0;
  if (me?.familyAccountId) {
    const visibility = await buildTransactionVisibilityFilter(null, {
      familyId: me.familyAccountId,
      userId: viewerId,
    });
    const [entries, offsets] = await Promise.all([
      Transaction.find({
        familyId: me.familyAccountId,
        createdBy: userId,
        status: { $in: ['ACTIVE', 'RECONCILED'] },
        type: { $in: ['EXPENSE', 'CASH_EXPENSE', 'INCOME'] },
        occurredAt: { ...period, $lte: now },
        ...visibility,
      }).lean(),
      activeOffsets(me.familyAccountId, userId),
    ]);
    const settled = entries.filter(tx => !offsets.has(String(tx._id)));
    const txs = settled.filter(tx => tx.type !== 'INCOME');
    incomeEntries = settled.filter(tx => {
      if (tx.type !== 'INCOME') return false;
      const narration = tx.recipient?.name || tx.sender?.name || '';
      const refund = tx.metadata?.origin !== 'MANUAL' && tx.batchId &&
        /^\s*(?:(?:upi|imps|neft|card|pos|cr)[\s/:-]+)*(?:refund|purchase reversal)\b/i.test(narration);
      if (refund) refundPaise += tx.amountPaise || 0;
      return !refund;
    });
    transactionSpendThisMonth = txs.reduce((s, t) => s + (t.amountPaise || 0), 0) / 100;
    transactionCountThisMonth = txs.length;
    const vendorIds = [...new Set(txs.flatMap(t => t.recipientVendorRef ? [String(t.recipientVendorRef)] : []))];
    const upiFor = t => {
      const recipient = t.recipient;
      return (recipient?.upiId?.trim() ||
        recipient?.name?.split('/').map(part => part.trim()).find(part => paymentId.test(part)) ||
        '').toLowerCase();
    };
    const upiIds = [...new Set(txs.map(upiFor).filter(Boolean))];
    const directory = vendorIds.length || upiIds.length
      ? await RecipientDirectory.find({
          familyId: me.familyAccountId,
          $or: [{ _id: { $in: vendorIds } }, { upiId: { $in: upiIds } }],
        }).select('label upiId').lean()
      : [];
    const labelsById = new Map(directory.map(v => [String(v._id), v.label]));
    const labelsByUpi = new Map(directory.filter(v => v.upiId).map(v => [v.upiId.toLowerCase(), v.label]));

    const byCat = {};
    const vendorGroups = new Map();
    for (const t of txs) {
      const cat = t.category || 'Other';
      byCat[cat] = (byCat[cat] || 0) + (t.amountPaise || 0) / 100;
      const savedLabel = labelsById.get(String(t.recipientVendorRef)) || labelsByUpi.get(upiFor(t));
      const label = vendorDisplayName(t.recipient, savedLabel);
      const key = label.toLowerCase().replace(/\s+/g, ' ');
      const group = vendorGroups.get(key) || { label, value: 0 };
      if (label === savedLabel?.trim()) group.label = label;
      group.value += (t.amountPaise || 0) / 100;
      vendorGroups.set(key, group);
    }
    transactionCategoryBreakdown = byCat;
    transactionVendorBreakdown = Object.fromEntries([...vendorGroups.values()].map(({ label, value }) => [label, value]));
    transactionCategoryEntries = Object.entries(byCat).map(([label, value]) => ({ label, value }));
    // Vendor: keep top 8 + Other bucket so distribution is complete and percentages sum to 100 of total spend
    const allVendorEntries = [...vendorGroups.values()].sort((a, b) => b.value - a.value);
    const totalVendorAmount = allVendorEntries.reduce((s, e) => s + e.value, 0);
    const topVendors = allVendorEntries.slice(0, 8);
    const topSum = topVendors.reduce((s, e) => s + e.value, 0);
    const otherAmount = totalVendorAmount - topSum;
    if (otherAmount > 0.005) {
      // Only add Other if meaningful (> half paisa)
      topVendors.push({ label: 'Other', value: Math.round(otherAmount * 100) / 100 });
    }
    transactionVendorEntries = topVendors;
  }

  const sipMonthly = invs
    .filter((x) => x.investmentType === 'mf_sip')
    .reduce((s, x) => s + (x.sipAmount || 0), 0);
  const income = incomeForMonth({
    incomes,
    receipts: incomeEntries,
    monthStart,
    monthEnd,
  });
  const netMonthlyFlow = round2(income.received + refundPaise / 100 - transactionSpendThisMonth);
  const monthlyBurnBreakdown = {
    Subscriptions: round2(subs
      .filter(sub => activeInMonth(sub, monthStart, monthEnd))
      .reduce((sum, sub) => sum + monthlySubscriptionAmount(sub, now), 0)),
    Investments: sipMonthly,
  };

  return {
    netMonthlyFlow,
    monthlyIncome: income.received,
    monthlyObligations: transactionSpendThisMonth,
    receivedIncomeThisMonth: round2(income.received + refundPaise / 100),
    incomeExcludingRefundsThisMonth: income.received,
    plannedIncomeThisMonth: income.planned,
    spentThisMonth: transactionSpendThisMonth,
    refundsThisMonth: refundPaise / 100,
    savingsRatePct: income.received > 0
      ? round2((netMonthlyFlow / income.received) * 100)
      : 0,
    upcomingPayments: upcoming,
    monthlyBurnBreakdown,
    transactionCategoryBreakdown,
    transactionVendorBreakdown,
    transactionVendorNamesResolved: true,
    transactionCategoryEntries,
    transactionVendorEntries,
    investmentPortfolioValue: { totalInvested, totalCurrentValue },
    transactionSpendThisMonth,
    transactionCountThisMonth,
    adHocSpendThisMonth: transactionSpendThisMonth,
    taxEstimate: (() => {
      const annualIncome = (income.planned || income.received) * 12;
      const t = computeLiability({ grossSalary: annualIncome, regime: 'New', deductions: { section80C: deductions.totalDeductions } });
      return { taxableIncome: t.taxableIncome, taxBeforeCess: t.incomeTaxAfterRebate, cess: t.cess, totalTax: t.finalTax };
    })(),
  };
}

async function buildMemberSummary(userId) {
  const [incomes, subs, invs] = await Promise.all([
    Income.find({ memberId: userId }),
    Subscription.find({ memberId: userId, status: 'Active' }),
    Investment.find({ memberId: userId }),
  ]);

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalObligations =
    subs.reduce((s, x) => s + monthlySubscriptionAmount(x), 0) +
    invs.reduce((s, x) => s + investmentMonthlyAmount(x), 0);
  const totalInvestments = invs.reduce((s, d) => s + investedValue(d), 0);

  return { totalIncome, totalObligations, totalInvestments };
}

module.exports = { buildDashboard, buildMemberSummary };
