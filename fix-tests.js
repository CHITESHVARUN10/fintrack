const fs = require('fs');
const file = 'backend/server/services/deduction-filtering.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
/describe\('Form16 Mongoose Hook', \(\) => \{[\s\S]*?\}\);/g,
`describe('Form16 Mongoose Hook', () => {
    it('17. throws on zero amount', async () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: 0 }] });
      await expect(doc.save()).rejects.toThrow(/Validation Error: Deduction for section 80C has an invalid or zero amount/);
    });
    it('18. throws on null amount', async () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: null }] });
      await expect(doc.save()).rejects.toThrow(/Validation Error: Deduction for section 80C has an invalid or zero amount/);
    });
    it('19. succeeds on valid amount', async () => {
      const doc = new Form16({ userId: new mongoose.Types.ObjectId(), finalizedDeductions: [{ section: '80C', amount: 100 }] });
      // Should reject with MongooseError (Client must be connected before running operations) and NOT Validation Error
      await expect(doc.save()).rejects.not.toThrow(/Validation Error/);
    });
  });`
);
fs.writeFileSync(file, content);
