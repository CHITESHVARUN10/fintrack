const fs = require('fs');
const file = 'backend/server/models/form16.model.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
/form16Schema\.pre\('validate', function \(next\) \{[\s\S]*?next\(\);\n\}\);/,
`form16Schema.pre('save', function (next) {
  if (this.finalizedDeductions && Array.isArray(this.finalizedDeductions)) {
    for (const item of this.finalizedDeductions) {
      if (item.amount == null || typeof item.amount !== 'number' || item.amount <= 0 || !Number.isFinite(item.amount)) {
        return next(new Error(\`Validation Error: Deduction for section \${item.section} has an invalid or zero amount (\${item.amount}).\`));
      }
    }
  }
  next();
});`
);
fs.writeFileSync(file, content);
