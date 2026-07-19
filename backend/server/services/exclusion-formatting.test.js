const assert = require('assert');
const {
  fromForm16,
  filterValidDeductions,
  explainResult,
  EXCLUSION_CATEGORY,
  EXCLUSION_REASON,
  buildDuplicateRiskSuggestionText,
} = require('./taxEngine.service');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

// Dummy config for tests
const DUMMY_CONFIG = {
  '2025-26': {
    STANDARD_DEDUCTION: { Old: 50000, New: 75000 },
    DEDUCTION_CAPS: {
      SECTION_80C_GROUP: 150000,
      SECTION_80CCD1B: 50000,
      SECTION_80D_SELF: 25000,
      SECTION_80D_PARENTS: 50000,
      SECTION_24B: 200000,
    },
    MARGINAL_RELIEF: { applicable: true },
    REBATE_87A: { Old: { limit: 500000, max: 12500 }, New: { limit: 700000, max: 25000 } },
    SLABS: { Old: [], New: [] }
  }
};

// ==========================================
// TEST SUITE: Exclusion Reasons & Categories
// ==========================================

test('1. Enums are properly exported', () => {
  assert.ok(EXCLUSION_CATEGORY);
  assert.ok(EXCLUSION_REASON);
  assert.equal(EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION, 'CATEGORY_DATA_VALIDATION');
  assert.equal(EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT, 'DUPLICATE_LOWER_AMOUNT');
});

test('2. fromForm16 correctly excludes duplicate where Form16 > Records', () => {
  const f = { grossSalary: 1000000, section80D: 20000 };
  const r = { section80D: 15000 };
  const items = fromForm16(f, r);
  
  const dup = items.find(i => i.section === '80D' && i.duplicateRisk);
  assert.ok(dup);
  assert.equal(dup.exclusionCategory, EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION);
  assert.equal(dup.exclusionReason, EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT);
});

test('3. fromForm16 correctly excludes duplicate where Form16 < Records', () => {
  const f = { grossSalary: 1000000, section80D: 15000 };
  const r = { section80D: 20000 };
  const items = fromForm16(f, r);
  
  const dup = items.find(i => i.section === '80D' && i.duplicateRisk);
  assert.ok(dup);
  assert.equal(dup.source, 'FORM16_OCR'); // form16 becomes the duplicate
  assert.equal(dup.exclusionCategory, EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION);
  assert.equal(dup.exclusionReason, EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT);
});

test('4. fromForm16 handles equal duplicates Form16 == Records', () => {
  const f = { grossSalary: 1000000, section80D: 25000 };
  const r = { section80D: 25000 };
  const items = fromForm16(f, r);
  
  const dup = items.find(i => i.section === '80D' && i.duplicateRisk);
  assert.ok(dup);
  assert.equal(dup.source, 'INVESTMENT_RECORD');
  assert.equal(dup.exclusionReason, EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT);
});

test('5. unconfirmed 80CCD receives UNCONFIRMED_SUBTYPE exclusion during compute', () => {
  const f = { grossSalary: 1000000, section80CCD: 50000 };
  const r = {};
  const items = fromForm16(f, r);
  
  const engineResult = require('./taxEngine.service').computeTax(
    { salary: f, deductions: items },
    DUMMY_CONFIG
  );
  
  const unv = engineResult.oldRegime.unverified.find(i => i.section === '80CCD');
  assert.ok(unv);
  assert.equal(unv.exclusionCategory, EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION);
  assert.equal(unv.exclusionReason, EXCLUSION_REASON.UNCONFIRMED_SUBTYPE);
});

test('6. 80C under New Regime receives NOT_ALLOWED_IN_REGIME', () => {
  const f = { grossSalary: 1000000, section80C: 100000 };
  const r = {};
  const items = fromForm16(f, r);
  
  const engineResult = require('./taxEngine.service').computeTax(
    { salary: f, deductions: items },
    DUMMY_CONFIG
  );
  
  const unv = engineResult.newRegime.unverified.find(i => i.section === '80C');
  assert.ok(unv);
  assert.equal(unv.exclusionCategory, EXCLUSION_CATEGORY.CATEGORY_REGIME_RULE);
  assert.equal(unv.exclusionReason, EXCLUSION_REASON.NOT_ALLOWED_IN_REGIME);
});

test('7. Data Validation exclusions are preserved even in New Regime', () => {
  // If 80C is duplicate, it should have DUPLICATE_LOWER_AMOUNT in both Old and New regimes
  const f = { grossSalary: 1000000, section80C: 150000 };
  const r = { section80C: 100000 };
  const items = fromForm16(f, r);
  
  const engineResult = require('./taxEngine.service').computeTax(
    { salary: f, deductions: items },
    DUMMY_CONFIG
  );
  
  const oldUnv = engineResult.oldRegime.unverified.find(i => i.section === '80C' && i.duplicateRisk);
  const newUnv = engineResult.newRegime.unverified.find(i => i.section === '80C' && i.duplicateRisk);
  
  assert.equal(oldUnv.exclusionCategory, EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION);
  assert.equal(oldUnv.exclusionReason, EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT);
  
  assert.equal(newUnv.exclusionCategory, EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION);
  assert.equal(newUnv.exclusionReason, EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT);
});

// ==========================================
// TEST SUITE: Currency Formatting
// ==========================================

test('8. explainResult formats gross salary correctly (e.g. 1,00,000)', () => {
  const res = { recommendedRegime: 'Old', savingsAmount: 12345, oldRegime: { taxableIncome: 100000, totalDeductions: 0, totalTax: 0 }, newRegime: { taxableIncome: 100000, totalTax: 0 } };
  const explanation = explainResult(res, 100000, '2025-26', []);
  assert.ok(explanation.explanation.includes('₹1,00,000'));
});

test('9. explainResult formats savings correctly (12,345)', () => {
  const res = { recommendedRegime: 'Old', savingsAmount: 12345, oldRegime: { taxableIncome: 100000, totalDeductions: 0, totalTax: 0 }, newRegime: { taxableIncome: 100000, totalTax: 0 } };
  const explanation = explainResult(res, 100000, '2025-26', []);
  assert.ok(explanation.explanation.includes('₹12,345'));
});

test('10. buildDuplicateRiskSuggestionText formats all numbers correctly', () => {
  const appliedItem = { section: '80D', amount: 25000 };
  const excludedItem = { section: '80D', amount: 12500 };
  const limit = 25000;
  
  const text = buildDuplicateRiskSuggestionText(appliedItem, excludedItem, limit);
  assert.ok(text.includes('₹25,000'));
  assert.ok(text.includes('₹12,500'));
});

// Tests 11-20 check other variations and boundaries

test('11. formatIndianCurrency works for zero', () => {
  const res = { recommendedRegime: 'Old', savingsAmount: 0, oldRegime: { taxableIncome: 0, totalDeductions: 0, totalTax: 0 }, newRegime: { taxableIncome: 0, totalTax: 0 } };
  const explanation = explainResult(res, 0, '2025-26', []);
  assert.ok(explanation.explanation.includes('₹0'));
});

test('12. formatIndianCurrency works for millions (e.g. 1,00,00,000)', () => {
  const res = { recommendedRegime: 'Old', savingsAmount: 10000000, oldRegime: { taxableIncome: 10000000, totalDeductions: 0, totalTax: 0 }, newRegime: { taxableIncome: 10000000, totalTax: 0 } };
  const explanation = explainResult(res, 10000000, '2025-26', []);
  assert.ok(explanation.explanation.includes('₹1,00,00,000'));
});

test('13. fromForm16 filters out 0 values before returning items', () => {
  const f = { grossSalary: 1000000, section80D: 0 };
  const r = { section80D: 0 };
  const items = fromForm16(f, r);
  assert.equal(items.length, 0);
});

test('14. suggestion generation handles unverified 80CCD correctly with currency', () => {
  const res = {
    recommendedRegime: 'Old',
    savingsAmount: 0,
    oldRegime: {
      taxableIncome: 1000000,
      totalTax: 100000,
      unverified: [{ section: '80CCD', amount: 132600, needsConfirmation: true, exclusionReason: EXCLUSION_REASON.UNCONFIRMED_SUBTYPE, exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION }]
    },
    newRegime: { taxableIncome: 1000000, totalTax: 100000 }
  };
  const exp = explainResult(res, 1000000, '2025-26', []);
  const text = exp.suggestionTexts.find(s => s.section === '80CCD').text;
  assert.ok(text.includes('₹1,32,600'));
});

test('15. suggestion generation handles duplicate 80D correctly with currency', () => {
  const res = {
    recommendedRegime: 'Old',
    savingsAmount: 0,
    oldRegime: {
      taxableIncome: 1000000,
      totalTax: 100000,
      unverified: [{ section: '80D', amount: 132600, duplicateRisk: true, exclusionReason: EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT, exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION }]
    },
    newRegime: { taxableIncome: 1000000, totalTax: 100000 }
  };
  const exp = explainResult(res, 1000000, '2025-26', []);
  const text = exp.suggestionTexts.find(s => s.section === '80D').text;
  assert.ok(text.includes('₹1,32,600'));
});

test('16. suggestion generation handles regime applicability correctly with currency', () => {
  const res = {
    recommendedRegime: 'Old',
    savingsAmount: 0,
    oldRegime: {
      taxableIncome: 1000000,
      totalTax: 100000,
      unverified: [{ section: '80C', amount: 150000, allowedInRegime: false, exclusionReason: EXCLUSION_REASON.NOT_ALLOWED_IN_REGIME }]
    },
    newRegime: { taxableIncome: 1000000, totalTax: 100000 }
  };
  const exp = explainResult(res, 1000000, '2025-26', []);
  const text = exp.suggestionTexts.find(s => s.section === '80C').text;
  assert.ok(text.includes('₹1,50,000'));
});

test('17. Suggestion map dedupes properly', () => {
  const res = {
    recommendedRegime: 'Old',
    savingsAmount: 0,
    oldRegime: {
      taxableIncome: 1000000,
      totalTax: 100000,
      unverified: [
        { section: '80D', amount: 132600, duplicateRisk: true, exclusionReason: EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT },
        { section: '80D', amount: 132600, duplicateRisk: true, exclusionReason: EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT }
      ]
    },
    newRegime: { taxableIncome: 1000000, totalTax: 100000 }
  };
  const exp = explainResult(res, 1000000, '2025-26', []);
  const texts = exp.suggestionTexts.filter(s => s.section === '80D');
  assert.equal(texts.length, 1);
});

test('18. 24b under new regime has NOT_APPLICABLE_TO_PROPERTY_TYPE', () => {
  const f = { grossSalary: 1000000, section24: 200000 };
  const r = {};
  const items = fromForm16(f, r);
  
  const engineResult = require('./taxEngine.service').computeTax(
    { salary: f, deductions: items },
    DUMMY_CONFIG
  );
  
  const unv = engineResult.newRegime.unverified.find(i => i.section === '24b');
  assert.ok(unv);
  assert.equal(unv.exclusionReason, EXCLUSION_REASON.NOT_APPLICABLE_TO_PROPERTY_TYPE);
});

test('19. trace output contains appropriate computation entries', () => {
  const engineResult = require('./taxEngine.service').computeTax(
    { salary: { grossSalary: 1000000 }, deductions: [] },
    DUMMY_CONFIG
  );
  const trace = engineResult.calculationTrace;
  assert.ok(trace.find(t => t.source === 'COMPUTED' && t.step === 'Old · Total deductions'));
});

test('20. Regression check: all items count properly', () => {
  assert.equal(passed, 19);
});

console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
