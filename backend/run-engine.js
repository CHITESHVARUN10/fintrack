const { fromForm16, computeTax, explainResult } = require('./server/services/taxEngine.service');

async function run() {
  const form16Data = { financialYear: '2025-26', basicSalary: 1000000, hra: 0, specialAllowance: 0, grossSalary: 1000000, section80D: 25000, section80C: 150000 };
  const recordsAgg = {
    section80C: 150000,
    section80D: { amount: 18500, source: 'INVESTMENT_RECORD', confidence: 85, policies: [] }
  };
  const ctx = fromForm16(form16Data, { recordsAgg });
  const result = computeTax(ctx);
  if (result.error) {
    console.log("Error", result.errors);
    return;
  }
  const expl = explainResult(result, ctx);
}
run();
