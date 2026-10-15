const { test } = require('node:test');
const assert = require('node:assert/strict');
const Investment = require('../models/investment.model');
const Insurance = require('../models/insurance.model');
const Loan = require('../models/loan.model');
const Education = require('../models/education.model');
const { aggregateDeductions } = require('./tax.service');
const { generateRecommendation } = require('./gemini.service');

test('supplemental deductions count only declared paid amounts in the selected FY', async t => {
  t.mock.method(Investment, 'find', async () => [{ totalInvested: 1500000, fundCategory: 'ELSS', taxPayments: [
    { financialYear: '2024-25', section: '80C', amount: 90000 },
    { financialYear: '2025-26', section: '80C', amount: 30000 },
  ] }]);
  t.mock.method(Insurance, 'find', async () => [{ insuranceType: 'Health', premiumAmount: 50000, premiumFrequency: 'Yearly', taxPayments: [{ financialYear: '2025-26', section: '80D', amount: 12000 }] }]);
  t.mock.method(Loan, 'find', async () => [{ loanType: 'Home', principalAmount: 10000000, interestRate: 9, emiAmount: 90000, taxPayments: [{ financialYear: '2025-26', section: '24b', amount: 80000 }] }]);
  t.mock.method(Education, 'find', async () => [{ amount: 10000, frequency: 'Monthly', taxPayments: [{ financialYear: '2025-26', section: '80C', amount: 15000 }] }]);
  const current = await aggregateDeductions('user', '2025-26');
  assert.equal(current.section80C, 45000);
  assert.equal(current.section80D, 12000);
  assert.equal(current.section24, 80000);
  assert.equal(current.totalDeductions, 137000);
  const previous = await aggregateDeductions('user', '2024-25');
  assert.equal(previous.section80C, 90000); assert.equal(previous.section24, 0);
});
test('legacy holdings and scheduled payments without a paid amount do not become deductions', async t => {
  t.mock.method(Investment, 'find', async () => [{ fundCategory: 'ELSS', totalInvested: 1500000 }]);
  t.mock.method(Insurance, 'find', async () => [{ insuranceType: 'Health', premiumAmount: 50000, premiumFrequency: 'Yearly' }]);
  t.mock.method(Loan, 'find', async () => [{ loanType: 'Home', principalAmount: 10000000, interestRate: 9, emiAmount: 90000 }]);
  t.mock.method(Education, 'find', async () => [{ amount: 10000, frequency: 'Monthly' }]);
  assert.equal((await aggregateDeductions('user', '2025-26')).totalDeductions, 0);
});
test('paid amount schema rejects negative amounts and malformed financial years', () => {
  const invalid = new Investment({ taxPayments: [{ financialYear: 'wrong', section: '80C', amount: -100 }] });
  const errors = invalid.validateSync().errors;
  assert.ok(errors['taxPayments.0.financialYear']); assert.ok(errors['taxPayments.0.amount']);
});
test('an empty finalized deduction array remains empty instead of remerging records', async () => {
  const rec = await generateRecommendation({ grossSalary: 1000000, financialYear: '2025-26' }, {}, { section80C: 150000 }, 0, []);
  assert.deepEqual(rec.deductionLineItems, []);
});
test('recommendation suggestions retain the section/action metadata required by the web client', async () => {
  const rec = await generateRecommendation({ grossSalary: 1000000, financialYear: '2025-26', section80D: 12000 }, {}, {}, 0);
  assert.ok(rec.taxSavingSuggestions.length > 0);
  assert.ok(rec.taxSavingSuggestions.every(s => s.section && s.suggestionType && s.suggestion));
});
