const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { filterValidDeductions, explainResult, generateSuggestions, assertNoZeroDeductions, computeTax, fromForm16 } = require('./taxEngine.service');
const base = { section: '80C', amount: 1000, source: 'FORM16_OCR', needsConfirmation: false };
describe('Deduction validation and narrative', () => {
  for (const amount of [null, undefined, NaN, 0, -100, Infinity]) {
    it(`filters invalid amount ${amount}`, () => assert.equal(filterValidDeductions([{ ...base, amount }]).length, 0));
  }
  for (const source of ['FORM16_OCR', 'INVESTMENT_RECORD', 'USER_MANUAL', 'SYSTEM_DEFAULT']) {
    it(`retains valid ${source}`, () => assert.equal(filterValidDeductions([{ ...base, source }]).length, 1));
  }
  it('rejects missing sections and invalid sources', () => {
    assert.deepEqual(filterValidDeductions([{ ...base, section: '' }, { ...base, source: 'INVALID_SOURCE' }]), []);
  });
  it('mentions each verified section once', () => {
    const ctx = fromForm16({ grossSalary: 1000000 });
    ctx.deductions = [{ ...base, section: '80D' }, { ...base, section: '80D', amount: 2000, source: 'INVESTMENT_RECORD' }];
    const text = explainResult(computeTax(ctx), ctx).explanation;
    assert.equal((text.match(/80D/g) || []).length, 1);
  });
  it('deduplicates unconfirmed section suggestions', () => {
    const suggestions = generateSuggestions({ oldRegime: { applied: [], unverified: [
      { ...base, section: '80D', needsConfirmation: true },
      { ...base, section: '80D', amount: 2000, needsConfirmation: true },
    ] } });
    assert.equal(suggestions.filter(s => s.section === '80D').length, 1);
  });
  it('does not apply explicit zero deductions', () => {
    const result = computeTax(fromForm16({ grossSalary: 1000000, section80C: 0 }));
    assert.ok(result.oldRegime.applied.every(d => d.amount > 0));
  });
  it('development assertion rejects zero without leaking environment changes', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      assert.throws(() => assertNoZeroDeductions({ oldRegime: { applied: [{ ...base, amount: 0 }] } }), /zero\/invalid/);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
    }
  });
});
