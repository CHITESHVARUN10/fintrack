const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { fromForm16, computeTax, generateSuggestions, EXCLUSION_REASON } = require('./taxEngine.service');
describe('Exclusion formatting and provenance', () => {
  for (const [formAmount, recordAmount] of [[20000, 15000], [15000, 20000], [25000, 25000]]) {
    it(`retains duplicate evidence for ${formAmount}/${recordAmount}`, () => {
      const ctx = fromForm16({ grossSalary: 1000000, section80D: formAmount }, { recordsAgg: { section80D: recordAmount } });
      const dup = ctx.deductions.find(d => d.section === '80D' && d.duplicateRisk);
      assert.ok(dup);
      assert.equal(dup.exclusionReason, EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT);
      assert.equal(dup.amount, Math.min(formAmount, recordAmount));
      const result = computeTax(ctx);
      assert.equal(result.oldRegime.applied.filter(d => d.section === '80D').length, 1);
    });
  }
  it('retains ambiguous 80CCD with an explanation instead of applying it', () => {
    const result = computeTax(fromForm16({ grossSalary: 1000000, section80CCD: 50000 }));
    assert.ok(!result.oldRegime.applied.some(d => d.section === '80CCD'));
    const excluded = result.oldRegime.unverified.find(d => d.section === '80CCD');
    assert.ok(excluded);
    assert.equal(excluded.exclusionReason, EXCLUSION_REASON.UNCONFIRMED_SUBTYPE);
    assert.ok(generateSuggestions(result).some(s => s.section === '80CCD'));
  });
});
