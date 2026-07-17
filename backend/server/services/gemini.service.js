const { calculateTax } = require('./tax.service');

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const FORM16_FIELDS = [
  'employeeName', 'employeePAN', 'employeeDesignation', 'employeeCode', 'employeeAddress',
  'employerName', 'employerTAN', 'employerPAN', 'employerAddress',
  'basicSalary', 'hra', 'specialAllowance', 'lta', 'otherAllowances', 'grossSalary',
  'standardDeduction', 'professionalTax', 'section80C', 'section80D', 'section80E',
  'section80G', 'section80CCD', 'totalDeductions', 'taxableIncome', 'taxOnIncome',
  'rebate87A', 'educationCess', 'totalTaxPayable', 'tdsDeducted', 'taxRegimeUsed',
  'financialYear',
];

function hasKey() {
  const k = process.env.GEMINI_API_KEY;
  return k && k !== 'your-gemini-api-key';
}

// Strip ```json ... ``` or ``` ... ``` fences from a model response.
function stripFences(text) {
  let t = String(text).trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1];
  return t.trim();
}

async function callGemini(prompt, inlineData) {
  if (!hasKey()) return { mock: true };
  const parts = [{ text: prompt }];
  if (inlineData) {
    parts.push({ inline_data: { mime_type: inlineData.mimeType, data: inlineData.data } });
  }
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return { text };
}

// --- Dev fallbacks (used only when GEMINI_API_KEY is not configured) ---
function mockForm16() {
  return {
    employeeName: 'Extracted User',
    employeePAN: 'ABCDE1234F',
    financialYear: '2025-26',
    employerName: 'Acme Corp',
    basicSalary: 800000,
    hra: 200000,
    specialAllowance: 100000,
    lta: 20000,
    otherAllowances: 0,
    grossSalary: 1120000,
    standardDeduction: 50000,
    professionalTax: 2500,
    section80C: 150000,
    section80D: 25000,
    section80E: 0,
    section80G: 0,
    section80CCD: 50000,
    totalDeductions: 577500,
    taxableIncome: 542500,
    taxOnIncome: 0,
    rebate87A: 0,
    educationCess: 0,
    totalTaxPayable: 0,
    tdsDeducted: 80000,
    taxRegimeUsed: 'New',
  };
}

function mockRecommendation(form16) {
  const gross = form16.grossSalary || form16.taxableIncome || 0;
  const ded = form16.totalDeductions || 0;
  const oldR = calculateTax(gross, ded, 'Old');
  const newR = calculateTax(gross, ded, 'New');
  const recommended = oldR.totalTax <= newR.totalTax ? 'Old' : 'New';
  const savings = Math.abs(oldR.totalTax - newR.totalTax);
  return {
    oldRegimeTax: oldR.totalTax,
    newRegimeTax: newR.totalTax,
    recommendedRegime: recommended,
    savingsAmount: savings,
    explanation: `Based on your Form 16 (gross ${gross}, deductions ${ded}), the ${recommended} regime yields the lower tax liability.`,
    taxSavingSuggestions: [
      { suggestion: 'Max out Section 80C (ELSS/PPF) to reduce taxable income.', potentialSaving: 45000 },
      { suggestion: 'Claim health insurance premium under Section 80D.', potentialSaving: 25000 },
    ],
  };
}

/** Extract Form 16 fields from a base64 PDF via Gemini (mock fallback in dev). */
async function extractForm16(pdfBase64) {
  const prompt = `You are a document extraction specialist. Extract all Form 16 fields from the attached PDF and return ONLY a valid JSON object with no preamble, no explanation, and no markdown code fences. Use exactly these field names: ${FORM16_FIELDS.join(', ')}.`;
  try {
    const r = await callGemini(prompt, { mimeType: 'application/pdf', data: pdfBase64 });
    if (r.mock) return mockForm16();
    return JSON.parse(stripFences(r.text));
  } catch (e) {
    console.warn('[gemini] form16 extraction failed, using mock:', e.message);
    return mockForm16();
  }
}

/** Generate a tax recommendation from Form 16 + financial records (mock fallback in dev). */
async function generateRecommendation(form16, financials) {
  const prompt = `You are an Indian tax advisor for financial year ${form16.financialYear || '2025-26'}. Given the following Form 16 data and financial records, return ONLY a valid JSON object with no preamble and no markdown code fences containing these fields: oldRegimeTax (Number), newRegimeTax (Number), recommendedRegime ('Old' or 'New'), savingsAmount (Number), explanation (String), taxSavingSuggestions (Array of { suggestion: String, potentialSaving: Number }). Form16: ${JSON.stringify(form16)}. Financial records: ${JSON.stringify(financials)}.`;
  try {
    const r = await callGemini(prompt);
    if (r.mock) return mockRecommendation(form16);
    return JSON.parse(stripFences(r.text));
  } catch (e) {
    console.warn('[gemini] recommendation failed, using mock:', e.message);
    return mockRecommendation(form16);
  }
}

module.exports = { extractForm16, generateRecommendation, stripFences };
