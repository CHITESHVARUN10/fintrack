const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  calcEMI,
  amortizationSchedule,
  yearlySummary,
  calcFull,
  monthsBetween,
  outstandingAfterK,
  prepaymentImpact,
  validateLoanInputs,
} = require('./loanCalc');

test('calcEMI: known test vectors', () => {
  // Vector 1: 10 Lakhs @ 8.0% for 10 years (120 months)
  // Standard financial formula: EMI = 12,133
  const v1 = calcEMI(1000000, 8.0, 120);
  assert.equal(v1.emi, 12133);
  assert.equal(v1.totalPayable, 12133 * 120);
  assert.equal(v1.totalInterest, 12133 * 120 - 1000000);

  // Vector 2: 30 Lakhs @ 8.5% for 20 years (240 months)
  // Standard financial formula: EMI = 26,035
  const v2 = calcEMI(3000000, 8.5, 240);
  assert.equal(v2.emi, 26035);
  assert.equal(v2.totalPayable, 26035 * 240);
  assert.equal(v2.totalInterest, 26035 * 240 - 3000000);

  // Vector 3: 0% Interest Rate
  const v3 = calcEMI(120000, 0, 12);
  assert.equal(v3.emi, 10000);
  assert.equal(v3.totalPayable, 120000);
  assert.equal(v3.totalInterest, 0);

  // Vector 4: 1 Month Tenure
  const v4 = calcEMI(50000, 12, 1);
  assert.equal(v4.emi, 50500);
  assert.equal(v4.totalInterest, 500);
});

test('amortizationSchedule: schedule generation & last EMI adjustment', () => {
  const P = 1000000;
  const rate = 8.5;
  const n = 120;
  const schedule = amortizationSchedule(P, rate, n, { startDate: '2025-01-01', emiDate: 5 });

  assert.equal(schedule.length, n);
  assert.equal(schedule[0].month, 1);
  assert.equal(schedule[0].opening, 1000000);
  assert.equal(schedule[schedule.length - 1].month, n);
  assert.equal(schedule[schedule.length - 1].closing, 0); // last EMI adjusted to clear exact balance

  // verify continuity: opening of row i+1 == closing of row i
  for (let i = 0; i < schedule.length - 1; i++) {
    assert.equal(schedule[i + 1].opening, schedule[i].closing);
  }

  // sum of principals should equal original principal
  const totalPrincipal = schedule.reduce((s, r) => s + r.principal, 0);
  assert.equal(totalPrincipal, P);
});

test('yearlySummary: aggregates 12 months per year', () => {
  const schedule = amortizationSchedule(1200000, 9.0, 36, { startDate: '2025-01-01' });
  const yearly = yearlySummary(schedule, '2025-01-01');

  assert.equal(yearly.length, 3);
  assert.equal(yearly[0].yearIndex, 1);
  assert.equal(yearly[2].yearIndex, 3);
  assert.equal(yearly[2].closing, 0);

  const totalYearlyEmi = yearly.reduce((s, y) => s + y.emiTotal, 0);
  const totalScheduleEmi = schedule.reduce((s, r) => s + r.emi, 0);
  assert.equal(totalYearlyEmi, totalScheduleEmi);
});

test('prepaymentImpact: tenure reduction mode (default)', () => {
  // 30L @ 8.5% for 240 months, prepaying 3 Lakhs after 24 months (2 years)
  const emi = calcEMI(3000000, 8.5, 240).emi;
  const res = prepaymentImpact({
    principal: 3000000,
    annualRatePct: 8.5,
    totalMonths: 240,
    paidMonths: 24,
    emi,
    prepayAmount: 300000,
    prepayAtMonth: 24,
    mode: 'tenure',
    startDate: '2025-01-01',
    emiDate: 5,
  });

  // Tenure should be shortened, EMI remains same
  assert.equal(res.withPrepay.emi, emi);
  assert.equal(res.monthsSaved, 45); // 45 months (~3.75 years) saved
  assert.ok(res.interestSaved > 600000, `interestSaved was ${res.interestSaved}`); // saves over 6 Lakhs in interest!
  assert.equal(res.withPrepay.months + res.monthsSaved, 240);
});

test('prepaymentImpact: EMI reduction mode', () => {
  const emi = calcEMI(3000000, 8.5, 240).emi;
  const res = prepaymentImpact({
    principal: 3000000,
    annualRatePct: 8.5,
    totalMonths: 240,
    paidMonths: 24,
    emi,
    prepayAmount: 300000,
    prepayAtMonth: 24,
    mode: 'emi',
    startDate: '2025-01-01',
    emiDate: 5,
  });

  // Tenure should remain same, EMI should decrease
  assert.equal(res.monthsSaved, 0);
  assert.equal(res.withPrepay.months, 240);
  assert.ok(res.withPrepay.emi < emi);
  assert.ok(res.interestSaved > 200000);
});

test('prepaymentImpact: early prepay vs late prepay savings comparison', () => {
  const emi = calcEMI(3000000, 8.5, 240).emi;
  // Year 1 prepay (month 12)
  const early = prepaymentImpact({
    principal: 3000000,
    annualRatePct: 8.5,
    totalMonths: 240,
    paidMonths: 12,
    emi,
    prepayAmount: 200000,
    prepayAtMonth: 12,
    mode: 'tenure',
  });

  // Year 15 prepay (month 180)
  const late = prepaymentImpact({
    principal: 3000000,
    annualRatePct: 8.5,
    totalMonths: 240,
    paidMonths: 180,
    emi,
    prepayAmount: 200000,
    prepayAtMonth: 180,
    mode: 'tenure',
  });

  // Early prepayment saves drastically more interest than late prepayment
  assert.ok(early.interestSaved > late.interestSaved * 2, 'Early prepay saves 2x+ more than late');
});

test('prepaymentImpact: prepay exceeding outstanding amount closes loan', () => {
  const emi = calcEMI(500000, 10, 60).emi;
  const res = prepaymentImpact({
    principal: 500000,
    annualRatePct: 10,
    totalMonths: 60,
    paidMonths: 12,
    emi,
    prepayAmount: 1000000, // exceeds remaining balance
    prepayAtMonth: 12,
    mode: 'tenure',
  });

  assert.equal(res.outstandingAfterPrepay, 0);
  assert.equal(res.withPrepay.months, 12);
  assert.equal(res.monthsSaved, 48);
});

test('validateLoanInputs: boundary checks', () => {
  assert.ok(validateLoanInputs(0, 8, 120).length > 0);
  assert.ok(validateLoanInputs(500, 8, 120).length > 0); // < 1000
  assert.ok(validateLoanInputs(1000000, -1, 120).length > 0);
  assert.ok(validateLoanInputs(1000000, 35, 120).length > 0); // > 30%
  assert.ok(validateLoanInputs(1000000, 8, 0).length > 0);
  assert.ok(validateLoanInputs(1000000, 8, 400).length > 0); // > 360 months
  assert.equal(validateLoanInputs(1000000, 8.5, 240).length, 0);
});
