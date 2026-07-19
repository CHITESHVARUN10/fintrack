require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractForm16, normalizeForm16 } = require('./server/services/gemini.service');
const { fromForm16 } = require('./server/services/taxEngine.service');

async function test() {
  try {
    const p = path.join(__dirname, '../../pdfs/Sample_Form16_30L_FY2025_26.pdf');
    const b64 = fs.readFileSync(p).toString('base64');
    console.log('Extracting...');
    const data = await extractForm16(b64);
    // STAGE 3/4/5 simulation
    const ctx = fromForm16(data, { recordsAgg: { section80C: 0, section80D: 0 } });
    console.log('PIPELINE STAGE 5 — AFTER DEDUP:', JSON.stringify(ctx.deductions, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
