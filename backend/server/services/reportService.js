const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { PassThrough } = require('stream');

const Income = require('../models/income.model');
const Subscription = require('../models/subscription.model');
const RecurringPayment = require('../models/recurring.model');
const Investment = require('../models/investment.model');
const EMILoan = require('../models/loan.model');
const Insurance = require('../models/insurance.model');
const EducationPayment = require('../models/education.model');
const AdHocExpense = require('../models/expense.model');
const User = require('../models/user.model');
const Form16 = require('../models/form16.model');
const TaxRecommendation = require('../models/taxrecommendation.model');
const Transaction = require('../models/transaction.model');
const Budget = require('../models/budget.model');
const RecipientDirectory = require('../models/recipientdirectory.model');
const ImportBatch = require('../models/importbatch.model');
const FamilyAccount = require('../models/familyaccount.model');
const { getFamilyAnalytics } = require('./familyAnalytics.service');

const { investedValue, currentValueOf } = require('../utils/investmentCalc');
const { computeRegimeTaxes, aggregateDeductions, generateTips } = require('../services/tax.service');

const FREQ_MONTHS = { Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12 };

// --- shared value helpers (kept in sync with dashboard.service.js) ---
function subMonthlyAmount(s) {
  if (s.frequency === 'yearly') return (s.amount || 0) / 12;
  return s.amount || 0;
}
function insuranceMonthlyAmount(i) {
  const div = FREQ_MONTHS[i.premiumFrequency] || 12;
  return (i.premiumAmount || 0) / div;
}
function eduMonthlyAmount(e) {
  if (e.frequency === 'One-time') return 0;
  const div = FREQ_MONTHS[e.frequency] || 12;
  return (e.amount || 0) / div;
}
function investmentMonthlyAmount(inv) {
  if (inv.investmentType === 'mf_sip') return inv.sipAmount || 0;
  return 0;
}

function inr(n) {
  return '₹' + Math.round(n || 0).toLocaleString('en-IN');
}
function dateOnly(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}
function monthName(m) {
  return [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][m - 1] || String(m);
}

// ---------------------------------------------------------------------------
// Data builders
// ---------------------------------------------------------------------------

async function baseData(userId) {
  const [user, incomes, subs, recs, invs, loans, insurances, edus, expenses] =
    await Promise.all([
      User.findById(userId).select('name email').lean(),
      Income.find({ memberId: userId }),
      Subscription.find({ memberId: userId }),
      RecurringPayment.find({ memberId: userId }),
      Investment.find({ memberId: userId }),
      EMILoan.find({ memberId: userId }),
      Insurance.find({ memberId: userId }),
      EducationPayment.find({ memberId: userId }),
      AdHocExpense.find({ memberId: userId }),
    ]);
  return { user: user || {}, incomes, subs, recs, invs, loans, insurances, edus, expenses };
}

function buildObligations(subs, recs, invs, loans, insurances) {
  const subsActive = subs.filter((s) => s.status !== 'Cancelled');
  const loansActive = loans.filter((l) => l.status !== 'Closed' && l.status !== 'Prepaid');
  const insActive = insurances.filter((i) => i.status !== 'Lapsed' && i.status !== 'Matured');
  const sipInvs = invs.filter((i) => i.investmentType === 'mf_sip');

  const items = [
    ...subsActive.map((s) => ({ type: 'Subscription', name: s.name || 'Subscription', amount: subMonthlyAmount(s) })),
    ...loansActive.map((l) => ({ type: 'Loan EMI', name: l.loanName || 'Loan', amount: l.emiAmount || 0 })),
    ...insActive.map((i) => ({ type: 'Insurance', name: i.policyName || 'Insurance', amount: insuranceMonthlyAmount(i) })),
    ...recs.map((r) => ({ type: 'Recurring', name: r.title || 'Recurring', amount: r.amount || 0 })),
    ...sipInvs.map((i) => ({ type: 'SIP', name: i.fundName || i.stockName || 'SIP', amount: i.sipAmount || 0 })),
  ];
  const total = items.reduce((s, o) => s + (o.amount || 0), 0);
  return { items, total };
}

function buildInvestmentSnapshot(invs) {
  let totalInvested = 0;
  let totalCurrent = 0;
  const items = invs.map((d) => {
    const inv = investedValue(d);
    const cur = currentValueOf(d);
    totalInvested += inv;
    totalCurrent += cur;
    return {
      type: d.investmentType,
      name: d.fundName || d.stockName || d.assetName || d.bankName || 'Investment',
      invested: inv,
      current: cur,
    };
  });
  return { items, totalInvested, totalCurrent };
}

async function buildMonthlyData(userId, month, year) {
  const { user, incomes, subs, recs, invs, loans, insurances, expenses } = await baseData(userId);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const monthExpenses = expenses.filter((e) => e.date >= start && e.date < end);

  const byCategory = {};
  let expenseTotal = 0;
  for (const e of monthExpenses) {
    const c = e.category || 'Other';
    byCategory[c] = (byCategory[c] || 0) + (e.amount || 0);
    expenseTotal += e.amount || 0;
  }

  const monthlyIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const obligations = buildObligations(subs, recs, invs, loans, insurances);
  const inv = buildInvestmentSnapshot(invs);

  return {
    period: 'Monthly',
    month,
    year,
    title: `Monthly Report — ${monthName(month)} ${year}`,
    user,
    incomeItems: incomes.map((i) => ({ title: i.title || 'Income', category: i.category || 'Other', amount: i.amount || 0 })),
    monthlyIncome,
    obligations,
    expenseByCategory: byCategory,
    expenseTotal,
    expenses: monthExpenses,
    investment: inv,
    netMonthly: monthlyIncome - obligations.total,
  };
}

async function buildAnnualData(userId, year) {
  const { user, incomes, subs, recs, invs, loans, insurances, expenses } = await baseData(userId);

  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const yearExpenses = expenses.filter((e) => e.date >= start && e.date < end);

  const byCategory = {};
  let expenseTotal = 0;
  const monthlySeries = Array.from({ length: 12 }, () => 0);
  for (const e of yearExpenses) {
    const c = e.category || 'Other';
    byCategory[c] = (byCategory[c] || 0) + (e.amount || 0);
    expenseTotal += e.amount || 0;
    const m = new Date(e.date).getMonth();
    monthlySeries[m] += e.amount || 0;
  }

  const monthlyIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const monthlyObligations = buildObligations(subs, recs, invs, loans, insurances);
  const inv = buildInvestmentSnapshot(invs);

  return {
    period: 'Annual',
    year,
    title: `Annual Report — ${year}`,
    user,
    annualIncome: monthlyIncome * 12,
    annualObligations: monthlyObligations.total * 12,
    monthlyObligations,
    expenseByCategory: byCategory,
    expenseTotal,
    monthlyExpenseSeries: monthlySeries,
    investment: inv,
    netAnnual: monthlyIncome * 12 - monthlyObligations.total * 12,
  };
}

async function buildCategoryData(userId, from, to) {
  const { user, expenses } = await baseData(userId);
  const fromD = dateOnly(from);
  const toD = new Date(dateOnly(to).getTime() + 864e5 - 1); // inclusive of `to` day

  const items = expenses.filter((e) => {
    const d = dateOnly(e.date);
    return d >= fromD && d <= dateOnly(to);
  });

  const byCategory = {};
  let total = 0;
  for (const e of items) {
    const c = e.category || 'Other';
    byCategory[c] = (byCategory[c] || 0) + (e.amount || 0);
    total += e.amount || 0;
  }

  return {
    period: 'Category',
    from: fromD,
    to: dateOnly(to),
    title: `Expense Report — ${fromD.toISOString().slice(0, 10)} to ${dateOnly(to).toISOString().slice(0, 10)}`,
    user,
    byCategory,
    total,
    items,
  };
}

async function buildTaxData(userId, year) {
  const { user } = await baseData(userId);
  const incomes = await Income.find({ memberId: userId });
  const annualGross = incomes.reduce((s, i) => s + (i.amount || 0) * 12, 0);
  const deductions = await aggregateDeductions(userId);
  const { old, new: newR } = computeRegimeTaxes(annualGross, deductions);
  // Map the full trace to the lightweight shape the report renders.
  const toReport = (t) => ({
    taxableIncome: t.taxableIncome,
    taxBeforeCess: t.incomeTaxAfterRebate,
    cess: t.cess,
    totalTax: t.finalTax,
  });
  const oldRegime = toReport(old);
  const newRegime = toReport(newR);
  const recommended = old.finalTax <= newR.finalTax ? 'Old' : 'New';
  const savings = Math.abs(old.finalTax - newR.finalTax);
  const tips = await generateTips(userId);

  // Pull any stored recommendation for context.
  const stored = await TaxRecommendation.findOne({ userId }).sort({ generatedAt: -1 }).lean();

  return {
    period: 'Tax',
    year,
    title: `Tax Summary — ${year}`,
    user,
    annualGross,
    deductions,
    oldRegime,
    newRegime,
    recommended,
    savings,
    tips,
    stored,
  };
}

// ---------------------------------------------------------------------------
// PDF helpers (pdfkit)
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#FFFFFF',
  text: '#000000',
  yellow: '#FFC107',
  cyan: '#00E5FF',
  border: '#000000',
};

function startPdf(title) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
  doc.pipe(stream);

  // Global settings
  doc.lineWidth(2);
  
  // Title box with hard shadow
  const w = doc.page.width - 80;
  doc.rect(44, 44, w, 50).fill(COLORS.border); // shadow
  doc.rect(40, 40, w, 50).fillAndStroke(COLORS.yellow, COLORS.border); // box
  
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text);
  doc.text(title.toUpperCase(), 40, 56, { align: 'center', width: w });
  
  doc.y = 120;
  return { doc, done };
}

function section(doc, heading) {
  if (doc.y > doc.page.height - 100) doc.addPage();
  doc.moveDown(1);
  const w = doc.page.width - 80;
  
  // Section banner
  doc.rect(40, doc.y, w, 22).fillAndStroke(COLORS.border, COLORS.border);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF');
  doc.text(heading.toUpperCase(), 50, doc.y + 6);
  
  doc.y += 24; // space after banner
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
}

function kv(doc, key, value) {
  if (doc.y > doc.page.height - 40) doc.addPage();
  const y = doc.y;
  
  // Draw subtle row separator
  doc.moveTo(40, y + 16).lineTo(doc.page.width - 40, y + 16).lineWidth(1).strokeColor('#E0E0E0').stroke();
  doc.lineWidth(2).strokeColor(COLORS.border);

  doc.font('Helvetica-Bold').fillColor(COLORS.text).text(key, 50, y);
  doc.font('Helvetica').text(value, 50, y, { align: 'right', width: doc.page.width - 100 });
  doc.moveDown(0.75);
}

function bullet(doc, text) {
  if (doc.y > doc.page.height - 40) doc.addPage();
  doc.font('Helvetica-Bold').fillColor(COLORS.text).text('•', 50, doc.y, { continued: true });
  doc.font('Helvetica').text(`  ${text}`);
  doc.moveDown(0.25);
}

async function renderMonthlyPdf(data) {
  const { doc, done } = startPdf(data.title);
  if (data.user.name) kv(doc, 'Member', `${data.user.name} (${data.user.email || ''})`.trim());

  section(doc, 'Income');
  for (const i of data.incomeItems) bullet(doc, `${i.title} — ${inr(i.amount)}`);
  kv(doc, 'Total Monthly Income', inr(data.monthlyIncome));

  section(doc, 'Monthly Obligations');
  for (const o of data.obligations.items) bullet(doc, `${o.type}: ${o.name} — ${inr(o.amount)}`);
  kv(doc, 'Total Monthly Obligations', inr(data.obligations.total));

  section(doc, 'Expenses');
  const cats = Object.keys(data.expenseByCategory);
  if (cats.length === 0) doc.text('  No expenses recorded this month.');
  for (const c of cats) bullet(doc, `${c} — ${inr(data.expenseByCategory[c])}`);
  kv(doc, 'Total Expenses', inr(data.expenseTotal));

  section(doc, 'Investment Snapshot');
  for (const i of data.investment.items) bullet(doc, `${i.name} (${i.type}) — invested ${inr(i.invested)}, current ${inr(i.current)}`);
  kv(doc, 'Total Invested', inr(data.investment.totalInvested));
  kv(doc, 'Total Current Value', inr(data.investment.totalCurrent));

  section(doc, 'Summary');
  kv(doc, 'Net Monthly Flow', inr(data.netMonthly));

  doc.end();
  return done;
}

async function renderAnnualPdf(data) {
  const { doc, done } = startPdf(data.title);
  if (data.user.name) kv(doc, 'Member', `${data.user.name} (${data.user.email || ''})`.trim());

  section(doc, 'Income & Obligations');
  kv(doc, 'Annual Income', inr(data.annualIncome));
  kv(doc, 'Annual Obligations', inr(data.annualObligations));
  kv(doc, 'Net Annual Flow', inr(data.netAnnual));

  section(doc, 'Expenses by Category');
  const cats = Object.keys(data.expenseByCategory);
  if (cats.length === 0) doc.text('  No expenses recorded this year.');
  for (const c of cats) bullet(doc, `${c} — ${inr(data.expenseByCategory[c])}`);
  kv(doc, 'Total Expenses', inr(data.expenseTotal));

  section(doc, 'Monthly Expense Trend');
  data.monthlyExpenseSeries.forEach((amt, idx) => bullet(doc, `${monthName(idx + 1)} — ${inr(amt)}`));

  section(doc, 'Investment Snapshot');
  for (const i of data.investment.items) bullet(doc, `${i.name} (${i.type}) — invested ${inr(i.invested)}, current ${inr(i.current)}`);
  kv(doc, 'Total Invested', inr(data.investment.totalInvested));
  kv(doc, 'Total Current Value', inr(data.investment.totalCurrent));

  doc.end();
  return done;
}

async function renderCategoryPdf(data) {
  const { doc, done } = startPdf(data.title);
  if (data.user.name) kv(doc, 'Member', `${data.user.name} (${data.user.email || ''})`.trim());

  section(doc, 'By Category');
  const cats = Object.keys(data.byCategory);
  if (cats.length === 0) doc.text('  No expenses in this date range.');
  for (const c of cats) bullet(doc, `${c} — ${inr(data.byCategory[c])}`);
  kv(doc, 'Total', inr(data.total));

  section(doc, 'Transactions');
  if (data.items.length === 0) doc.text('  None.');
  for (const e of data.items) bullet(doc, `${new Date(e.date).toISOString().slice(0, 10)} — ${e.title || 'Expense'} (${e.category || 'Other'}) — ${inr(e.amount)}`);

  doc.end();
  return done;
}

async function renderTaxPdf(data) {
  const { doc, done } = startPdf(data.title);
  if (data.user.name) kv(doc, 'Member', `${data.user.name} (${data.user.email || ''})`.trim());

  section(doc, 'Income & Deductions');
  kv(doc, 'Annual Gross Income', inr(data.annualGross));
  kv(doc, 'Section 80C', inr(data.deductions.section80C));
  kv(doc, 'Section 80CCD', inr(data.deductions.section80CCD));
  kv(doc, 'Section 80D', inr(data.deductions.section80D));
  kv(doc, 'Section 80E', inr(data.deductions.section80E));
  kv(doc, 'Section 24', inr(data.deductions.section24));
  kv(doc, 'Total Deductions', inr(data.deductions.totalDeductions));

  section(doc, 'Old Regime');
  kv(doc, 'Taxable Income', inr(data.oldRegime.taxableIncome));
  kv(doc, 'Tax', inr(data.oldRegime.taxBeforeCess));
  kv(doc, 'Cess', inr(data.oldRegime.cess));
  kv(doc, 'Total Tax', inr(data.oldRegime.totalTax));

  section(doc, 'New Regime');
  kv(doc, 'Taxable Income', inr(data.newRegime.taxableIncome));
  kv(doc, 'Tax', inr(data.newRegime.taxBeforeCess));
  kv(doc, 'Cess', inr(data.newRegime.cess));
  kv(doc, 'Total Tax', inr(data.newRegime.totalTax));

  section(doc, 'Recommendation');
  kv(doc, 'Recommended Regime', data.recommended);
  kv(doc, 'Estimated Savings', inr(data.savings));
  if (data.stored && data.stored.explanation) bullet(doc, data.stored.explanation);

  section(doc, 'Tax-Saving Tips');
  if (data.tips.length === 0) doc.text('  None.');
  for (const t of data.tips) bullet(doc, t);

  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// Excel helpers (exceljs)
// ---------------------------------------------------------------------------

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 22 }));
  if (rows && rows.length) ws.addRows(rows);
  return ws;
}

async function renderExcel(title, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinTrack';
  wb.created = new Date();
  for (const s of sheets) addSheet(wb, s.name, s.columns, s.rows);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function renderMonthlyExcel(data) {
  return renderExcel(data.title, [
    {
      name: 'Summary',
      columns: [
        { header: 'Metric', key: 'metric' },
        { header: 'Amount', key: 'amount' },
      ],
      rows: [
        { metric: 'Total Monthly Income', amount: data.monthlyIncome },
        { metric: 'Total Monthly Obligations', amount: data.obligations.total },
        { metric: 'Total Expenses', amount: data.expenseTotal },
        { metric: 'Net Monthly Flow', amount: data.netMonthly },
        { metric: 'Total Invested', amount: data.investment.totalInvested },
        { metric: 'Total Current Value', amount: data.investment.totalCurrent },
      ],
    },
    {
      name: 'Income',
      columns: [{ header: 'Title', key: 'title' }, { header: 'Category', key: 'category' }, { header: 'Amount', key: 'amount' }],
      rows: data.incomeItems,
    },
    {
      name: 'Obligations',
      columns: [{ header: 'Type', key: 'type' }, { header: 'Name', key: 'name' }, { header: 'Amount', key: 'amount' }],
      rows: data.obligations.items,
    },
    {
      name: 'Expenses',
      columns: [{ header: 'Category', key: 'category' }, { header: 'Amount', key: 'amount' }],
      rows: Object.keys(data.expenseByCategory).map((c) => ({ category: c, amount: data.expenseByCategory[c] })),
    },
    {
      name: 'Investments',
      columns: [{ header: 'Name', key: 'name' }, { header: 'Type', key: 'type' }, { header: 'Invested', key: 'invested' }, { header: 'Current', key: 'current' }],
      rows: data.investment.items,
    },
  ]);
}

async function renderAnnualExcel(data) {
  return renderExcel(data.title, [
    {
      name: 'Summary',
      columns: [{ header: 'Metric', key: 'metric' }, { header: 'Amount', key: 'amount' }],
      rows: [
        { metric: 'Annual Income', amount: data.annualIncome },
        { metric: 'Annual Obligations', amount: data.annualObligations },
        { metric: 'Total Expenses', amount: data.expenseTotal },
        { metric: 'Net Annual Flow', amount: data.netAnnual },
        { metric: 'Total Invested', amount: data.investment.totalInvested },
        { metric: 'Total Current Value', amount: data.investment.totalCurrent },
      ],
    },
    {
      name: 'Expenses by Category',
      columns: [{ header: 'Category', key: 'category' }, { header: 'Amount', key: 'amount' }],
      rows: Object.keys(data.expenseByCategory).map((c) => ({ category: c, amount: data.expenseByCategory[c] })),
    },
    {
      name: 'Monthly Expense Trend',
      columns: [{ header: 'Month', key: 'month' }, { header: 'Amount', key: 'amount' }],
      rows: data.monthlyExpenseSeries.map((amt, idx) => ({ month: monthName(idx + 1), amount: amt })),
    },
    {
      name: 'Investments',
      columns: [{ header: 'Name', key: 'name' }, { header: 'Type', key: 'type' }, { header: 'Invested', key: 'invested' }, { header: 'Current', key: 'current' }],
      rows: data.investment.items,
    },
  ]);
}

async function renderCategoryExcel(data) {
  return renderExcel(data.title, [
    {
      name: 'Summary',
      columns: [{ header: 'Category', key: 'category' }, { header: 'Amount', key: 'amount' }],
      rows: Object.keys(data.byCategory).map((c) => ({ category: c, amount: data.byCategory[c] })).concat([{ category: 'TOTAL', amount: data.total }]),
    },
    {
      name: 'Transactions',
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Title', key: 'title' },
        { header: 'Category', key: 'category' },
        { header: 'Amount', key: 'amount' },
      ],
      rows: data.items.map((e) => ({
        date: new Date(e.date).toISOString().slice(0, 10),
        title: e.title || 'Expense',
        category: e.category || 'Other',
        amount: e.amount || 0,
      })),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function generateMonthlyPDF(userId, month, year) {
  return renderMonthlyPdf(await buildMonthlyData(userId, month, year));
}
async function generateMonthlyExcel(userId, month, year) {
  return renderMonthlyExcel(await buildMonthlyData(userId, month, year));
}
async function generateAnnualPDF(userId, year) {
  return renderAnnualPdf(await buildAnnualData(userId, year));
}
async function generateAnnualExcel(userId, year) {
  return renderAnnualExcel(await buildAnnualData(userId, year));
}
async function generateCategoryPDF(userId, from, to) {
  return renderCategoryPdf(await buildCategoryData(userId, from, to));
}
async function generateCategoryExcel(userId, from, to) {
  return renderCategoryExcel(await buildCategoryData(userId, from, to));
}
async function generateTaxPDF(userId, year) {
  return renderTaxPdf(await buildTaxData(userId, year));
}

async function buildFamilyData(familyId, from, to, requesterId) {
  const analytics = await getFamilyAnalytics({ familyId, from, to, requesterId });
  const family = await FamilyAccount.findById(familyId).lean();
  const members = await User.find({ familyAccountId: familyId }).select('name email role').lean();
  const budgets = await Budget.find({ familyId }).lean();
  const vendors = await RecipientDirectory.find({ familyId, status: { $ne: 'ARCHIVED' } }).sort({ hits: -1 }).limit(20).lean();
  const recentBatches = await ImportBatch.find({ familyId }).sort({ createdAt: -1 }).limit(10).lean();
  const txCount = await Transaction.countDocuments({ familyId, status: { $ne: 'VOIDED' } });
  return { analytics, family: family || { name: 'Family' }, members, budgets, vendors, recentBatches, txCount, from, to };
}

async function renderFamilyPdf(data) {
  const { doc, done } = startPdf(`Family Report — ${data.from || ''} to ${data.to || ''}`.trim() || 'Family Report');
  kv(doc, 'Family', data.family.name || 'Family');
  kv(doc, 'Members', data.members.map((m) => `${m.name} (${m.email})`).join(', ') || '—');
  kv(doc, 'Period', `${data.from || 'start'} to ${data.to || 'today'}`);
  kv(doc, 'Transactions', String(data.txCount));
  kv(doc, 'Total Spend', inr((data.analytics.summary.actualExpenditurePaise || 0) / 100));
  kv(doc, 'Avg / day', inr(data.analytics.avgDaily || 0));

  section(doc, 'By Member Share (100%)');
  if (!data.analytics.byMemberShare || data.analytics.byMemberShare.length === 0) doc.text('  No data.');
  else for (const m of data.analytics.byMemberShare) bullet(doc, `${m.name} — ${inr(m.spend)} (${m.sharePct.toFixed(1)}%) ×${m.count}`);

  section(doc, 'By Category Share (100%)');
  if (!data.analytics.byCategoryShare || data.analytics.byCategoryShare.length === 0) doc.text('  No data.');
  else for (const c of data.analytics.byCategoryShare) bullet(doc, `${c.category} — ${inr(c.spend)} (${c.sharePct.toFixed(1)}%)`);

  section(doc, 'By Vendor Share (100%)');
  if (!data.analytics.byVendorShare || data.analytics.byVendorShare.length === 0) doc.text('  No vendors.');
  else for (const v of data.analytics.byVendorShare) bullet(doc, `${v.vendor} — ${inr(v.spend)} (${v.sharePct.toFixed(1)}%) ×${v.count}`);

  section(doc, 'By Mode Share');
  if (!data.analytics.byModeShare || data.analytics.byModeShare.length === 0) doc.text('  No mode data.');
  else for (const m of data.analytics.byModeShare) bullet(doc, `${m.mode} — ${inr(m.spend)} (${m.sharePct?.toFixed(1) ?? ''}%)`);

  section(doc, 'Member × Vendor (top)');
  if (!data.analytics.byMemberByVendor || data.analytics.byMemberByVendor.length === 0) doc.text('  No data.');
  else for (const r of data.analytics.byMemberByVendor.slice(0, 20)) bullet(doc, `${r.memberName} → ${r.vendor} — ${inr(r.spend)} ×${r.count}`);

  section(doc, 'Monthly Area (Income vs Expense)');
  if (!data.analytics.monthlyArea || data.analytics.monthlyArea.length === 0) doc.text('  No monthly data.');
  else for (const m of data.analytics.monthlyArea) bullet(doc, `${m.month} — Expense ${inr(m.expense)} | Income ${inr(m.income)} | Net ${inr(m.net)}`);

  section(doc, 'Budgets (Transaction-based)');
  if (data.budgets.length === 0) doc.text('  No budgets.');
  else for (const b of data.budgets) bullet(doc, `${b.scope}${b.category ? `:${b.category}` : ''}${b.memberId ? ` (member)` : ''} — ${inr(b.amountPaise / 100)} period ${b.periodKey || ''}`);

  section(doc, 'Top Vendors (what they sell)');
  if (data.vendors.length === 0) doc.text('  No vendors.');
  else for (const v of data.vendors.slice(0, 10)) bullet(doc, `${v.label} (${v.vendorKey}) — ${v.primaryCategory || v.category || 'Other'} hits ${v.hits} products ${(v.products || []).map((p) => p.name).join(', ') || '—'}`);

  section(doc, 'Recent Imports');
  if (data.recentBatches.length === 0) doc.text('  No imports.');
  else for (const b of data.recentBatches) bullet(doc, `${b.fileName || b.batchId} — ${b.total} rows ${b.status} ${new Date(b.createdAt).toISOString().slice(0, 10)}`);

  section(doc, 'Note');
  bullet(doc, 'Private transactions are excluded from family aggregates (invisible to other members).');
  bullet(doc, 'All amounts derived from Transaction ledger (source of truth). Variable bills tolerance 15% for Utility, 5% otherwise.');

  doc.end();
  return done;
}

async function renderFamilyExcel(data) {
  const sheets = [
    {
      name: 'Summary',
      columns: [{ header: 'Metric', key: 'metric' }, { header: 'Value', key: 'value' }],
      rows: [
        { metric: 'Family', value: data.family.name || '' },
        { metric: 'Members', value: data.members.map((m) => m.name).join(', ') },
        { metric: 'Period From', value: data.from || '' },
        { metric: 'Period To', value: data.to || '' },
        { metric: 'Transactions', value: data.txCount },
        { metric: 'Total Spend', value: (data.analytics.summary.actualExpenditurePaise || 0) / 100 },
        { metric: 'Avg / day', value: data.analytics.avgDaily || 0 },
      ],
    },
    {
      name: 'By Member Share',
      columns: [{ header: 'Member', key: 'name' }, { header: 'Spend', key: 'spend' }, { header: 'Share %', key: 'sharePct' }, { header: 'Count', key: 'count' }],
      rows: (data.analytics.byMemberShare || []).map((m) => ({ name: m.name, spend: m.spend, sharePct: Number(m.sharePct.toFixed(2)), count: m.count })),
    },
    {
      name: 'By Category Share',
      columns: [{ header: 'Category', key: 'category' }, { header: 'Spend', key: 'spend' }, { header: 'Share %', key: 'sharePct' }],
      rows: (data.analytics.byCategoryShare || []).map((c) => ({ category: c.category, spend: c.spend, sharePct: Number(c.sharePct.toFixed(2)) })),
    },
    {
      name: 'By Vendor Share',
      columns: [{ header: 'Vendor', key: 'vendor' }, { header: 'Spend', key: 'spend' }, { header: 'Share %', key: 'sharePct' }, { header: 'Count', key: 'count' }],
      rows: (data.analytics.byVendorShare || []).map((v) => ({ vendor: v.vendor, spend: v.spend, sharePct: Number(v.sharePct.toFixed(2)), count: v.count })),
    },
    {
      name: 'By Mode Share',
      columns: [{ header: 'Mode', key: 'mode' }, { header: 'Spend', key: 'spend' }, { header: 'Share %', key: 'sharePct' }],
      rows: (data.analytics.byModeShare || []).map((m) => ({ mode: m.mode, spend: m.spend, sharePct: Number((m.sharePct || 0).toFixed(2)) })),
    },
    {
      name: 'Member x Vendor',
      columns: [{ header: 'Member', key: 'memberName' }, { header: 'Vendor', key: 'vendor' }, { header: 'Spend', key: 'spend' }, { header: 'Count', key: 'count' }],
      rows: (data.analytics.byMemberByVendor || []).map((r) => ({ memberName: r.memberName, vendor: r.vendor, spend: r.spend, count: r.count })),
    },
    {
      name: 'Monthly Area',
      columns: [{ header: 'Month', key: 'month' }, { header: 'Expense', key: 'expense' }, { header: 'Income', key: 'income' }, { header: 'Net', key: 'net' }],
      rows: (data.analytics.monthlyArea || []).map((m) => ({ month: m.month, expense: m.expense, income: m.income, net: m.net })),
    },
    {
      name: 'Budgets',
      columns: [{ header: 'Scope', key: 'scope' }, { header: 'Category', key: 'category' }, { header: 'Amount', key: 'amount' }, { header: 'Period', key: 'period' }],
      rows: data.budgets.map((b) => ({ scope: b.scope, category: b.category || '', amount: (b.amountPaise || 0) / 100, period: b.periodKey || b.period })),
    },
    {
      name: 'Vendors',
      columns: [{ header: 'Label', key: 'label' }, { header: 'VendorKey', key: 'vendorKey' }, { header: 'Category', key: 'category' }, { header: 'Hits', key: 'hits' }],
      rows: data.vendors.map((v) => ({ label: v.label, vendorKey: v.vendorKey, category: v.primaryCategory || v.category || '', hits: v.hits })),
    },
  ];
  return renderExcel('Family Report', sheets);
}

async function buildFamilyDataWrapper(familyId, from, to, requesterId) {
  return buildFamilyData(familyId, from, to, requesterId);
}

async function generateFamilyPDF(familyId, from, to, requesterId) {
  return renderFamilyPdf(await buildFamilyData(familyId, from, to, requesterId));
}
async function generateFamilyExcel(familyId, from, to, requesterId) {
  return renderFamilyExcel(await buildFamilyData(familyId, from, to, requesterId));
}

module.exports = {
  buildMonthlyData,
  buildAnnualData,
  buildCategoryData,
  buildTaxData,
  generateMonthlyPDF,
  generateMonthlyExcel,
  generateAnnualPDF,
  generateAnnualExcel,
  generateCategoryPDF,
  generateCategoryExcel,
  generateTaxPDF,
  buildFamilyData,
  generateFamilyPDF,
  generateFamilyExcel,
};
