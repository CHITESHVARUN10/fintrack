const fs = require('fs');
const file = 'backend/server/services/taxEngine.service.js';
let content = fs.readFileSync(file, 'utf8');

const code = `
// -----------------------------------------------------------------------------
// assertNoZeroDeductions (Part 5):
// -----------------------------------------------------------------------------
function assertNoZeroDeductions(taxResult) {
  if (process.env.NODE_ENV !== 'development') return;
  const toCheck = [];
  if (taxResult.oldRegime) {
    toCheck.push(...(taxResult.oldRegime.applied || []));
    toCheck.push(...(taxResult.oldRegime.unverified || []));
  }
  if (taxResult.newRegime) {
    toCheck.push(...(taxResult.newRegime.applied || []));
    toCheck.push(...(taxResult.newRegime.unverified || []));
  }
  
  for (const item of toCheck) {
    if (item.amount == null || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
      throw new Error(\`assertNoZeroDeductions: Found zero/invalid value for section \${item.section}: amount is \${item.amount}\`);
    }
  }
}
`;

content = content.replace('module.exports = {', code + '\nmodule.exports = {');
fs.writeFileSync(file, content);
