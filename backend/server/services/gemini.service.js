const taxEngine = require('./taxEngine.service');
const { fromForm16, validateTaxpayerContext, computeTax, explainResult, toRegimeTrace, generateSuggestions, buildFinalSuggestions } =
  taxEngine;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

const FORM16_FIELDS = [
  'employeeName', 'employeePAN', 'employeeDesignation', 'employeeCode', 'employeeAddress',
  'employerName', 'employerTAN', 'employerPAN', 'employerAddress',
  'basicSalary', 'hra', 'rentPaid', 'specialAllowance', 'lta', 'otherAllowances', 'grossSalary',
  'standardDeduction', 'professionalTax', 'section80C', 'section80D', 'section80E',
  'section80G', 'section24', 'section80CCD', 'totalDeductions', 'taxableIncome', 'taxOnIncome',
  'rebate87A', 'educationCess', 'totalTaxPayable', 'tdsDeducted', 'taxRegimeUsed',
  'financialYear',
];

// Fields returned by Gemini as free-text strings (kept as-is). Everything
// else in FORM16_FIELDS is numeric and must be coerced to a Number.
const STRING_FIELDS = [
  'employeeName', 'employeePAN', 'employeeDesignation', 'employeeCode', 'employeeAddress',
  'employerName', 'employerTAN', 'employerPAN', 'employerAddress',
  'taxRegimeUsed', 'financialYear',
];
const NUMERIC_FIELDS = FORM16_FIELDS.filter((f) => !STRING_FIELDS.includes(f));

// Gemini sometimes returns amounts as formatted strings ("31,20,000" /
// "₹68,75,000"). Strip commas/currency symbols/whitespace so Mongoose's
// Number cast succeeds; return undefined for empty/invalid values.
function coerceNumber(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '-') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Normalize a parsed Form 16 object: coerce numeric fields and drop an
// invalid taxRegimeUsed so the model validation never rejects the doc.
function normalizeForm16(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const f of NUMERIC_FIELDS) {
    obj[f] = coerceNumber(obj[f]);
  }
  if (obj.taxRegimeUsed !== undefined && !['Old', 'New'].includes(obj.taxRegimeUsed)) {
    obj.taxRegimeUsed = null;
  }
  return obj;
}

function hasKey() {
  const k = process.env.GEMINI_API_KEY;
  return k && k !== 'your-gemini-api-key';
}

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

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
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Mock data generation is strictly forbidden outside of test environments.');
  }
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
    // standardDeduction intentionally omitted — the engine applies the
    // regime-specific statutory value (₹50,000 Old / ₹75,000 New) from TAX_CONFIG.
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

// mockRecommendation removed — both regimes are now computed deterministically
// via tax.service computeRegimeTaxes (full FY 2025-26 waterfall).

/**
 * Extract Form 16 fields from a base64 PDF via Gemini (mock fallback in dev).
 * Hardened (Part 8): extract ONLY what is explicitly stated, never infer or
 * split a stated amount into subsections.
 */
async function extractForm16(pdfBase64) {
  const prompt = `You are a document data extraction engine. Extract fields from the attached Form 16 PDF and return ONLY a valid JSON object with no preamble, no explanation, no markdown, and no code fences. Use exactly these field names: ${FORM16_FIELDS.join(', ')}.

STRICT RULES:
- If a field is not present in the document, its value MUST be null. Never invent a value, never default to 0, and never hallucinate.
- Do NOT inject default values for Section 80CCD or LTA under any circumstances unless they are explicitly written in the document.
- Zero is only permitted if the document explicitly states the value is 0. Do not assume missing sections are zero; they are null.
- Never infer, estimate, or calculate a value that is not explicitly stated in the document.
- Never split one stated amount into multiple subsections. If a section number is present but its subsection is ambiguous (e.g. "80CCD" without specifying 80CCD(1), 80CCD(1B), or 80CCD(2)), keep the single amount under the ambiguous key and do NOT create separate subsection entries.
- If a section number has a clear subsection, use the most specific key available in the field list; otherwise keep the amount under the parent key.
- Extracted values are raw numbers as they appear in the document before any currency formatting — return them as plain numbers or numeric strings (e.g. 3120000), never with "₹" or commas.`;
  try {
    const r = await callGemini(prompt, { mimeType: 'application/pdf', data: pdfBase64 });
    if (r.mock) {
      const mocked = mockForm16();
      if (process.env.DEBUG_OCR === 'true') {
        console.log('[DEBUG_OCR] GEMINI RAW RESPONSE (MOCK): mock data bypass');
        console.log('[DEBUG_OCR] PARSED GEMINI JSON (MOCK):', JSON.stringify(mocked, null, 2));
      }
      return normalizeForm16(mocked);
    }
    
    if (process.env.DEBUG_OCR === 'true') {
      console.log('[DEBUG_OCR] GEMINI RAW RESPONSE:', String(r.text));
    }
    
    const parsed = JSON.parse(stripFences(r.text));
    
    if (process.env.DEBUG_OCR === 'true') {
      console.log('[DEBUG_OCR] PARSED GEMINI JSON:', JSON.stringify(parsed, null, 2));
    }
    
    return normalizeForm16(parsed);
  } catch (e) {
    if (process.env.NODE_ENV === 'test') {
      console.warn('[gemini] form16 extraction failed, using mock:', e.message);
      return mockForm16();
    }
    throw new Error(`Gemini API failed: ${e.message}`);
  }
}

/**
 * Generate a tax recommendation. The FINAL tax for both regimes is computed
 * DETERMINISTICALLY by the canonical engine in taxEngine.service from a single
 * TaxpayerContext built from the Form 16 + aggregated records. Gemini is never
 * used for a tax recommendation or its explanation.
 */
async function generateRecommendation(form16, financials, agg, eduTuition = 0, overrideDeductions = null) {
  const fy = form16.financialYear || '2025-26';

  // --- Build the ONE canonical context (Part 1). eduTuition (children's tuition
  // fees) folds into the 80C records figure here, not in a separate layer.
  const ctx = fromForm16(form16, { recordsAgg: agg, eduTuition });

  // --- Finalization override (Final 3% Part 1): when the Review page has been
  // finalized, replace ctx.deductions with the stored approved array so
  // computeTax uses EXACTLY what the user saw and approved — never re-merged.
  if (overrideDeductions && Array.isArray(overrideDeductions) && overrideDeductions.length > 0) {
    ctx.deductions = overrideDeductions;
    ctx.isFinalized = true;
  }

  // --- Validation (Part 5) — drives the gross-salary-mismatch flag etc.
  const validation = validateTaxpayerContext(ctx);
  const grossSalaryMismatch = validation.errors.some((e) => /Gross salary mismatch/.test(e));
  const mismatchDetail =
    grossSalaryMismatch ? validation.errors.find((e) => /Gross salary mismatch/.test(e)) : null;

  // --- Deterministic computation (Part 4). Same gross + same deductions for both
  // regimes; New regime applies NONE of the Chapter VI-A deductions.
  const result = computeTax(ctx);

  // If validation is blocking (no gross salary / no FY), surface the errors.
  if (result.error) {
    return {
      error: true,
      errors: result.errors,
      warnings: result.warnings,
      recommendedRegime: null,
      savingsAmount: 0,
      grossSalaryMismatch,
      mismatchDetail,
      deductionLineItems: ctx.deductions,
      calculationTrace: result.calculationTrace,
      regimes: null,
    };
  }

  const gross = ctx.salary.grossSalary || 0;
  const oldTrace = toRegimeTrace(ctx, result.oldRegime);
  const newTrace = toRegimeTrace(ctx, result.newRegime);
  const recommendedRegime = result.recommendedRegime;
  const savingsAmount = result.savingsAmount;

  // Compact, machine-readable trace (Part 9 Calculation Trace) — every step
  // with its input, formula and output for full auditability.
  const calculationTrace = result.calculationTrace;
  const deductionLineItems = ctx.deductions.map((d) => ({ ...d }));

  const fallback = explainResult(result, ctx);
  // Canonical suggestions are deterministic and derived only from TaxResult.
  const canonicalSuggestions = generateSuggestions(result)
    .map((s) => ({ suggestion: s.text || s.suggestion || String(s), potentialSaving: 0 }));

  return {
    ...fallback,
    taxSavingSuggestions: canonicalSuggestions,
    recommendedRegime,
    savingsAmount,
    grossSalaryUsed: gross,
    grossSalaryMismatch,
    mismatchDetail,
    deductionLineItems,
    calculationTrace,
    regimes: { old: oldTrace, new: newTrace },
  };
}

module.exports = { extractForm16, generateRecommendation, stripFences, normalizeForm16 };
