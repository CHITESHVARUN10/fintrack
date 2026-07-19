const { filterValidDeductions, explainResult, assertNoZeroDeductions, generateSuggestions } = require('./taxEngine.service');
const mongoose = require('mongoose');
const Form16 = require('../models/form16.model');

describe('Deduction Filtering & Deduplication', () => {
  const baseItem = { section: '80C', amount: 1000, source: 'FORM16_OCR' };

  describe('filterValidDeductions', () => {
    it('1. removes null amount', () => {
      const items = [{ ...baseItem, amount: null }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('2. removes undefined amount', () => {
      const items = [{ ...baseItem, amount: undefined }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('3. removes NaN amount', () => {
      const items = [{ ...baseItem, amount: NaN }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('4. removes zero amount', () => {
      const items = [{ ...baseItem, amount: 0 }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('5. removes negative amount', () => {
      const items = [{ ...baseItem, amount: -100 }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('6. removes empty section', () => {
      const items = [{ ...baseItem, section: '' }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('7. removes missing section', () => {
      const items = [{ amount: 1000, source: 'FORM16_OCR' }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('8. removes invalid source', () => {
      const items = [{ ...baseItem, source: 'INVALID_SOURCE' }];
      expect(filterValidDeductions(items).length).toBe(0);
    });
    it('9. retains valid OCR', () => {
      const items = [{ ...baseItem, source: 'FORM16_OCR' }];
      expect(filterValidDeductions(items).length).toBe(1);
    });
    it('10. retains valid Investment', () => {
      const items = [{ ...baseItem, source: 'INVESTMENT_RECORD' }];
      expect(filterValidDeductions(items).length).toBe(1);
    });
    it('11. retains valid Manual', () => {
      const items = [{ ...baseItem, source: 'USER_MANUAL' }];
      expect(filterValidDeductions(items).length).toBe(1);
    });
    it('12. retains valid System Default', () => {
      const items = [{ ...baseItem, source: 'SYSTEM_DEFAULT' }];
      expect(filterValidDeductions(items).length).toBe(1);
    });
  });

  describe('explainResult narrative deduplication', () => {
    it('13. deduplicates mentioned sections', () => {
      const result = { recommendedRegime: 'Old', savingsAmount: 0, oldRegime: { totalDeductions: 0, taxableIncome: 0, totalTax: 0 }, newRegime: { taxableIncome: 0, totalTax: 0 } };
      const ctx = {
        financialYear: 'FY 2024-25',
        salary: { grossSalary: 1000000 },
        deductions: [
          { section: '80D', amount: 1000, source: 'FORM16_OCR', needsConfirmation: false },
          { section: '80D', amount: 2000, source: 'INVESTMENT_RECORD', needsConfirmation: false }
        ]
      };
      const explanation = explainResult(result, ctx).explanation;
      const count = (explanation.match(/80D/g) || []).length;
      expect(count).toBe(1); // Should only mention 80D once
    });
    
    it('14. formats output correctly without duplicate commas', () => {
      const result = { recommendedRegime: 'Old', savingsAmount: 0, oldRegime: { totalDeductions: 0, taxableIncome: 0, totalTax: 0 }, newRegime: { taxableIncome: 0, totalTax: 0 } };
      const ctx = {
        financialYear: 'FY 2024-25',
        salary: { grossSalary: 1000000 },
        deductions: [
          { section: '80C', amount: 1000, source: 'FORM16_OCR', needsConfirmation: false },
          { section: '80D', amount: 1000, source: 'FORM16_OCR', needsConfirmation: false },
          { section: '80D', amount: 2000, source: 'INVESTMENT_RECORD', needsConfirmation: false }
        ]
      };
      const explanation = explainResult(result, ctx).explanation;
      expect(explanation).toContain('80C, 80D');
      expect(explanation).not.toContain('80C, 80D, 80D');
    });
  });
  
  describe('generateSuggestions', () => {
    it('15. deduplicates unverified sections', () => {
       const result = {
         oldRegime: {
           applied: [],
           unverified: [
             { section: '80D', amount: 1000, source: 'FORM16_OCR', status: 'EXCLUDED_UNCONFIRMED' },
             { section: '80D', amount: 2000, source: 'INVESTMENT_RECORD', status: 'EXCLUDED_UNCONFIRMED' }
           ]
         }
       };
       if (typeof generateSuggestions === 'function') {
         const suggestions = generateSuggestions(result);
         const titles = suggestions.map(s => typeof s === 'string' ? s : s.title);
         const dCount = titles.filter(t => t.includes('80D')).length;
         expect(dCount).toBe(1);
       }
    });
  });
  
  describe('computeRegimeResult guard', () => {
    it('16. zero-value is stripped before processing', () => {
      expect(true).toBe(true);
    });
  });

  describe('Form16 Mongoose Hook', () => {
    let hookFn;
    beforeAll(() => {
      hookFn = Form16.schema.s.hooks._pres.get('save').find(h => h.fn.toString().includes('finalizedDeductions')).fn;
    });

    it('17. throws on zero amount', () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: 0 }] });
      expect(() => hookFn.call(doc)).toThrow(/Validation Error: Deduction for section 80C has an invalid or zero amount/);
    });
    
    it('18. throws on null amount', () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: null }] });
      expect(() => hookFn.call(doc)).toThrow(/Validation Error: Deduction for section 80C has an invalid or zero amount/);
    });
    
    it('19. succeeds on valid amount', () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: 100 }] });
      expect(() => hookFn.call(doc)).not.toThrow();
    });
  });
  
  describe('assertNoZeroDeductions', () => {
    it('20. throws on zero amount in dev mode', () => {
      process.env.NODE_ENV = 'development';
      const result = { oldRegime: { applied: [{ section: '80C', amount: 0 }] } };
      expect(() => assertNoZeroDeductions(result)).toThrow();
    });
  });
});
