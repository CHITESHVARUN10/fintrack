const Income = require('../models/income.model');
const Subscription = require('../models/subscription.model');
const RecurringPayment = require('../models/recurring.model');
const Investment = require('../models/investment.model');
const EMILoan = require('../models/loan.model');
const Insurance = require('../models/insurance.model');
const EducationPayment = require('../models/education.model');
const Transaction = require('../models/transaction.model');
const { investedValue, currentValueOf } = require('../utils/investmentCalc');
const { computeLiability, aggregateDeductions } = require('../services/tax.service');

const FREQ_MONTHS = { Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12 };

function subMonthlyAmount(sub) {
  if (sub.frequency === 'yearly') return (sub.amount || 0) / 12;
  return sub.amount || 0;
}

function insuranceMonthlyAmount(ins) {
  const div = FREQ_MONTHS[ins.premiumFrequency] || 12;
  return (ins.premiumAmount || 0) / div;
}

function investmentMonthlyAmount(inv) {
  if (inv.investmentType === 'mf_sip') return inv.sipAmount || 0;
  return 0;
}

function eduMonthlyAmount(edu) {
  if (edu.frequency === 'One-time') return 0;
  const div = FREQ_MONTHS[edu.frequency] || 12;
  return (edu.amount || 0) / div;
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

async function buildDashboard(userId) {
  const [incomes, subs, recs, invs, loans, insurances, edus] = await Promise.all([
    Income.find({ memberId: userId }),
    Subscription.find({ memberId: userId, status: { $ne: 'Cancelled' } }),
    RecurringPayment.find({ memberId: userId }),
    Investment.find({ memberId: userId }),
    EMILoan.find({ memberId: userId, status: { $ne: 'Closed' } }),
    Insurance.find({ memberId: userId, status: { $ne: 'Lapsed' } }),
    EducationPayment.find({ memberId: userId }),
  ]);

  const monthlyIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const monthlyObligations =
    subs.reduce((s, x) => s + subMonthlyAmount(x), 0) +
    recs.reduce((s, x) => s + (x.amount || 0), 0) +
    loans.reduce((s, x) => s + (x.emiAmount || 0), 0) +
    invs.reduce((s, x) => s + investmentMonthlyAmount(x), 0) +
    insurances.reduce((s, x) => s + insuranceMonthlyAmount(x), 0);

  const netMonthlyFlow = monthlyIncome - monthlyObligations;

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
          amount: amountFn(it),
          dueDate: occ,
        });
      }
    }
  };
  pushUpcoming(subs, (s) => s.billingDate, 'subscription', (s) => subMonthlyAmount(s));
  pushUpcoming(loans, (l) => l.emiDate, 'loan', (l) => l.emiAmount || 0);
  pushUpcoming(
    insurances,
    (i) => (i.nextDueDate ? i.nextDueDate.getDate() : null),
    'insurance',
    (i) => insuranceMonthlyAmount(i),
  );
  pushUpcoming(
    invs.filter((x) => x.investmentType === 'mf_sip'),
    (x) => x.sipDate,
    'sip',
    (x) => x.sipAmount || 0,
  );
  upcoming.sort((a, b) => a.dueDate - b.dueDate);

  const monthlyBurnBreakdown = {
    Subscriptions: subs.reduce((s, x) => s + subMonthlyAmount(x), 0),
    EMI: loans.reduce((s, x) => s + (x.emiAmount || 0), 0),
    Recurring: recs.reduce((s, x) => s + (x.amount || 0), 0),
    Investments: invs.filter((x) => x.investmentType === 'mf_sip').reduce((s, x) => s + (x.sipAmount || 0), 0),
    Insurance: insurances.reduce((s, x) => s + insuranceMonthlyAmount(x), 0),
    Education: edus.reduce((s, x) => s + eduMonthlyAmount(x), 0),
  };

  let totalInvested = 0;
  let totalCurrentValue = 0;
  for (const d of invs) {
    totalInvested += investedValue(d);
    totalCurrentValue += currentValueOf(d);
  }

  const deductions = await aggregateDeductions(userId);

  // Transaction-based actual spend this month (replaces AdHocExpense) — individual, not family
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Find user's family via User to scope transactions
  const User = require('../models/user.model');
  const me = await User.findById(userId).select('familyAccountId').lean();
  let transactionSpendThisMonth = 0;
  let transactionCountThisMonth = 0;
  let transactionCategoryBreakdown = {};
  let transactionVendorBreakdown = {};
  let transactionCategoryEntries = [];
  let transactionVendorEntries = [];
  if (me?.familyAccountId) {
    const txs = await Transaction.find({
      familyId: me.familyAccountId,
      createdBy: userId,
      status: { $ne: 'VOIDED' },
      type: { $in: ['EXPENSE', 'CASH_EXPENSE'] },
      occurredAt: { $gte: monthStart, $lt: monthEnd },
    }).lean();
    transactionSpendThisMonth = txs.reduce((s, t) => s + (t.amountPaise || 0), 0) / 100;
    transactionCountThisMonth = txs.length;
    // Build category breakdown from transactions (individual, current month)
    const byCat = {};
    const byVendor = {};
    for (const t of txs) {
      const cat = t.category || 'Other';
      byCat[cat] = (byCat[cat] || 0) + (t.amountPaise || 0) / 100;
      const vendor = (t.recipient?.name || 'Unknown').trim().slice(0, 40) || 'Unknown';
      byVendor[vendor] = (byVendor[vendor] || 0) + (t.amountPaise || 0) / 100;
    }
    transactionCategoryBreakdown = byCat;
    transactionVendorBreakdown = byVendor;
    transactionCategoryEntries = Object.entries(byCat).map(([label, value]) => ({ label, value }));
    transactionVendorEntries = Object.entries(byVendor)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }

  return {
    netMonthlyFlow,
    monthlyIncome,
    monthlyObligations,
    upcomingPayments: upcoming,
    monthlyBurnBreakdown,
    transactionCategoryBreakdown,
    transactionVendorBreakdown,
    transactionCategoryEntries,
    transactionVendorEntries,
    investmentPortfolioValue: { totalInvested, totalCurrentValue },
    transactionSpendThisMonth,
    transactionCountThisMonth,
    adHocSpendThisMonth: transactionSpendThisMonth,
    taxEstimate: (() => {
      const t = computeLiability({ grossSalary: monthlyIncome * 12, regime: 'New', deductions: { section80C: deductions.totalDeductions } });
      return { taxableIncome: t.taxableIncome, taxBeforeCess: t.incomeTaxAfterRebate, cess: t.cess, totalTax: t.finalTax };
    })(),
  };
}

async function buildMemberSummary(userId) {
  const [incomes, subs, recs, invs, loans, insurances, edus] = await Promise.all([
    Income.find({ memberId: userId }),
    Subscription.find({ memberId: userId, status: { $ne: 'Cancelled' } }),
    RecurringPayment.find({ memberId: userId }),
    Investment.find({ memberId: userId }),
    EMILoan.find({ memberId: userId, status: { $ne: 'Closed' } }),
    Insurance.find({ memberId: userId, status: { $ne: 'Lapsed' } }),
    EducationPayment.find({ memberId: userId }),
  ]);

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalObligations =
    subs.reduce((s, x) => s + subMonthlyAmount(x), 0) +
    recs.reduce((s, x) => s + (x.amount || 0), 0) +
    loans.reduce((s, x) => s + (x.emiAmount || 0), 0) +
    invs.reduce((s, x) => s + investmentMonthlyAmount(x), 0) +
    insurances.reduce((s, x) => s + insuranceMonthlyAmount(x), 0) +
    edus.reduce((s, x) => s + eduMonthlyAmount(x), 0);
  const totalInvestments = invs.reduce((s, d) => s + investedValue(d), 0);

  return { totalIncome, totalObligations, totalInvestments };
}

module.exports = { buildDashboard, buildMemberSummary };
