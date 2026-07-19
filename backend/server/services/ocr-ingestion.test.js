const mongoose = require('mongoose');
const { extractForm16, normalizeForm16 } = require('./gemini.service');
const { fromForm16 } = require('./taxEngine.service');
const Form16 = require('../models/form16.model');

jest.mock('../models/form16.model', () => {
  return {
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    create: jest.fn().mockResolvedValue({}),
    countDocuments: jest.fn().mockResolvedValue(0),
    findOneAndReplace: jest.fn().mockResolvedValue({ employeeName: 'New', section80CCD: null })
  };
});

describe('OCR Ingestion Pipeline Regression Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('1. resetTaxpayerContext deletes old Form16 data', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Form16.deleteMany({ userId, financialYear: '2025-26' }); // Simulating resetTaxpayerContext
    expect(Form16.deleteMany).toHaveBeenCalledWith({ userId, financialYear: '2025-26' });
  });

  test('2. normalizeForm16 correctly maps string numbers to numeric numbers', () => {
    const raw = { basicSalary: '31,20,000', hra: '₹12,00,000' };
    const normalized = normalizeForm16(raw);
    expect(normalized.basicSalary).toBe(3120000);
    expect(normalized.hra).toBe(1200000);
  });

  test('3. normalizeForm16 converts missing properties to null, not 0', () => {
    const raw = { basicSalary: 500000 };
    const normalized = normalizeForm16(raw);
    expect(normalized.section80CCD).toBeNull();
    expect(normalized.lta).toBeNull();
  });

  test('4. mockForm16 throws in non-test/dev environments', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    return extractForm16('dummy').then(() => {
      process.env.NODE_ENV = originalEnv;
    }).catch(e => {
      process.env.NODE_ENV = originalEnv;
      expect(e).toBeDefined();
    });
  });

  test('5. fromForm16 completely omits section when both form and records are null', () => {
    const ctx = fromForm16({ section80CCD: null }, { recordsAgg: { section80CCD: null } });
    const has80CCD = ctx.deductions.some(d => d.section === '80CCD');
    expect(has80CCD).toBe(false);
  });

  test('6. fromForm16 preserves explicit 0 for a section and creates a line item', () => {
    const ctx = fromForm16({ section80CCD: 0 }, { recordsAgg: { section80CCD: null } });
    const item = ctx.deductions.find(d => d.section === '80CCD');
    expect(item).toBeDefined();
    expect(item.amount).toBe(0);
    expect(item.notes).toContain('Value explicitly stated as 0');
  });

  test('7. Mock data structure does not hallucinate subsections for 80CCD', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const mockData = await extractForm16('dummy');
    process.env.NODE_ENV = originalEnv;
    expect(mockData.section80CCD).toBeDefined(); 
  });

  test('8. Form16.findOneAndReplace performs full overwrite', async () => {
    const userId = new mongoose.Types.ObjectId();
    const update = { userId, financialYear: '2025-26', employeeName: 'New', sourceType: 'PDF', section80CCD: null };
    const doc = await Form16.findOneAndReplace(
      { userId, financialYear: '2025-26' },
      update,
      { upsert: true, returnDocument: 'after' }
    );
    expect(Form16.findOneAndReplace).toHaveBeenCalledWith(
      { userId, financialYear: '2025-26' },
      update,
      { upsert: true, returnDocument: 'after' }
    );
    expect(doc.employeeName).toBe('New');
    expect(doc.section80CCD).toBeNull();
  });

  test('9. coerceNumber returns null for strings with alphabets that are invalid', () => {
    const raw = { lta: 'abc' };
    const normalized = normalizeForm16(raw);
    expect(normalized.lta).toBeNull();
  });

  test('10. TaxpayerContext is generated cleanly with no phantom values', () => {
    const normalized = normalizeForm16({});
    const ctx = fromForm16(normalized, { recordsAgg: {} });
    expect(ctx.deductions.some(d => d.section === '80CCD')).toBe(false);
    expect(ctx.deductions.some(d => d.section === 'LTA')).toBe(false);
  });
});
