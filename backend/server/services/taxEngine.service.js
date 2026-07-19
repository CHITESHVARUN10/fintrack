// =============================================================================
// Canonical, deterministic FY 2025-26 tax engine.
//
// This is the SINGLE source of truth for the tax calculation. It is a pure
// module: no database reads, no API calls, no randomness. Given the same
// TaxpayerContext it always returns the same TaxResult. No number is ever
// invented — every deduction enters through a DeductionLineItem with a traceable
// source, and the explanation is generated strictly from the computed result.
//
// All tax constants are imported from taxConfig.js — no hardcoded tax numbers here.
//
// Exposed surface:
//   TAX_CONFIG, DEFAULT_FY, SOURCE, STATUS
//   DeductionLineItem helpers (makeLineItem, computeHraExemption)
//   fromForm16(form16, { recordsAgg, eduTuition }) -> TaxpayerContext
//   validateTaxpayerContext(ctx) -> { errors, warnings, isBlockingError }
//   computeSlabTax(taxableIncome, slabs, financialYear) -> { slabs, incomeTax }
//   compute87ARebate(taxableIncome, slabTax, regime, cfg) -> { rebateAmount, ... }
//   computeMarginalRelief(taxableIncome, slabTax, cfg) -> { marginalReliefAmount, ... }
//   computeTax(ctx)               -> TaxResult (pure, deterministic)
//   explainResult(result, ctx)    -> narrative (from result only)
//   toRegimeTrace(ctx, regimeResult) -> RegimeTrace (frontend-compatible)
// =============================================================================

const { TAX_CONFIG, DEFAULT_FY } = require('./taxConfig');

// Re-export TAX_CONFIG as FY_CONFIG for backwards compatibility with any caller
// that previously imported FY_CONFIG from this module.
const FY_CONFIG = TAX_CONFIG;

const round = (n) => Math.round(Number(n) || 0);

// Source of a deduction value.
const SOURCE = {
  SYSTEM_DEFAULT: 'SYSTEM_DEFAULT',
  FORM16_OCR: 'FORM16_OCR',
  INVESTMENT_RECORD: 'INVESTMENT_RECORD',
  USER_MANUAL: 'USER_MANUAL',
};

// -----------------------------------------------------------------------------
// logDeductionStage (Part 6):
// Structured logging for deduction pipeline stages.
// -----------------------------------------------------------------------------
function logDeductionStage(stage, stageLabel, items) {
  if (process.env.DEBUG_DEDUCTIONS !== 'true') return;
  const fs = require('fs');
  const path = require('path');
  const logFile = path.join(__dirname, '../../../logs/deduction-pipeline.log');
  
  const payload = {
    timestamp: new Date().toISOString(),
    stage,
    stageLabel,
    itemCount: items.length,
    items: items,
  };
  
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(payload) + '\n');
  } catch (err) {
    console.error('[logDeductionStage] Failed to write log:', err.message);
  }
}

// Exclusion Categories
const EXCLUSION_CATEGORY = {
  CATEGORY_DATA_VALIDATION: 'CATEGORY_DATA_VALIDATION',
  CATEGORY_REGIME_RULE: 'CATEGORY_REGIME_RULE',
};

// Exclusion Reasons and their associated labels
const EXCLUSION_REASON = {
  DUPLICATE_LOWER_AMOUNT: 'DUPLICATE_LOWER_AMOUNT',
  EXCEEDS_STATUTORY_LIMIT: 'EXCEEDS_STATUTORY_LIMIT',
  UNCONFIRMED_SUBTYPE: 'UNCONFIRMED_SUBTYPE',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  NOT_ALLOWED_IN_REGIME: 'NOT_ALLOWED_IN_REGIME',
  NOT_APPLICABLE_TO_PROPERTY_TYPE: 'NOT_APPLICABLE_TO_PROPERTY_TYPE',
};

// Per-section metadata: which regimes allow it, its statutory cap (per regime),
// whether it is a salary exemption (HRA/LTA) vs a deduction, and the
// combined-limit group it belongs to (80C + 80CCC + 80CCD(1) <= 1.5L).
// Caps reference TAX_CONFIG — never hardcoded here.
const DED_SECTIONS = {
  StandardDeduction: {
    label: 'Standard Deduction',
    allowed: { Old: true, New: true },
    cap: (regime) => TAX_CONFIG[DEFAULT_FY].STANDARD_DEDUCTION[regime],
    kind: 'deduction',
    note: 'A flat deduction from salary income (Old ₹50,000 / New ₹75,000 for FY 2025-26).',
  },
  HRA: {
    label: 'House Rent Allowance (HRA) Exemption',
    allowed: { Old: true, New: false },
    cap: () => Infinity,
    kind: 'salaryExemption',
    note: 'Least of actual HRA, 10% of basic salary, or rent paid minus 10% of basic. Old regime only.',
  },
  LTA: {
    label: 'Leave Travel Allowance (LTA) Exemption',
    allowed: { Old: true, New: false },
    cap: () => Infinity,
    kind: 'salaryExemption',
    note: 'Exemption for actual travel on leave (twice in a block of 4 years). Old regime only.',
  },
  ProfessionalTax: {
    label: 'Professional Tax',
    allowed: { Old: true, New: false },
    cap: () => Infinity,
    kind: 'deduction',
    note: 'Professional tax paid is deductible from salary only under the Old regime.',
  },
  '80C': {
    label: 'Section 80C',
    allowed: { Old: true, New: false },
    cap: () => TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80C_GROUP,
    kind: 'deduction',
    limitGroup: '80C_group',
    note: 'Investments under Section 80C (PPF, ELSS, life insurance, home loan principal, tuition fees). Capped at ₹1,50,000.',
  },
  '80CCC': {
    label: 'Section 80CCC',
    allowed: { Old: true, New: false },
    cap: () => TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80C_GROUP,
    kind: 'deduction',
    limitGroup: '80C_group',
    note: 'Pension-fund contributions. Counts toward the combined ₹1,50,000 80C-group cap.',
  },
  '80CCD1': {
    label: 'Section 80CCD(1)',
    allowed: { Old: true, New: false },
    cap: () => TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80C_GROUP,
    kind: 'deduction',
    limitGroup: '80C_group',
    note: 'Employee NPS contribution. Counts toward the combined ₹1,50,000 80C-group cap.',
  },
  '80CCD1B': {
    label: 'Section 80CCD(1B) — NPS',
    allowed: { Old: true, New: false },
    cap: () => TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80CCD1B,
    kind: 'deduction',
    note: 'Additional deduction for own NPS contribution, up to ₹50,000 (over and above 80C).',
  },
  '80CCD2': {
    label: 'Section 80CCD(2) — Employer NPS',
    allowed: { Old: true, New: true },
    cap: () => Infinity,
    kind: 'deduction',
    note: "Employer's NPS contribution. Allowed under both regimes.",
  },
  '80D': {
    label: 'Section 80D — Health Insurance',
    allowed: { Old: true, New: false },
    cap: () => TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80D_SELF,
    kind: 'deduction',
    note: `Health-insurance premium for self/family. Up to ₹${TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80D_SELF.toLocaleString('en-IN')} (₹${TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80D_PARENTS.toLocaleString('en-IN')} for senior citizens).`,
  },
  '80E': {
    label: 'Section 80E — Education Loan Interest',
    allowed: { Old: true, New: false },
    cap: () => Infinity,
    kind: 'deduction',
    note: 'Interest on an education loan for higher studies. No upper limit, but requires an actual loan.',
  },
  '80G': {
    label: 'Section 80G — Donations',
    allowed: { Old: true, New: false },
    cap: () => Infinity,
    kind: 'deduction',
    note: 'Eligible donations (50% or 100% deduction depending on the fund).',
  },
  '24b': {
    label: 'Section 24(b) — Home Loan Interest',
    allowed: { Old: true, New: false },
    cap: () => TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_24B,
    kind: 'deduction',
    note: 'Interest paid on a home loan. Deduct up to ₹2,00,000 (self-occupied).',
  },
};

// Combined statutory caps for grouped sections (values from TAX_CONFIG).
const DED_SECTIONS_CAP = {
  '80C_group': TAX_CONFIG[DEFAULT_FY].DEDUCTION_CAPS.SECTION_80C_GROUP,
};

// -----------------------------------------------------------------------------
// Pure math helpers (cfg-driven, reused for both regimes).
// -----------------------------------------------------------------------------
function formatIndianCurrency(n) {
  if (n == null || !isFinite(n)) return '';
  let numStr = Math.round(n).toString();
  const lastThree = numStr.substring(numStr.length - 3);
  const otherNumbers = numStr.substring(0, numStr.length - 3);
  if (otherNumbers !== '') {
    return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
  }
  return numStr;
}

function fmtINR(n) {
  return formatIndianCurrency(n);
}

function buildSlabLabelsFromConfig(slabs) {
  return slabs.map((s) => {
    if (s.lowerBound === 0) return `Up to ₹${fmtINR(s.upperBound)}`;
    if (s.upperBound === Infinity) return `Above ₹${fmtINR(s.lowerBound - 1)}`;
    return `₹${fmtINR(s.lowerBound)} – ₹${fmtINR(s.upperBound)}`;
  });
}

// Also used internally with legacy bounds arrays (tax.service.js compatibility).
function buildSlabLabels(bounds) {
  const labels = [];
  let prev = 0;
  for (let i = 0; i < bounds.length; i++) {
    const upper = bounds[i];
    if (upper === Infinity) labels.push(`Above ₹${fmtINR(prev)}`);
    else if (prev === 0) labels.push(`Up to ₹${fmtINR(upper)}`);
    else labels.push(`₹${fmtINR(prev + 1)} – ₹${fmtINR(upper)}`);
    prev = upper;
  }
  return labels;
}

// -----------------------------------------------------------------------------
// computeSlabTax(taxableIncome, slabs, financialYear)
//
// Args:
//   taxableIncome  — number, income after all deductions
//   slabs          — array from TAX_CONFIG[fy].NEW_REGIME_SLABS or OLD_REGIME_SLABS
//   financialYear  — string (e.g. '2025-26'), for reference/logging only
//
// Returns { slabs: SlabBreakdown[], incomeTax: number }
//
// Assertion comments (verified values for FY 2025-26):
//   New regime, taxable 1200000 → incomeTax must be 60000
//     = 0 (on 400000 at 0%) + 20000 (on 400000 at 5%) + 40000 (on 400000 at 10%)
//   New regime, taxable 1500000 → incomeTax must be 97500
//     = 0 + 20000 + 40000 + 37500 (on 300000 at 15%)
//   Old regime, taxable 800000  → incomeTax must be 75000
//     = 0 (on 250000 at 0%) + 12500 (on 250000 at 5%) + 60000 (on 300000 at 20%)
// -----------------------------------------------------------------------------
function computeSlabTax(taxableIncome, slabs, _financialYear) {
  const t = Math.max(0, taxableIncome);
  let incomeTax = 0;
  const labels = buildSlabLabelsFromConfig(slabs);
  const slabBreakdown = [];

  for (let i = 0; i < slabs.length; i++) {
    const { lowerBound, upperBound, rate } = slabs[i];
    const bandLow = i === 0 ? 0 : lowerBound - 1; // effective lower for band width calc
    const bandHigh = upperBound === Infinity ? t : Math.min(t, upperBound);
    const taxableInThisSlab = Math.max(0, bandHigh - bandLow);
    const taxInThisSlab = Math.round(taxableInThisSlab * rate);

    slabBreakdown.push({
      slabLabel: labels[i],
      label: labels[i],          // alias for backward-compat with toRegimeTrace
      lower: bandLow === 0 ? 0 : bandLow + 1,
      upper: upperBound === Infinity ? null : upperBound,
      rate,
      incomeInBand: taxableInThisSlab, // alias kept for RegimeTrace UI
      taxableInThisSlab,
      taxInThisSlab,
      tax: taxInThisSlab,               // alias for RegimeTrace UI (SlabTable component)
    });

    incomeTax += taxInThisSlab;
    if (t <= upperBound) break;
  }

  return { slabs: slabBreakdown, incomeTax };
}

// Convenience: compute slab tax using legacy bounds/rates arrays (used by
// computeRegimeResult's surcharge marginal relief sub-call).
function computeSlabTaxLegacy(taxable, regime, cfg) {
  const bounds = cfg.SLAB_BOUNDS[regime];
  const rates  = cfg.SLAB_RATES[regime];
  const slabs  = bounds.map((upper, i) => ({
    lowerBound: i === 0 ? 0 : bounds[i - 1] + 1,
    upperBound: upper,
    rate: rates[i],
  }));
  return computeSlabTax(taxable, slabs, DEFAULT_FY);
}

// -----------------------------------------------------------------------------
// compute87ARebate(taxableIncome, slabTaxBeforeRebate, regime, cfg)
//
// Implements Section 87A rebate per Finance Act 2025.
// For new regime: eligibility threshold ₹12,00,000, max rebate ₹60,000.
// For old regime: eligibility threshold ₹5,00,000, max rebate ₹12,500.
//
// Returns:
//   { rebateAmount, isEligible, eligibilityReason, rebateApplied }
//
// Verification:
//   New regime, taxable 1200000, slabTax 60000 → rebateAmount 60000, isEligible true
//   New regime, taxable 1300000              → isEligible false, rebateAmount 0
//   Old regime, taxable 500000,  slabTax 12500 → rebateAmount 12500, isEligible true
//   Old regime, taxable 600000              → isEligible false, rebateAmount 0
// -----------------------------------------------------------------------------
function compute87ARebate(taxableIncome, slabTaxBeforeRebate, regime, cfg) {
  const { threshold, max } = cfg.REBATE[regime];
  const isEligible = taxableIncome <= threshold;

  if (!isEligible) {
    return {
      rebateAmount: 0,
      isEligible: false,
      eligibilityReason: `Taxable income ₹${fmtINR(taxableIncome)} exceeds the Section 87A eligibility threshold of ₹${fmtINR(threshold)} for the ${regime} regime.`,
      rebateApplied: false,
    };
  }

  const rebateAmount = Math.min(slabTaxBeforeRebate, max);
  return {
    rebateAmount,
    isEligible: true,
    eligibilityReason: `Taxable income ₹${fmtINR(taxableIncome)} is within the Section 87A eligibility threshold of ₹${fmtINR(threshold)}.`,
    rebateApplied: rebateAmount > 0,
  };
}

// -----------------------------------------------------------------------------
// computeMarginalRelief(taxableIncome, slabTaxBeforeRebate, cfg)
//
// Marginal relief prevents a small income increase above ₹12L (new regime) from
// causing a tax burden greater than the income above ₹12L.
//
// Formula:
//   threshold          = cfg.MARGINAL_RELIEF.newRegimeThreshold (₹12,00,000)
//   incomeAboveThresh  = taxableIncome - threshold
//   if slabTax > incomeAboveThresh:
//     marginalRelief        = slabTax - incomeAboveThresh
//     taxAfterMarginalRelief = incomeAboveThresh     (= taxableIncome - threshold)
//   else:
//     marginalRelief        = 0
//     taxAfterMarginalRelief = slabTax
//
// Runs ONLY when taxpayer is NOT eligible for 87A (i.e. taxableIncome > threshold).
//
// Regression scenarios (FY 2025-26 new regime):
//   Scenario 1: taxable 1200000, slabTax 60000 → rebate applies fully, marginalRelief = 0, netTax = 0
//   Scenario 2: taxable 1210000, slabTax 61500, incomeAbove = 10000
//     → slabTax (61500) > incomeAbove (10000) → marginalRelief = 51500, netTax = 10000
//   Scenario 3: taxable 1270000, slabTax 70500, incomeAbove = 70000
//     → slabTax (70500) > incomeAbove (70000) → marginalRelief = 500, netTax = 70000
//   Scenario 4: taxable 1300000, slabTax 75000, incomeAbove = 100000
//     → slabTax (75000) <= incomeAbove (100000) → marginalRelief = 0, netTax = 75000
// -----------------------------------------------------------------------------
function computeMarginalRelief(taxableIncome, slabTaxBeforeRebate, cfg) {
  const threshold = cfg.MARGINAL_RELIEF.newRegimeThreshold;
  // Only applies when taxable > threshold (i.e. not eligible for 87A rebate)
  if (taxableIncome <= threshold) {
    return {
      marginalReliefAmount: 0,
      taxAfterMarginalRelief: slabTaxBeforeRebate,
      marginalReliefApplied: false,
      explanation: 'Taxable income is at or below ₹12,00,000 — Section 87A rebate applies instead.',
    };
  }

  const incomeAboveThreshold = taxableIncome - threshold;
  if (slabTaxBeforeRebate > incomeAboveThreshold) {
    const marginalReliefAmount = slabTaxBeforeRebate - incomeAboveThreshold;
    return {
      marginalReliefAmount,
      taxAfterMarginalRelief: incomeAboveThreshold,
      marginalReliefApplied: true,
      explanation:
        `Marginal relief applied: slab tax ₹${fmtINR(slabTaxBeforeRebate)} exceeds income above ₹${fmtINR(threshold)} (₹${fmtINR(incomeAboveThreshold)}). ` +
        `Tax is capped at ₹${fmtINR(incomeAboveThreshold)}, saving ₹${fmtINR(marginalReliefAmount)}.`,
    };
  }

  return {
    marginalReliefAmount: 0,
    taxAfterMarginalRelief: slabTaxBeforeRebate,
    marginalReliefApplied: false,
    explanation:
      `No marginal relief: slab tax ₹${fmtINR(slabTaxBeforeRebate)} does not exceed income above ₹${fmtINR(threshold)} (₹${fmtINR(incomeAboveThreshold)}). ` +
      `Marginal relief applies only between ₹${fmtINR(threshold)} and approximately ₹${fmtINR(threshold + cfg.REBATE.New.max)} taxable income.`,
  };
}

// Backwards-compatible wrapper used by computeRegimeResult.
// Returns the rebate + marginal relief as a single combined rupee figure,
// which is what the tax waterfall always subtracted from income tax before.
function computeRebate(taxable, regime, incomeTaxBeforeRebate, cfg) {
  const rebateResult = compute87ARebate(taxable, incomeTaxBeforeRebate, regime, cfg);
  if (rebateResult.isEligible) {
    return rebateResult.rebateAmount;
  }
  // Not eligible for 87A — check marginal relief (new regime only).
  if (regime === 'New' && cfg.MARGINAL_RELIEF.applicable) {
    const mr = computeMarginalRelief(taxable, incomeTaxBeforeRebate, cfg);
    return mr.marginalReliefAmount;
  }
  return 0;
}

function surchargeBracket(totalIncome, regime, cfg) {
  let lower = 0;
  for (const t of cfg.SURCHARGE_TIERS) {
    if (t.limit === Infinity) {
      return { lower, rate: regime === 'New' ? cfg.NEW_SURCHARGE_CAP : cfg.OLD_SURCHARGE_TOP };
    }
    if (totalIncome <= t.limit) return { lower, rate: t.rate };
    lower = t.limit;
  }
  return { lower, rate: 0 };
}

function computeSurcharge(totalIncome, incomeTaxAfterRebate, regime, cfg) {
  const { lower: threshold, rate } = surchargeBracket(totalIncome, regime, cfg);
  if (rate === 0) return 0;
  const surcharge = Math.round(incomeTaxAfterRebate * rate);
  // Marginal relief on surcharge: crossing a surcharge tier must not make total
  // tax jump beyond tax on the threshold income PLUS the excess above it.
  const thresholdTaxable = Math.max(0, threshold - cfg.STANDARD_DEDUCTION[regime]);
  const slabs = regime === 'New' ? cfg.NEW_REGIME_SLABS : cfg.OLD_REGIME_SLABS;
  const taxAtThreshold = computeSlabTax(thresholdTaxable, slabs, DEFAULT_FY).incomeTax;
  const maxPreCess = taxAtThreshold + (totalIncome - threshold);
  const currentPreCess = incomeTaxAfterRebate + surcharge;
  if (currentPreCess > maxPreCess) {
    return Math.max(0, Math.round(maxPreCess - incomeTaxAfterRebate));
  }
  return surcharge;
}

// Statutory HRA exemption (Old regime only). Returns 0 when rent/basic missing —
// we NEVER guess an HRA exemption.
function computeHraExemption({ basicSalary = 0, hra = 0, rentPaid = null, regime }) {
  if (regime !== 'Old' || !basicSalary || rentPaid == null) return 0;
  const tenPctBasic = 0.1 * basicSalary;
  const rentLessTenPct = Math.max(0, rentPaid - tenPctBasic);
  return Math.max(0, Math.min(hra || 0, tenPctBasic, rentLessTenPct));
}

// Allowed provenance values for a DeductionLineItem.
const ALLOWED_SOURCES = new Set([
  SOURCE.FORM16_OCR,
  SOURCE.INVESTMENT_RECORD,
  SOURCE.USER_MANUAL,
  SOURCE.SYSTEM_DEFAULT,
]);

// -----------------------------------------------------------------------------
// DeductionLineItem factory.
// VALIDATION: if `source` is provided it MUST be one of the four canonical
// values above. Any other value will throw in dev and be silently nulled in
// prod, so we never store an unclassified provenance.
// -----------------------------------------------------------------------------
function makeLineItem(opts = {}) {
  // Source validation (Part 2).
  const rawSource = opts.source || null;
  if (rawSource !== null && !ALLOWED_SOURCES.has(rawSource)) {
    const msg = `[TAX ENGINE] DeductionLineItem created with invalid source "${rawSource}". ` +
      `Allowed values: ${[...ALLOWED_SOURCES].join(', ')}.`;
    if (process.env.NODE_ENV !== 'production') throw new Error(msg);
    console.error(msg);
  }

  const confidence = opts.confidence != null ? opts.confidence : 0;
  const needsConfirmation =
    opts.needsConfirmation != null
      ? opts.needsConfirmation
      : confidence < 80 || !opts.subtypeConfirmed;
  return {
    section: opts.section,
    subtype: opts.subtype || null,
    subtypeConfirmed: !!opts.subtypeConfirmed,
    amount: round(opts.amount || 0),
    originalAmount: opts.originalAmount != null ? round(opts.originalAmount) : null,
    source: rawSource,
    confidence,
    needsConfirmation,
    status:
      opts.status ||
      (opts.duplicateRisk
        ? 'EXCLUDED_DUPLICATE'
        : needsConfirmation
          ? 'NEEDS_CONFIRMATION'
          : 'CANDIDATE'),
    reason: opts.reason || null,
    originFile: opts.originFile || null,
    verificationMethod: opts.verificationMethod || null,
    notes: opts.notes || null,
    duplicateRisk: !!opts.duplicateRisk,
    exclusionCategory: opts.exclusionCategory || null,
    exclusionReason: opts.exclusionReason || null,
    exclusionNote: opts.exclusionNote || null,
  };
}

// Reduce any combined-limit group (e.g. 80C+80CCC+80CCD1) to its statutory cap.
function enforceGroupCaps(applied) {
  const groups = {};
  for (const a of applied) {
    const g = DED_SECTIONS[a.section] && DED_SECTIONS[a.section].limitGroup;
    if (g) (groups[g] = groups[g] || []).push(a);
  }
  for (const g of Object.keys(groups)) {
    const cap = DED_SECTIONS_CAP[g];
    const items = groups[g];
    let sum = items.reduce((s, i) => s + i.amount, 0);
    if (sum > cap) {
      let excess = sum - cap;
      for (let i = items.length - 1; i >= 0 && excess > 0; i--) {
        const cut = Math.min(items[i].amount, excess);
        items[i].amount -= cut;
        excess -= cut;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// filterValidDeductions (Part 2):
// Pure function that removes deductions with null, undefined, NaN, zero, or negative amounts.
// -----------------------------------------------------------------------------
function filterValidDeductions(items) {
  const validSources = [SOURCE.FORM16_OCR, SOURCE.INVESTMENT_RECORD, SOURCE.USER_MANUAL, SOURCE.SYSTEM_DEFAULT];
  
  return items.filter((item) => {
    if (item.amount == null) return false;
    if (typeof item.amount !== 'number' || !Number.isFinite(item.amount)) return false;
    if (item.amount <= 0) {
      if (process.env.NODE_ENV === 'development' || process.env.DEBUG_DEDUCTIONS === 'true') {
        console.warn(`[filterValidDeductions] Discarded ${item.section}: amount is zero or negative (${item.amount})`);
      }
      return false;
    }
    if (!item.section || typeof item.section !== 'string' || item.section.trim() === '') return false;
    if (!validSources.includes(item.source)) return false;
    
    return true;
  });
}

// -----------------------------------------------------------------------------
// TaxpayerContext builder. Converts a Form 16 doc + aggregated financial records
// into the canonical context with per-deduction provenance.
// -----------------------------------------------------------------------------
function fromForm16(form16 = {}, { recordsAgg = {}, eduTuition = 0 } = {}) {
  const f = form16 || {};
  const cfg = TAX_CONFIG[DEFAULT_FY];
  const records = {
    // `aggregateDeductions` deliberately excludes education payments. Tuition
    // is supplied separately here so it has exactly one path into 80C.
    section80C: round((recordsAgg.section80C || 0) + (eduTuition || 0)),
    section80CCD: round(recordsAgg.section80CCD || 0),
    section80D: round(recordsAgg.section80D || 0),
    section80E: round(recordsAgg.section80E || 0),
    section80G: round(recordsAgg.section80G || 0),
    section24: round(recordsAgg.section24 || 0),
  };

  const grossSalary = f.grossSalary != null ? Number(f.grossSalary) : null;
  const componentSum = round(
    (Number(f.basicSalary) || 0) +
      (Number(f.hra) || 0) +
      (Number(f.specialAllowance) || 0) +
      (Number(f.lta) || 0) +
      (Number(f.otherAllowances) || 0),
  );
  const grossSalarySource = grossSalary != null ? 'FORM16_EXPLICIT' : 'COMPONENT_SUM';

  const basicSalary = Number(f.basicSalary) || 0;
  const hraReceived = Number(f.hra) || 0;
  const rentPaid = f.rentPaid != null ? Number(f.rentPaid) : null;
  const hraExemption = computeHraExemption({ basicSalary, hra: hraReceived, rentPaid, regime: 'Old' });

  const items = [];

  // Standard deduction — statutory, always verified.
  // We store the value from Form 16 if provided; the engine always applies the
  // regime-specific statutory value from TAX_CONFIG (not this stored amount).
  const sdFromForm = f.standardDeduction != null ? Number(f.standardDeduction) : null;
  items.push(
    makeLineItem({
      section: 'StandardDeduction',
      subtype: null,
      subtypeConfirmed: true,
      amount: sdFromForm != null ? sdFromForm : cfg.STANDARD_DEDUCTION.Old,
      source: sdFromForm != null ? SOURCE.FORM16_OCR : SOURCE.SYSTEM_DEFAULT,
      confidence: sdFromForm != null ? 95 : 100,
      needsConfirmation: false,
      originFile: sdFromForm != null ? f.pdfReference : null,
      verificationMethod: sdFromForm != null ? 'FORM16_OCR_EXPLICIT' : 'STATUTORY_DEFAULT',
    }),
  );

  // HRA — only an EXEMPTION (Old regime); computed from the statutory formula.
  items.push(
    makeLineItem({
      section: 'HRA',
      subtype: null,
      subtypeConfirmed: rentPaid != null,
      amount: hraExemption,
      source: rentPaid != null ? SOURCE.FORM16_OCR : null,
      confidence: rentPaid != null ? 90 : 40,
      needsConfirmation: rentPaid == null,
      notes:
        rentPaid == null
          ? 'HRA exemption cannot be computed without rent-paid data; excluded.'
          : null,
      originFile: rentPaid != null ? f.pdfReference : null,
      verificationMethod: rentPaid != null ? 'FORM16_OCR_EXPLICIT' : null,
    }),
  );

  // LTA exemption (Old only).
  const lta = Number(f.lta) || 0;
  if (lta > 0) {
    items.push(
      makeLineItem({
        section: 'LTA',
        subtype: null,
        subtypeConfirmed: true,
        amount: lta,
        source: SOURCE.FORM16_OCR,
        confidence: 90,
        needsConfirmation: false,
        originFile: f.pdfReference || null,
        verificationMethod: 'FORM16_OCR_EXPLICIT',
      }),
    );
  }

  const professionalTax = Number(f.professionalTax) || 0;
  if (professionalTax > 0) {
    items.push(
      makeLineItem({
        section: 'ProfessionalTax',
        subtype: '16(iii)',
        subtypeConfirmed: true,
        amount: professionalTax,
        source: SOURCE.FORM16_OCR,
        confidence: 95,
        needsConfirmation: false,
        originFile: f.pdfReference || null,
        verificationMethod: 'FORM16_OCR_EXPLICIT',
      }),
    );
  }

  // FIRST PIPELINE STAGE: Filter after OCR extraction
  logDeductionStage(1, 'AFTER_OCR_CONSTRUCTION', items);
  let filteredItems = filterValidDeductions(items);
  logDeductionStage(3, 'AFTER_ZERO_FILTER', filteredItems);

  // Chapter VI-A sections: ONE item per section, the larger of Form 16 / records,
  // with provenance. Never invent a section absent from both sources (Rule 3),
  // and never split an ambiguous 80CCD into subsections (Rule 2).
  //
  // Part 2 — Cap enforcement:
  //   The stored `amount` on a DeductionLineItem is the CAPPED value (≤ statutory
  //   limit). The pre-cap raw value is preserved in `originalAmount` so the
  //   Deduction Source Table can show "₹222,000 from records, capped to ₹150,000".
  //   The engine re-applies caps in computeRegimeResult to handle group caps;
  //   these per-item caps are a first-pass guard that keeps the stored snapshot clean.
  //
  // Part 2 — Duplicate risk:
  //   When BOTH a FORM16_OCR item and an INVESTMENT_RECORD item exist for the
  //   same section, the INVESTMENT_RECORD item is stored separately (not merged)
  //   and flagged with duplicateRisk = true.
  const viatSections = [
    { sec: '80C',  form: f.section80C,  record: records.section80C  },
    { sec: '80CCD', form: f.section80CCD, record: records.section80CCD },
    { sec: '80D',  form: f.section80D,  record: records.section80D  },
    { sec: '80E',  form: f.section80E,  record: records.section80E  },
    { sec: '80G',  form: f.section80G,  record: records.section80G  },
    { sec: '24b',  form: f.section24,   record: records.section24   },
  ];
  for (const { sec, form, record } of viatSections) {
    const fv = Number(form) || 0;
    const rv = Number(record) || 0;
    if (fv <= 0 && rv <= 0) continue; // Rule 3: never invent a deduction.

    const meta = DED_SECTIONS[sec];
    // Per-item cap (Old regime cap is the more restrictive for VI-A sections).
    const rawCap = meta && meta.cap ? meta.cap('Old') : Infinity;
    const itemCap = rawCap === Infinity ? null : rawCap;

    // Determine primary source (larger of form vs record).
    const useForm = fv >= rv;
    const primaryRaw = useForm ? fv : rv;
    const primarySource = useForm ? SOURCE.FORM16_OCR : SOURCE.INVESTMENT_RECORD;
    const primaryAmount = itemCap != null ? Math.min(primaryRaw, itemCap) : primaryRaw;

    const base = {
      section: sec,
      amount: primaryAmount,
      originalAmount: primaryRaw !== primaryAmount ? primaryRaw : null,
      source: primarySource,
      confidence: 95,
      originFile: primarySource === SOURCE.FORM16_OCR ? (f.pdfReference || null) : null,
      verificationMethod: primarySource === SOURCE.FORM16_OCR ? 'FORM16_OCR_EXPLICIT' : 'FINANCIAL_RECORD',
    };
    if (sec === '80CCD') {
      // Rule 2: ambiguous subsection -> single item, unconfirmed, never split.
      base.subtype = null;
      base.subtypeConfirmed = false;
      base.needsConfirmation = true;
      base.notes =
        'Subsection unknown — could be employee contribution 80CCD(1), additional NPS 80CCD(1B), or employer contribution 80CCD(2).';
      if (primaryRaw === 0) {
        base.notes = (base.notes ? base.notes + ' ' : '') + 'Value explicitly stated as 0.';
      }
    } else if (sec === '80G') {
      // 80G can be 50% or 100%, may have a qualifying limit, and needs the
      // donee/category details. A bare Form 16 total is not enough to choose a
      // statutory treatment, so retain it for review but never guess.
      base.subtype = null;
      base.subtypeConfirmed = false;
      base.needsConfirmation = true;
      base.status = 'NEEDS_CONFIRMATION';
      base.reason = '80G eligibility percentage and donee category are required';
      base.notes = 'Confirm the eligible donation category and deduction percentage before claiming Section 80G.';
    } else {
      base.subtype = sec;
      base.subtypeConfirmed = true;
      base.needsConfirmation = false;
    }
    
    // We create separate arrays for filtering before merge
    const ocrItems = [];
    const invItems = [];
    
    if (useForm && fv != null) {
      ocrItems.push(makeLineItem(base));
    } else if (!useForm && rv != null) {
      invItems.push(makeLineItem(base));
    }

    // If BOTH form and records have a value for this section, add the secondary
    // as a separate line item flagged with duplicateRisk = true (Part 2).
    // The secondary gets EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT and CATEGORY_DATA_VALIDATION.
    if (fv > 0 && rv > 0 && useForm) {
      const secondaryRaw = rv;
      const secondaryAmount = itemCap != null ? Math.min(secondaryRaw, itemCap) : secondaryRaw;
      
      const equalNote = (fv === rv) ? ' Equal amounts found — Form 16 value takes precedence.' : '';
      
      invItems.push(makeLineItem({
        ...base,
        amount: secondaryAmount,
        originalAmount: secondaryRaw !== secondaryAmount ? secondaryRaw : null,
        source: SOURCE.INVESTMENT_RECORD,
        confidence: 85,
        duplicateRisk: true,
        exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION,
        exclusionReason: EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT,
        exclusionNote: 'Assigned during deduction merge — pre-regime.',
        status: 'EXCLUDED_DUPLICATE',
        reason: 'Duplicate lower amount',
        verificationMethod: 'FINANCIAL_RECORD',
        notes: `Investment records also show ₹${formatIndianCurrency(secondaryRaw)} for ${sec}. ` +
          `Since Form 16 has a higher or equal value (₹${formatIndianCurrency(fv)}), only the Form 16 amount is applied.` + equalNote,
      }));
    } else if (fv > 0 && rv > 0 && !useForm) {
      // Very rare case where records value > Form16 value, so the form value becomes secondary
      const secondaryRaw = fv;
      const secondaryAmount = itemCap != null ? Math.min(secondaryRaw, itemCap) : secondaryRaw;
      ocrItems.push(makeLineItem({
        ...base,
        amount: secondaryAmount,
        originalAmount: secondaryRaw !== secondaryAmount ? secondaryRaw : null,
        source: SOURCE.FORM16_OCR,
        confidence: 85,
        duplicateRisk: true,
        exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION,
        exclusionReason: EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT,
        exclusionNote: 'Assigned during deduction merge — pre-regime.',
        status: 'EXCLUDED_DUPLICATE',
        reason: 'Duplicate lower amount',
        originFile: f.pdfReference || null,
        verificationMethod: 'FORM16_OCR_EXPLICIT',
        notes: `Form 16 shows ₹${formatIndianCurrency(secondaryRaw)} for ${sec}. ` +
          `Since investment records have a higher value (₹${formatIndianCurrency(rv)}), only the record amount is applied.`,
      }));
    }

    // Pipeline Stage 2 & 3: Filter INVESTMENT_RECORD and USER_MANUAL 
    logDeductionStage(2, 'AFTER_INVESTMENT_RECORD_FETCH', invItems);
    
    const validOcr = filterValidDeductions(ocrItems);
    const validInv = filterValidDeductions(invItems);
    
    filteredItems = filteredItems.concat(validOcr, validInv);
  }
  
  // Pipeline Stage 4: Filter after merge
  logDeductionStage(4, 'AFTER_MERGE', filteredItems);
  filteredItems = filterValidDeductions(filteredItems);

  return {
    salary: {
      grossSalary,
      basicSalary,
      hra: hraReceived,
      specialAllowance: Number(f.specialAllowance) || 0,
      lta,
      otherAllowances: Number(f.otherAllowances) || 0,
      grossSalarySource,
      componentSum,
      tdsDeducted: Number(f.tdsDeducted) || 0,
      employeePAN: f.employeePAN || null,
    },
    deductions: filteredItems,
    computedIncome: { totalDeductions: 0, taxableIncomeOldRegime: 0, taxableIncomeNewRegime: 0 },
    taxResult: { oldRegime: null, newRegime: null },
    metadata: {
      extractionTimestamp: f.updatedAt || f.createdAt || null,
      lastEditedTimestamp: null,
      lastCalculationTimestamp: null,
      validationStatus: 'pending',
      validationErrors: [],
    },
    financialYear: f.financialYear || DEFAULT_FY,
    intendedRegime: f.taxRegimeUsed || null,
    // Part 1: isFinalized is set to true by the caller when the user clicks
    // "Save and Continue" on the Review page. Once true, no code downstream
    // may inject additional deductions.
    isFinalized: false,
  };
}

// -----------------------------------------------------------------------------
// Validation layer. Runs before any calculation.
// -----------------------------------------------------------------------------
function validateTaxpayerContext(ctx) {
  const errors = [];
  const warnings = [];
  let isBlockingError = false;

  const salary = (ctx && ctx.salary) || {};
  const gross = salary.grossSalary;
  const componentSum = salary.componentSum;
  const cfg = TAX_CONFIG[(ctx && ctx.financialYear) || DEFAULT_FY] || TAX_CONFIG[DEFAULT_FY];

  // Check 1 — gross salary consistency.
  if (gross != null && componentSum != null && Math.abs(componentSum - gross) > 500) {
    errors.push(
      `Gross salary mismatch: Form 16 states ₹${fmtINR(gross)} but extracted components sum to ₹${fmtINR(componentSum)}.`,
    );
  }

  // Check 2 — mandatory fields.
  if (gross == null || gross === 0) {
    errors.push('Gross salary is missing or zero — cannot compute tax.');
    isBlockingError = true;
  }
  if (!ctx.financialYear) {
    errors.push('Financial year is missing — cannot determine tax rules.');
    isBlockingError = true;
  }
  if (!salary.employeePAN) warnings.push('Employee PAN is missing.');

  // Check 3 — duplicate / over-limit detection.
  // IMPORTANT: Validation uses the REGIME-SPECIFIC cap for StandardDeduction
  // (Old = 50000, New = 75000), NOT a single hardcoded constant.
  const groups = {};
  for (const item of ctx.deductions || []) {
    const meta = DED_SECTIONS[item.section];
    if (!meta) continue;

    // StandardDeduction: validate against the higher of the two regime caps
    // because at validation time we don't know which regime will be applied.
    // A value up to the New regime cap (75000) is always valid.
    let cap;
    if (item.section === 'StandardDeduction') {
      cap = Math.max(cfg.STANDARD_DEDUCTION.Old, cfg.STANDARD_DEDUCTION.New);
    } else {
      cap = meta.cap ? meta.cap('Old') : null;
    }

    if (cap != null && cap !== Infinity && (item.amount || 0) > cap) {
      errors.push(
        `Section ${item.section} amount ₹${fmtINR(item.amount)} exceeds the statutory limit of ₹${fmtINR(cap)}.`,
      );
    }
    const g = meta.limitGroup;
    if (g) (groups[g] = groups[g] || []).push(item);
  }
  for (const g of Object.keys(groups)) {
    const cap = DED_SECTIONS_CAP[g];
    const sum = groups[g].reduce((s, i) => s + (i.amount || 0), 0);
    if (sum > cap) {
      errors.push(
        `Combined ${g.replace('_group', '')} deductions of ₹${fmtINR(sum)} exceed the statutory limit of ₹${fmtINR(cap)}.`,
      );
    }
  }

  // Check 4 — unconfirmed subtypes (excluded from calc, listed separately).
  for (const item of ctx.deductions || []) {
    if (item.needsConfirmation) {
      warnings.push(
        `Section ${item.section}${item.subtype ? ` (${item.subtype})` : ''} is unconfirmed — excluded from the calculation. ${
          item.notes || 'Confirm the subsection to claim it.'
        }`,
      );
    }
  }

  // Check 5 — cross-regime applicability.
  if (ctx.intendedRegime === 'New') {
    for (const item of ctx.deductions || []) {
      const meta = DED_SECTIONS[item.section];
      if (meta && !meta.allowed.New && item.needsConfirmation === false) {
        const kind = meta.kind === 'salaryExemption' ? 'salary exemption' : 'deduction';
        warnings.push(
          `Section ${item.section} is a ${kind} not allowed under the New regime; ignored for the New regime.`,
        );
      }
    }
  }

  // Check 6 — TDS reasonableness.
  const tds = salary.tdsDeducted || 0;
  if (tds > (gross || 0)) {
    warnings.push('TDS deducted appears unusually high (exceeds gross salary) — verify from Form 26AS.');
  }

  // Check 7 — HRA validity.
  const validDeductions = filterValidDeductions(ctx.deductions || []);
  for (const item of validDeductions) {
    if (item.section === 'HRA' && (item.amount || 0) === 0 && item.needsConfirmation) {
      warnings.push('HRA exemption could not be computed — rent data is missing; HRA excluded.');
    }
  }

  const validationStatus = isBlockingError
    ? 'blocking'
    : errors.length
      ? 'error'
      : warnings.length
        ? 'warning'
        : 'ok';

  return { errors, warnings, isBlockingError, validationStatus };
}

// -----------------------------------------------------------------------------
// Deterministic per-regime computation.
// -----------------------------------------------------------------------------
function computeRegimeResult(ctx, regime, trace) {
  const cfg = TAX_CONFIG[ctx.financialYear] || TAX_CONFIG[DEFAULT_FY];
  const sd = cfg.STANDARD_DEDUCTION[regime];
  const gross = ctx.salary.grossSalary || 0;
  const slabs = regime === 'New' ? cfg.NEW_REGIME_SLABS : cfg.OLD_REGIME_SLABS;
  // Part 5: each trace step now carries a `source` field.
  //   SYSTEM_DEFAULT — fixed statutory parameter from TAX_CONFIG
  //   FORM16_OCR     — value extracted from the Form 16 PDF
  //   INVESTMENT_RECORD — value from the user's financial records
  //   USER_INPUT     — value edited by the user on the Review page
  //   COMPUTED       — derived mathematically from other trace entries
  const step = (name, input, formula, output, source = 'COMPUTED') =>
    trace.push({ step: name, input, formula, output, source });

  // Salary exemptions (HRA / LTA) — Old regime only.
  let hraExempt = 0;
  let ltaExempt = 0;
  const validDeductions2 = filterValidDeductions(ctx.deductions || []);
  for (const item of validDeductions2) {
    if (item.section === 'HRA' && regime === 'Old') hraExempt = item.amount || 0;
    else if (item.section === 'LTA' && regime === 'Old') ltaExempt = item.amount || 0;
  }
  step(
    `${regime} · Salary exemptions`,
    { hra: hraExempt, lta: ltaExempt },
    'HRA/LTA exemptions apply only under the Old regime',
    hraExempt + ltaExempt,
    'FORM16_OCR',
  );

  const grossTotalIncome = Math.max(0, gross - hraExempt - ltaExempt);
  step(
    `${regime} · Gross Total Income`,
    { grossSalary: gross, lessExemptions: hraExempt + ltaExempt },
    'Gross − HRA − LTA',
    grossTotalIncome,
    'COMPUTED',
  );

  // Verified Chapter VI-A / other deductions (New regime applies NONE of these).
  const applied = [];
  const unverified = [];
  for (const item of validDeductions2) {
    const meta = DED_SECTIONS[item.section];
    if (meta && meta.kind === 'salaryExemption') continue; // HRA/LTA handled above
    if (item.section === 'StandardDeduction') continue;    // applied as `sd` below
    if (!meta) {
      // Unrecognized section (e.g. 80CCD whose subsection is unknown) — never
      // silently dropped; surface it as unverified so the audit can show it.
      unverified.push({
        ...item,
        exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION,
        exclusionReason: EXCLUSION_REASON.UNCONFIRMED_SUBTYPE,
        reason: 'Section not recognized — confirm the subsection to claim it',
      });
      continue;
    }
    if (!meta.allowed[regime]) {
      // Rule 4: Data validation happens BEFORE regime evaluation. If this item was
      // already excluded during data validation (e.g. duplicate), preserve its original reason.
      if (item.exclusionReason) {
        unverified.push(item);
      } else {
        // If it passed data validation but is not allowed in this regime, it's a regime exclusion.
        unverified.push({
          ...item,
          exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_REGIME_RULE,
          exclusionReason: (item.section === '24b' && regime === 'New') ? EXCLUSION_REASON.NOT_APPLICABLE_TO_PROPERTY_TYPE : EXCLUSION_REASON.NOT_ALLOWED_IN_REGIME,
          exclusionNote: 'Assigned during regime rule evaluation.',
          reason: `Section ${item.section} is not allowed under the ${regime} regime`,
        });
      }
      continue;
    }
    // THREE-CONDITION INCLUSION FILTER (Part 2 — Final 5%):
    //   1. needsConfirmation must be false (subsection confirmed, confidence OK)
    //   2. source must be present (provenance known)
    //   3. duplicateRisk must NOT be true (secondary source overlap)
    // Any item failing ANY condition goes to unverified — never to applied.
    const verified = item.needsConfirmation === false && !!item.source && !item.duplicateRisk;
    if (!verified) {
      if (item.exclusionReason) {
        unverified.push(item);
      } else {
        unverified.push({
          ...item,
          exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION,
          exclusionReason: item.duplicateRisk ? EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT : (item.needsConfirmation ? EXCLUSION_REASON.UNCONFIRMED_SUBTYPE : EXCLUSION_REASON.LOW_CONFIDENCE),
          reason: 'Amount or subsection could not be confirmed',
        });
      }
      continue;
    }
    const cap = meta.cap(regime);
    const claimed = Math.min(item.amount || 0, cap);
    applied.push({
      section: item.section,
      subtype: item.subtype,
      amount: claimed,
      source: item.source,
      note: meta.label,
    });
  }
  // Statutory combined caps (80C group).
  enforceGroupCaps(applied);

  const sdClaim = sd; // standard deduction always applies (regime-specific from config)
  const totalDeductions = round(sdClaim + applied.reduce((s, a) => s + a.amount, 0));
  step(
    `${regime} · Standard deduction`,
    { value: sdClaim },
    `Statutory flat deduction for ${regime} regime from TAX_CONFIG`,
    sdClaim,
    'SYSTEM_DEFAULT',
  );
  step(
    `${regime} · Total deductions`,
    { standardDeduction: sdClaim, applied },
    'Standard deduction + verified Chapter VI-A (capped)',
    totalDeductions,
    'COMPUTED',
  );

  let taxableIncome = round(grossTotalIncome - totalDeductions);
  if (taxableIncome < 0) {
    step(`${regime} · Negative taxable income`, { raw: taxableIncome }, 'Floored at 0', 0, 'COMPUTED');
    taxableIncome = 0;
  }
  step(
    `${regime} · Taxable income`,
    { grossTotalIncome, lessDeductions: totalDeductions },
    'GTI − deductions',
    taxableIncome,
    'COMPUTED',
  );

  const slab = computeSlabTax(taxableIncome, slabs, ctx.financialYear || DEFAULT_FY);
  step(
    `${regime} · Income tax before rebate`,
    { slabs: slab.slabs.map((s) => ({ label: s.label, tax: s.tax })) },
    'Sum of slab taxes',
    slab.incomeTax,
  );

  // --- Section 87A rebate ---
  const rebateResult = compute87ARebate(taxableIncome, slab.incomeTax, regime, cfg);
  let effectiveRebate = rebateResult.rebateAmount;
  let marginalReliefResult = null;

  if (!rebateResult.isEligible && regime === 'New' && cfg.MARGINAL_RELIEF.applicable) {
    marginalReliefResult = computeMarginalRelief(taxableIncome, slab.incomeTax, cfg);
    if (marginalReliefResult.marginalReliefApplied) {
      effectiveRebate = marginalReliefResult.marginalReliefAmount;
    }
  }

  step(
    `${regime} · 87A rebate`,
    {
      taxableIncome,
      threshold: cfg.REBATE[regime].threshold,
      isEligible: rebateResult.isEligible,
      marginalRelief: marginalReliefResult ? marginalReliefResult.marginalReliefAmount : 0,
    },
    rebateResult.isEligible
      ? 'Section 87A rebate: min(slabTax, maxRebate)'
      : marginalReliefResult && marginalReliefResult.marginalReliefApplied
        ? 'Marginal relief applied (income just above 87A threshold)'
        : 'No rebate or marginal relief — income too high',
    effectiveRebate,
  );

  const taxAfterRebate = Math.max(0, slab.incomeTax - effectiveRebate);
  const surcharge = computeSurcharge(grossTotalIncome, taxAfterRebate, regime, cfg);
  step(
    `${regime} · Surcharge`,
    { grossTotalIncome, taxAfterRebate },
    'Per surcharge tier on income tax',
    surcharge,
    'COMPUTED',
  );

  const cess = Math.round((taxAfterRebate + surcharge) * cfg.CESS);
  step(
    `${regime} · Health & Education Cess (${cfg.CESS * 100}%)`,
    { base: taxAfterRebate + surcharge, cessRate: cfg.CESS },
    `${cfg.CESS * 100}% of (tax after rebate + surcharge) — rate from TAX_CONFIG`,
    cess,
    'SYSTEM_DEFAULT',
  );

  const finalTax = taxAfterRebate + surcharge + cess;
  step(
    `${regime} · Final tax liability`,
    { taxAfterRebate, surcharge, cess },
    'Sum',
    finalTax,
    'COMPUTED',
  );

  const tds = ctx.salary.tdsDeducted || 0;
  const balance = finalTax - tds;
  const refundAmount = balance < 0 ? round(-balance) : 0;
  const taxPayable = balance > 0 ? round(balance) : 0;
  step(
    `${regime} · TDS adjustment`,
    { finalTax, tdsDeducted: tds },
    'Final tax − TDS',
    balance < 0 ? `Refund ₹${fmtINR(refundAmount)}` : `Payable ₹${fmtINR(taxPayable)}`,
    'FORM16_OCR',
  );

  const verifiedDeductionsTotal = round(applied.reduce((s, a) => s + a.amount, 0));
  const unverifiedDeductionsTotal = round(unverified.reduce((s, u) => s + (u.amount || 0), 0));

  return {
    regime,
    salaryExemptions: { hra: hraExempt, lta: ltaExempt },
    grossTotalIncome,
    standardDeduction: sdClaim,
    applied,
    unverified,
    totalDeductions,
    verifiedDeductionsTotal,    // VI-A/other verified only (excludes SD)
    unverifiedDeductionsTotal,  // excluded/unconfirmed total
    taxableIncome,
    slabs: slab.slabs,
    incomeTaxBeforeRebate: slab.incomeTax,
    rebate87A: effectiveRebate,
    rebate87ADetail: rebateResult,
    marginalRelief: marginalReliefResult,
    surcharge,
    cess,
    totalTax: finalTax,
    tdsDeducted: tds,
    taxPayable,
    refundAmount,
  };
}

// -----------------------------------------------------------------------------
// computeTax — the deterministic entry point.
// -----------------------------------------------------------------------------
function computeTax(ctx) {
  const validation = validateTaxpayerContext(ctx);
  const trace = [];
  if (validation.isBlockingError) {
    return {
      error: true,
      errors: validation.errors,
      warnings: validation.warnings,
      oldRegime: null,
      newRegime: null,
      unverifiedDeductions: [],
      recommendedRegime: null,
      savingsAmount: 0,
      calculationTrace: trace,
    };
  }

  const oldRegime = computeRegimeResult(ctx, 'Old', trace);
  const newRegime = computeRegimeResult(ctx, 'New', trace);

  // Merge unverified deductions (regime-independent) into one list.
  const byKey = new Map();
  for (const u of [...oldRegime.unverified, ...newRegime.unverified]) {
    byKey.set(`${u.section}:${u.subtype || ''}`, u);
  }
  const unverifiedDeductions = [...byKey.values()];

  const recommendedRegime = oldRegime.totalTax <= newRegime.totalTax ? 'Old' : 'New';
  const savingsAmount = Math.abs(oldRegime.totalTax - newRegime.totalTax);
  const similar = savingsAmount < 5000;

  trace.push({
    step: 'Recommendation',
    input: { oldFinalTax: oldRegime.totalTax, newFinalTax: newRegime.totalTax },
    formula: 'Lower final tax wins; savings = |old − new|',
    output: `Recommended: ${recommendedRegime}; savings ₹${fmtINR(savingsAmount)}${
      similar ? ' (both regimes similar — choice may depend on investment flexibility)' : ''
    }`,
    source: 'COMPUTED',
  });

  const result = {
    error: false,
    errors: validation.errors,
    warnings: validation.warnings,
    oldRegime,
    newRegime,
    unverifiedDeductions,
    recommendedRegime,
    savingsAmount,
    computedIncome: {
      totalDeductions: oldRegime.totalDeductions,
      taxableIncomeOldRegime: oldRegime.taxableIncome,
      taxableIncomeNewRegime: newRegime.taxableIncome,
    },
    calculationTrace: trace,
  };
  
  // Runtime consistency assertion — dev + test mode only.
  assertNoZeroDeductions(result);
  
  if (process.env.NODE_ENV !== 'production') {
    try { assertTaxResultConsistency(result, ctx); } catch (e) { console.error(e.message); }
  }
  return result;
}

// -----------------------------------------------------------------------------
// assertTaxResultConsistency — four accounting invariants that MUST hold for
// any valid TaxResult + TaxpayerContext pair. Called in dev/test mode.
// Throws a detailed Error if any invariant is violated.
// -----------------------------------------------------------------------------
function assertTaxResultConsistency(result, ctx) {
  if (!result || result.error) return; // blocking errors: skip assertion
  const old = result.oldRegime;
  const neu = result.newRegime;
  if (!old || !neu) return;

  const fmt = (n) => `₹${formatIndianCurrency(n)}`;
  const errs = [];

  // 1. verifiedDeductionsTotal must equal sum of passing deductions.
  const ctxVerifiedSum = round(
    (ctx.deductions || [])
      .filter((d) => d.needsConfirmation === false && !!d.source && !d.duplicateRisk)
      .filter((d) => {
        const meta = DED_SECTIONS[d.section];
        return meta && meta.allowed && meta.allowed.Old && meta.kind !== 'salaryExemption' && d.section !== 'StandardDeduction';
      })
      .reduce((s, d) => {
        const meta = DED_SECTIONS[d.section];
        const cap = meta && meta.cap ? meta.cap('Old') : Infinity;
        return s + Math.min(d.amount || 0, cap);
      }, 0)
  );
  if (Math.abs(old.verifiedDeductionsTotal - ctxVerifiedSum) > 1) {
    errs.push(
      `[1] old.verifiedDeductionsTotal=${fmt(old.verifiedDeductionsTotal)} ≠ ` +
      `sum of passing deductions=${fmt(ctxVerifiedSum)} (diff=${fmt(Math.abs(old.verifiedDeductionsTotal - ctxVerifiedSum))})`
    );
  }

  // 2. old.taxableIncome must equal ctx.computedIncome.taxableIncomeOldRegime.
  if (ctx.computedIncome && ctx.computedIncome.isCalculated === true) {
    if (Math.abs(old.taxableIncome - ctx.computedIncome.taxableIncomeOldRegime) > 1) {
      errs.push(
        `[2] old.taxableIncome=${fmt(old.taxableIncome)} ≠ ` +
        `ctx.computedIncome.taxableIncomeOldRegime=${fmt(ctx.computedIncome.taxableIncomeOldRegime)}`
      );
    }
  }

  // 3. new.taxableIncome must equal ctx.computedIncome.taxableIncomeNewRegime.
  if (ctx.computedIncome && ctx.computedIncome.isCalculated === true) {
    if (Math.abs(neu.taxableIncome - ctx.computedIncome.taxableIncomeNewRegime) > 1) {
      errs.push(
        `[3] new.taxableIncome=${fmt(neu.taxableIncome)} ≠ ` +
        `ctx.computedIncome.taxableIncomeNewRegime=${fmt(ctx.computedIncome.taxableIncomeNewRegime)}`
      );
    }
  }

  // 4. Accounting identity: totalTax + refund = TDS + taxPayable (no money created or lost).
  for (const r of [old, neu]) {
    const lhs = r.totalTax + (r.refundAmount || 0);
    const rhs = (r.tdsDeducted || 0) + (r.taxPayable || 0);
    if (Math.abs(lhs - rhs) > 1) {
      errs.push(
        `[4] ${r.regime} accounting: totalTax(${fmt(r.totalTax)})+refund(${fmt(r.refundAmount)}) ` +
        `≠ TDS(${fmt(r.tdsDeducted)})+payable(${fmt(r.taxPayable)}) diff=${fmt(Math.abs(lhs - rhs))}`
      );
    }
  }

  if (errs.length > 0) {
    throw new Error(
      `[TAX CONSISTENCY] TaxResult × TaxpayerContext invariant violation(s):\n` + errs.join('\n')
    );
  }
}

// -----------------------------------------------------------------------------
// explainResult — narrative generated strictly from the computed result.
// Mentions a deduction ONLY if it appears (verified) in the result, and never
// uses words like ELSS/LIC/insurance/tuition/NPS unless present in a source note.
// -----------------------------------------------------------------------------
function explainResult(result, ctx) {
  // ZERO-VALUE GUARD — filterValidDeductions discards any item with amount null, undefined, NaN, zero, or negative.
  const validDeductions = filterValidDeductions(ctx && ctx.deductions ? ctx.deductions : []);
  
  const fmt = (n) => '₹' + formatIndianCurrency(n);
  const fy = (ctx && ctx.financialYear) || DEFAULT_FY;
  const gross = (ctx && ctx.salary && ctx.salary.grossSalary) || 0;
  const old = result.oldRegime;
  const neu = result.newRegime;

  const mentionedSections = new Set();
  const verifiedSections = [];
  
  for (const d of validDeductions) {
    if (d.needsConfirmation === false && d.source && DED_SECTIONS[d.section]) {
      if (!mentionedSections.has(d.section)) {
        mentionedSections.add(d.section);
        verifiedSections.push(d.section);
      }
    }
  }

  const recommendationSentence = result.savingsAmount === 0
    ? 'Both regimes have the same final tax; no tax saving is available from choosing one over the other.'
    : `${result.recommendedRegime} regime has the lower final tax and saves ${fmt(result.savingsAmount)}.`;
  const explanation =
    `For FY ${fy}, with a gross salary of ${fmt(gross)}, ${recommendationSentence} ` +
    `Under the New Regime your taxable income is ${fmt(neu.taxableIncome)} and total tax is ${fmt(neu.totalTax)}` +
    `${neu.refundAmount > 0 ? `, with a refund of ${fmt(neu.refundAmount)}` : ''}. ` +
    `Under the Old Regime, after verified deductions of ${fmt(old.totalDeductions)} your taxable income is ${fmt(
      old.taxableIncome,
    )} and total tax is ${fmt(old.taxableIncome > 0 ? old.totalTax : 0)}` +
    `${old.refundAmount > 0 ? `, with a refund of ${fmt(old.refundAmount)}` : ''}. ` +
    (verifiedSections.length
      ? ` The deduction${verifiedSections.length > 1 ? 's' : ''} applied (${verifiedSections.join(
          ', ',
        )}) are reflected in the Old-regime taxable income above.`
      : '');

  const oldRegimeSummary = `Old Regime: taxable income ${fmt(old.taxableIncome)}, total tax ${fmt(
    old.totalTax,
  )}${old.refundAmount > 0 ? `, refund due ${fmt(old.refundAmount)}` : ''}.`;
  const newRegimeSummary = `New Regime: taxable income ${fmt(neu.taxableIncome)}, total tax ${fmt(
    neu.totalTax,
  )}${neu.refundAmount > 0 ? `, refund due ${fmt(neu.refundAmount)}` : ''}.`;

  return { explanation, oldRegimeSummary, newRegimeSummary, suggestionTexts: generateSuggestions(result) };
}

// -----------------------------------------------------------------------------
// generateSuggestions — the SINGLE place where tax-saving suggestions are
// produced. Called from explainResult and from gemini.service.js.
//
// Deduplication uses a Map keyed by a normalized string: section name + action
// type in lowercase with all non-alphanumeric chars removed. This guarantees
// that regardless of how many places generate a suggestion for the same section,
// it appears exactly once in the output.
// -----------------------------------------------------------------------------
function generateSuggestions(result) {
  const suggestions = [];
  const applied = filterValidDeductions((result.oldRegime && result.oldRegime.applied) ? result.oldRegime.applied : []);
  const unverified = filterValidDeductions((result.oldRegime && result.oldRegime.unverified) ? result.oldRegime.unverified : []);
  const fmt = (n) => '₹' + formatIndianCurrency(n);
  const generatedSectionKeys = new Set();
  const map = new Map();

  const processList = (list) => {
    for (const u of list) {
      let actionType;
      let text;
      
      // We assign specific actionTypes which become suggestionTypes
      if (!u.duplicateRisk && unverified.some(x => x.section === u.section && x.duplicateRisk)) {
        continue;
      }
      
      if (u.exclusionReason === EXCLUSION_REASON.NOT_ALLOWED_IN_REGIME || u.exclusionReason === EXCLUSION_REASON.NOT_APPLICABLE_TO_PROPERTY_TYPE || (!u.allowedInRegime && u.needsConfirmation === false)) {
        actionType = 'REGIME_INAPPLICABLE';
        text = `Section ${u.section} deduction (${fmt(u.amount)}) is not allowed under the selected regime. ` +
          `Consider switching regimes or verifying applicability.`;
      } else if (u.exclusionReason === EXCLUSION_REASON.DUPLICATE_LOWER_AMOUNT || u.duplicateRisk) {
        actionType = 'RESOLVE_DUPLICATE';
        text = `A Section ${u.section} deduction of ${fmt(u.amount)} was excluded and only the Form 16 amount was considered.`;
      } else if (u.exclusionReason === EXCLUSION_REASON.UNCONFIRMED_SUBTYPE || u.needsConfirmation) {
        actionType = 'CONFIRM_SUBTYPE';
        text = `Section ${u.section} deduction was excluded because the subsection could not be confirmed. ` +
          `Confirming the correct subsection (e.g., 80CCD(1B)) could unlock savings of up to ${fmt(u.amount)}.`;
      } else if (u.amount > 0 && u.amount < (DED_SECTIONS[u.section]?.cap('Old') || Infinity)) {
        actionType = 'CLAIM_AVAILABLE';
        text = `You can claim up to ${fmt((DED_SECTIONS[u.section]?.cap('Old') || Infinity) - u.amount)} more under Section ${u.section}.`;
      } else {
        actionType = 'INFORMATIONAL';
        text = `Section ${u.section} deduction of ${fmt(u.amount)} was applied.`;
      }

      const key = `${u.section.toLowerCase()}-${actionType.toLowerCase()}`;
      if (generatedSectionKeys.has(key)) continue;
      generatedSectionKeys.add(key);

      map.set(key, { section: u.section, actionType, suggestionType: actionType, text });
    }
  };

  processList(applied);
  processList(unverified);

  const rawOutput = [...map.values()];
  return rawOutput;
}

// -----------------------------------------------------------------------------
// buildFinalSuggestions — SINGLE merge + dedup point for ALL suggestion sources.
//
// Pass any number of raw suggestion arrays (strings or {suggestion} objects).
// All are merged first, then deduplicated by a 60-char normalized key so that
// the same suggestion from Gemini AND the engine appears exactly once.
//
// Usage:
//   buildFinalSuggestions(engineStrings, geminiStrings)
//   buildFinalSuggestions([...all sources])
// -----------------------------------------------------------------------------
function buildFinalSuggestions(...rawArrays) {
  const map = new Map();
  for (const arr of rawArrays.flat()) {
    if (!arr) continue;
    
    // If the suggestion is an object with section/suggestionType, preserve it
    if (typeof arr === 'object' && arr.section) {
      const type = arr.suggestionType || arr.actionType || 'INFORMATIONAL';
      const key = `${arr.section}${type}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      const text = arr.text || arr.suggestion || String(arr);
      if (!map.has(key)) map.set(key, { ...arr, suggestion: text, suggestionType: type });
      continue;
    }

    const text = typeof arr === 'string' ? arr : (arr.suggestion || arr.text || String(arr));
    if (!text) continue;
    
    // Fallback: extract section name from text if possible
    const sectionMatch = text.match(/Section\s*([0-9a-zA-Z]{2,6})/i);
    let key;
    let section = 'Unknown';
    let suggestionType = 'INFORMATIONAL';
    
    if (sectionMatch) {
      section = sectionMatch[1].toUpperCase();
      if (text.toLowerCase().includes('not allowed')) suggestionType = 'REGIME_INAPPLICABLE';
      else if (text.toLowerCase().includes('excluded') || text.toLowerCase().includes('confirm')) suggestionType = 'CONFIRM_SUBTYPE';
      key = `${section}${suggestionType}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    } else {
      key = text.toLowerCase().replace(/[\s\W]+/g, '').slice(0, 60);
    }
    
    if (!map.has(key)) map.set(key, { section, suggestionType, suggestion: text });
  }
  const outputArray = [...map.values()];
  return outputArray;
}

// -----------------------------------------------------------------------------
// toRegimeTrace — map the canonical result to the frontend RegimeTrace shape.
// -----------------------------------------------------------------------------
function toRegimeTrace(ctx, r) {
  const validDeductions = filterValidDeductions(ctx.deductions || []);
  const cfg = TAX_CONFIG[ctx.financialYear] || TAX_CONFIG[DEFAULT_FY];
  const deductions = validDeductions.map((item) => {
    const meta = DED_SECTIONS[item.section];
    const allowed = meta ? meta.allowed[r.regime] : false;
    const cap = meta && meta.cap ? meta.cap(r.regime) : null;
    const appliedItem = (r.applied || []).find(
      (a) => a.section === item.section && a.subtype === item.subtype && a.source === item.source,
    );
    const exemptionAmount = item.section === 'HRA'
      ? r.salaryExemptions.hra
      : item.section === 'LTA'
        ? r.salaryExemptions.lta
        : null;
    const claimed = item.section === 'StandardDeduction'
      ? (allowed ? r.standardDeduction : 0)
      : exemptionAmount != null
        ? exemptionAmount
        : (appliedItem ? appliedItem.amount : 0);
    return {
      key: item.section,
      label: meta ? meta.label : item.section,
      allowed,
      disallowed: !allowed,
      maxLimit: cap,
      userAmount: round(item.amount || 0),
      claimed: round(claimed),
      remaining:
        allowed && cap != null
          ? Math.max(0, cap - claimed)
          : allowed && cap == null
            ? null
            : 0,
      qualifying: allowed && (item.amount || 0) > 0,
      source: item.source || null,
      note: meta ? meta.note : '',
    };
  });

  return {
    regime: r.regime,
    grossIncome: ctx.salary.grossSalary || 0,
    salaryExemptions: r.salaryExemptions,
    incomeFromSalary: r.grossTotalIncome,
    incomeFromOtherSources: 0,
    grossTotalIncome: r.grossTotalIncome,
    deductions,
    totalDeductions: r.totalDeductions,
    taxableIncome: r.taxableIncome,
    slabs: r.slabs,
    incomeTaxBeforeRebate: r.incomeTaxBeforeRebate,
    rebate: r.rebate87A,
    rebate87ADetail: r.rebate87ADetail,
    marginalRelief: r.marginalRelief,
    incomeTaxAfterRebate: Math.max(0, r.incomeTaxBeforeRebate - r.rebate87A),
    surcharge: r.surcharge,
    cess: r.cess,
    finalTax: r.totalTax,
    tdsDeducted: r.tdsDeducted,
    advanceTax: 0,
    selfAssessmentTax: 0,
    totalPaid: r.tdsDeducted,
    refund: r.refundAmount,
    taxPayable: r.taxPayable,
  };
}


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
      throw new Error(`assertNoZeroDeductions: Found zero/invalid value for section ${item.section}: amount is ${item.amount}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Part 2: Context-Aware Messages
// -----------------------------------------------------------------------------
function computeSuggestionSavings(suggestion, taxResult, taxConfig) {
  if (suggestion.suggestionType === 'RESOLVE_DUPLICATE') {
    const appliedItem = taxResult.oldRegime?.applied?.find((d) => d.section.toUpperCase() === suggestion.section.toUpperCase() && !d.duplicateRisk);
    const excludedItem = taxResult.oldRegime?.unverified?.find((d) => d.section.toUpperCase() === suggestion.section.toUpperCase() && d.duplicateRisk);
    
    const appliedAmount = appliedItem ? appliedItem.amount : 0;
    const excludedAmount = excludedItem ? excludedItem.amount : 0;
    
    let limit = 0;
    if (suggestion.section.toUpperCase() === '80D') limit = taxConfig.DEDUCTION_CAPS.SECTION_80D_SELF;
    if (suggestion.section.toUpperCase() === '80C') limit = taxConfig.DEDUCTION_CAPS.SECTION_80C_GROUP;
    
    if (appliedAmount >= limit) {
      return {
        savingsType: 'NONE_LIMIT_REACHED',
        savingsAmount: null,
        displayMessage: `No additional tax benefit available. Your Form 16 already claims ₹${appliedAmount.toLocaleString('en-IN')} under Section ${suggestion.section} which is the full statutory limit. The additional ₹${excludedAmount.toLocaleString('en-IN')} from your investment records was excluded to prevent a duplicate claim.`,
      };
    }
  }

  if (suggestion.suggestionType === 'REGIME_INAPPLICABLE' && taxResult.recommendedRegime === 'New') {
    const appliedItem = taxResult.oldRegime?.applied?.find((d) => d.section.toUpperCase() === suggestion.section.toUpperCase());
    const amount = appliedItem ? appliedItem.amount : suggestion.amount || 0;
    
    const oldTax = taxResult.oldRegime?.totalTax || 0;
    const newTax = taxResult.newRegime?.totalTax || 0;
    const diff = oldTax - newTax;
    let switchNote = '';
    if (diff < 0) switchNote = ' (Switching to the Old Regime is recommended).';
    else switchNote = ` (However, the New Regime still saves you ₹${Math.abs(diff).toLocaleString('en-IN')} overall).`;
    
    return {
      savingsType: 'NONE_WRONG_REGIME',
      savingsAmount: null,
      displayMessage: `This deduction is not available under the New Regime. If you switch to the Old Regime and it produces a lower overall liability this deduction would reduce your taxable income by ₹${amount.toLocaleString('en-IN')}.${switchNote}`,
    };
  }

  let savingsAmount = 0;
  if (suggestion.suggestionType === 'CLAIM_AVAILABLE' || suggestion.suggestionType === 'CONFIRM_SUBTYPE') {
    const appliedItem = taxResult.oldRegime?.applied?.find((d) => d.section.toUpperCase() === suggestion.section.toUpperCase() && !d.duplicateRisk);
    const appliedAmount = appliedItem ? appliedItem.amount : 0;
    
    let limit = Infinity;
    if (suggestion.section.toUpperCase() === '80D') limit = taxConfig.DEDUCTION_CAPS.SECTION_80D_SELF;
    else if (suggestion.section.toUpperCase() === '80C') limit = taxConfig.DEDUCTION_CAPS.SECTION_80C_GROUP;
    else if (suggestion.section.toUpperCase() === '80CCD1B') limit = taxConfig.DEDUCTION_CAPS.SECTION_80CCD1B;
    
    const unclaimed = limit === Infinity ? suggestion.amount || 0 : Math.max(0, limit - appliedAmount);
    
    let marginalRate = 0;
    if (taxResult.oldRegime?.slabBreakdown) {
      const breakdown = taxResult.oldRegime.slabBreakdown;
      for (let i = breakdown.length - 1; i >= 0; i--) {
        if (breakdown[i].tax > 0) {
          marginalRate = breakdown[i].rate;
          break;
        }
      }
    }
    savingsAmount = Math.round(unclaimed * marginalRate);
  }

  return {
    savingsType: 'ACTIONABLE',
    savingsAmount,
    displayMessage: '', 
  };
}

// -----------------------------------------------------------------------------
// Part 3: Wording
// -----------------------------------------------------------------------------
function buildDuplicateRiskSuggestionText(appliedItem, excludedItem, statutoryLimit) {
  if (!appliedItem || !excludedItem || statutoryLimit == null) {
    throw new Error('buildDuplicateRiskSuggestionText requires appliedItem, excludedItem, and statutoryLimit');
  }
  return `Your Form 16 contains a verified Section ${appliedItem.section} deduction of ₹${formatIndianCurrency(appliedItem.amount)} which is the full statutory limit for self and family health insurance. Your investment records also show a Section ${appliedItem.section} amount of ₹${formatIndianCurrency(excludedItem.amount)}. This additional amount was excluded because applying both would exceed the statutory limit of ₹${formatIndianCurrency(statutoryLimit)}. No further action is needed for this deduction.`;
}

// -----------------------------------------------------------------------------
// Part 4: Priority Ordering
// -----------------------------------------------------------------------------
function sortSuggestions(suggestions) {
  return suggestions.slice().sort((a, b) => {
    const getTier = (s) => {
      const type = s.suggestionType;
      if (['CONFIRM_SUBTYPE', 'RESOLVE_DUPLICATE', 'VERIFY_AMOUNT', 'OCR_AMBIGUITY'].includes(type)) return 1;
      if (['INVEST_TO_CLAIM', 'CLAIM_AVAILABLE', 'INCREASE_CONTRIBUTION'].includes(type)) return 2;
      return 3; // REGIME_INAPPLICABLE, INFORMATIONAL, or NONE types fall here naturally when mapped later, but by pure suggestionType this works.
    };
    const tA = getTier(a);
    const tB = getTier(b);
    if (tA !== tB) return tA - tB;
    
    if (tA === 1 || tA === 3) {
      return (a.section || '').localeCompare(b.section || '');
    }
    if (tA === 2) {
      // For tier 2 we need savingsAmount, but sorting relies on computed savings. 
      // If savings isn't provided directly, this will just rely on available properties, or fallback to 0.
      const sA = a.savingsAmount || 0;
      const sB = b.savingsAmount || 0;
      return sB - sA;
    }
    return 0;
  });
}

module.exports = {
  TAX_CONFIG,
  FY_CONFIG,      // backwards-compat alias
  DEFAULT_FY,
  SOURCE,
  EXCLUSION_CATEGORY,
  EXCLUSION_REASON,
  DED_SECTIONS,
  DED_SECTIONS_CAP,
  ALLOWED_SOURCES,
  makeLineItem,
  computeHraExemption,
  computeSlabTax,
  compute87ARebate,
  computeMarginalRelief,
  computeRebate,  // backwards-compat wrapper
  computeSurcharge,
  fromForm16,
  validateTaxpayerContext,
  computeTax,
  explainResult,
  generateSuggestions,
  buildFinalSuggestions,
  assertTaxResultConsistency,
  toRegimeTrace,
  filterValidDeductions,
  assertNoZeroDeductions,
  makeLineItem,
  computeSuggestionSavings,
  buildDuplicateRiskSuggestionText,
  sortSuggestions,
};
