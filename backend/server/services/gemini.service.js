const taxEngine = require('./taxEngine.service');
const { fromForm16, validateTaxpayerContext, computeTax, explainResult, toRegimeTrace, generateSuggestions, buildFinalSuggestions } =
  taxEngine;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const FORM16_FIELDS = [
  'employeeName', 'employeePAN', 'employeeDesignation', 'employeeCode', 'employeeAddress',
  'employerName', 'employerTAN', 'employerPAN', 'employerAddress',
  'basicSalary', 'hra', 'rentPaid', 'specialAllowance', 'lta', 'otherAllowances', 'grossSalary',
  'standardDeduction', 'professionalTax', 'section80C', 'section80D', 'section80E',
  'section80G', 'section80CCD', 'totalDeductions', 'taxableIncome', 'taxOnIncome',
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
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.-]/g, '');
    if (cleaned === '' || cleaned === '-') return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// Normalize a parsed Form 16 object: coerce numeric fields and drop an
// invalid taxRegimeUsed so the model validation never rejects the doc.
function normalizeForm16(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const f of NUMERIC_FIELDS) {
    if (obj[f] !== undefined) obj[f] = coerceNumber(obj[f]);
  }
  if (obj.taxRegimeUsed !== undefined && !['Old', 'New'].includes(obj.taxRegimeUsed)) {
    delete obj.taxRegimeUsed;
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
- If a field is not present in the document, set its value to null. Never invent a value.
- Never infer, estimate, or calculate a value that is not explicitly stated in the document.
- Never split one stated amount into multiple subsections. If a section number is present but its subsection is ambiguous (e.g. "80CCD" without specifying 80CCD(1), 80CCD(1B), or 80CCD(2)), keep the single amount under the ambiguous key and do NOT create separate subsection entries.
- If a section number has a clear subsection, use the most specific key available in the field list; otherwise keep the amount under the parent key.
- Extracted values are raw numbers as they appear in the document before any currency formatting — return them as plain numbers or numeric strings (e.g. 3120000), never with "₹" or commas.`;
  try {
    const r = await callGemini(prompt, { mimeType: 'application/pdf', data: pdfBase64 });
    if (r.mock) return mockForm16();
    return normalizeForm16(JSON.parse(stripFences(r.text)));
  } catch (e) {
    console.warn('[gemini] form16 extraction failed, using mock:', e.message);
    return mockForm16();
  }
}

/**
 * Generate a tax recommendation. The FINAL tax for both regimes is computed
 * DETERMINISTICALLY by the canonical engine in taxEngine.service (Part 4) from a
 * single TaxpayerContext built from the Form 16 + aggregated records. Gemini is
 * used ONLY to narrate the result into plain English (Part 7/8) — it never
 * computes, and may only mention deductions that appear in the computed result.
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
  const deductionLineItems = ctx.deductions.map((d) => ({
    section: d.section,
    subtype: d.subtype,
    subtypeConfirmed: d.subtypeConfirmed,
    amount: d.amount,
    source: d.source,
    confidence: d.confidence,
    needsConfirmation: d.needsConfirmation,
    notes: d.notes,
    duplicateRisk: d.duplicateRisk,
  }));

  const fallback = explainResult(result, ctx);
  // Part 4: canonical suggestions (Map-keyed, deduplicated) — generated ONCE here.
  const canonicalSuggestions = generateSuggestions(result)
    .map((s) => ({ suggestion: String(s), potentialSaving: 0 }));

  // Hardened narrative prompt (Part 7): Gemini receives the finished TaxResult
  // and must generate explanation text ONLY from that data. It must never mention
  // any investment product (ELSS, LIC, NPS, PPF, tuition) unless that name
  // appears explicitly in a DeductionLineItem notes field.
  const verifiedItems = ctx.deductions
    .filter((d) => d.needsConfirmation === false && d.source)
    .map((d) => ({ section: d.section, subtype: d.subtype, amount: d.amount, source: d.source, notes: d.notes }));
  const prompt = `You are a plain-language Indian tax advisor for FY ${fy}. A deterministic recommendation engine has ALREADY computed the final tax for both regimes from the user's actual extracted data. Your job is ONLY to write a clear, factual explanation of the results.

CRITICAL RULES — violation will cause incorrect output:
1. Use ONLY the numbers from the TaxResult JSON below. Do not round differently.
2. Mention ONLY deductions that appear in the verifiedDeductions array with their exact section codes and amounts.
3. Do NOT name any specific investment product, insurer, fund house, or loan type (e.g. ELSS, LIC, NPS, PPF, tuition, education loan) UNLESS that name appears explicitly in a DeductionLineItem notes field in the data provided.
4. If a deduction section such as 80C is present without investment details, say "Section 80C deduction of ₹X was applied. The specific investment details were not provided in the Form 16."
5. Do NOT perform any calculations yourself.
6. suggestionTexts must reference ONLY unverified deductions from the unverifiedDeductions array — do not invent suggestions.

Return ONLY a valid JSON object with no preamble and no markdown code fences:
{ "explanation": String, "oldRegimeSummary": String, "newRegimeSummary": String, "suggestionTexts": Array<String> }

TaxResult (do not change):
${JSON.stringify(result)}

Verified deductions actually applied: ${JSON.stringify(verifiedItems)}
Unverified (excluded) deductions: ${JSON.stringify(result.unverifiedDeductions)}`;

  try {
    const r = await callGemini(prompt);
    if (r.mock) {
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
    const parsed = JSON.parse(stripFences(r.text));
    // Part 4: buildFinalSuggestions merges engine suggestions with any Gemini
    // suggestionTexts BEFORE deduplication so that both sources are deduplicated
    // together — not independently.
    const geminiTexts = Array.isArray(parsed.suggestionTexts) ? parsed.suggestionTexts : [];
    const mergedSuggestions = buildFinalSuggestions(generateSuggestions(result), geminiTexts)
      .map((s) => ({ suggestion: String(s), potentialSaving: 0 }));
    return {
      explanation: parsed.explanation || fallback.explanation,
      oldRegimeSummary: parsed.oldRegimeSummary || fallback.oldRegimeSummary,
      newRegimeSummary: parsed.newRegimeSummary || fallback.newRegimeSummary,
      taxSavingSuggestions: mergedSuggestions,
      recommendedRegime,
      savingsAmount,
      grossSalaryUsed: gross,
      grossSalaryMismatch,
      mismatchDetail,
      deductionLineItems,
      calculationTrace,
      regimes: { old: oldTrace, new: newTrace },
    };
  } catch (e) {
    console.warn('[gemini] recommendation narrative failed, using computed fallback:', e.message);
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
}

module.exports = { extractForm16, generateRecommendation, stripFences, normalizeForm16 };
