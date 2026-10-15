const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractForm16, normalizeForm16 } = require('./gemini.service');
const { fromForm16 } = require('./taxEngine.service');
describe('OCR ingestion', () => {
  it('normalizes currency strings and preserves missing values', () => {
    const result = normalizeForm16({ basicSalary: '31,20,000', hra: '₹12,00,000', lta: 'abc' });
    assert.equal(result.basicSalary, 3120000);
    assert.equal(result.hra, 1200000);
    assert.equal(result.lta, null);
    assert.equal(result.section80CCD, null);
  });
  it('distinguishes explicit zero from a missing deduction', () => {
    assert.ok(!fromForm16({ section80CCD: null }).deductions.some(d => d.section === '80CCD'));
    assert.equal(normalizeForm16({ section80CCD: 0 }).section80CCD, 0);
    assert.ok(!fromForm16({ section80CCD: 0 }).deductions.some(d => d.section === '80CCD'));
  });
  it('empty extraction creates no phantom NPS or LTA', () => {
    const ctx = fromForm16(normalizeForm16({}));
    assert.ok(!ctx.deductions.some(d => ['80CCD', 'LTA'].includes(d.section)));
  });
  it('fails extraction without credentials in production, without making a network request', async () => {
    const env = { NODE_ENV: process.env.NODE_ENV, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.GEMINI_API_KEY;
      await assert.rejects(extractForm16('dummy'), /Gemini|mock|API|configured/i);
    } finally {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
});
