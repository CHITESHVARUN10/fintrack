const fs = require('fs');
const file = 'backend/server/services/deduction-filtering.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
/describe\('Form16 Mongoose Hook', \(\) => \{[\s\S]*?\}\);/g,
`describe('Form16 Mongoose Hook', () => {
    let hookFn;
    beforeAll(() => {
      hookFn = Form16.schema.s.hooks._pres.get('save').find(h => h.fn.toString().includes('finalizedDeductions')).fn;
    });

    it('17. throws on zero amount', async () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: 0 }] });
      expect(() => hookFn.call(doc)).toThrow(/Validation Error: Deduction for section 80C has an invalid or zero amount/);
    });
    it('18. throws on null amount', async () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: null }] });
      expect(() => hookFn.call(doc)).toThrow(/Validation Error: Deduction for section 80C has an invalid or zero amount/);
    });
    it('19. succeeds on valid amount', async () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: 100 }] });
      expect(() => hookFn.call(doc)).not.toThrow();
    });
  });`
);
fs.writeFileSync(file, content);
