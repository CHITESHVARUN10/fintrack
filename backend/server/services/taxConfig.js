// =============================================================================
// taxConfig.js — Single canonical source of ALL FY 2025-26 tax constants.
//
// Rule: No file in this repo may hardcode a tax number (slab boundary, rate,
// rebate threshold, deduction cap, cess rate, surcharge rate). Every constant
// must be read from TAX_CONFIG[financialYear].
//
// Source: Finance Act 2025 (AY 2026-27, FY 2025-26).
// =============================================================================

const TAX_CONFIG = {
  '2025-26': {
    // ----- Slab structure ---------------------------------------------------
    // Each slab: { lowerBound, upperBound (Infinity for top band), rate (0-1) }
    NEW_REGIME_SLABS: [
      { lowerBound: 0,       upperBound: 400000,   rate: 0.00 },
      { lowerBound: 400001,  upperBound: 800000,   rate: 0.05 },
      { lowerBound: 800001,  upperBound: 1200000,  rate: 0.10 },
      { lowerBound: 1200001, upperBound: 1600000,  rate: 0.15 },
      { lowerBound: 1600001, upperBound: 2000000,  rate: 0.20 },
      { lowerBound: 2000001, upperBound: 2400000,  rate: 0.25 },
      { lowerBound: 2400001, upperBound: Infinity,  rate: 0.30 },
    ],
    OLD_REGIME_SLABS: [
      { lowerBound: 0,       upperBound: 250000,   rate: 0.00 },
      { lowerBound: 250001,  upperBound: 500000,   rate: 0.05 },
      { lowerBound: 500001,  upperBound: 1000000,  rate: 0.20 },
      { lowerBound: 1000001, upperBound: Infinity,  rate: 0.30 },
    ],

    // Legacy parallel arrays (used by tax.service.js computeSlabTax which
    // iterates via cumulative upper bounds). Kept in sync with *_SLABS above.
    SLAB_BOUNDS: {
      Old: [250000, 500000, 1000000, Infinity],
      New: [400000, 800000, 1200000, 1600000, 2000000, 2400000, Infinity],
    },
    SLAB_RATES: {
      Old: [0, 0.05, 0.20, 0.30],
      New: [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30],
    },

    // ----- Standard deduction (salaried) ------------------------------------
    STANDARD_DEDUCTION: {
      Old: 50000,
      New: 75000,
    },

    // ----- Section 87A rebate -----------------------------------------------
    // New regime: full rebate up to ₹60,000 when taxable income ≤ ₹12,00,000.
    // Old regime: full rebate up to ₹12,500 when taxable income ≤ ₹5,00,000.
    REBATE: {
      Old: { threshold: 500000,  max: 12500 },
      New: { threshold: 1200000, max: 60000 },
    },

    // ----- Marginal relief (Section 87A cliff) ------------------------------
    // Applies under New regime when taxable income is just above ₹12L, so the
    // additional tax burden never exceeds the income above ₹12L.
    MARGINAL_RELIEF: {
      applicable: true,
      newRegimeThreshold: 1200000,
    },

    // ----- Surcharge on income tax ------------------------------------------
    // Applied on the income-tax amount (after rebate) for high-income taxpayers.
    // `rate: null` at the top tier is resolved per regime (see NEW_SURCHARGE_CAP).
    SURCHARGE_TIERS: [
      { limit: 5000000,  rate: 0.00 },   // ≤ ₹50L  → nil
      { limit: 10000000, rate: 0.10 },   // > ₹50L  – ₹1Cr → 10%
      { limit: 20000000, rate: 0.15 },   // > ₹1Cr  – ₹2Cr → 15%
      { limit: 50000000, rate: 0.25 },   // > ₹2Cr  – ₹5Cr → 25%
      { limit: Infinity, rate: null  },  // > ₹5Cr  → 37% Old / 25% New (capped)
    ],
    NEW_SURCHARGE_CAP: 0.25,   // New regime: surcharge never exceeds 25%
    OLD_SURCHARGE_TOP: 0.37,   // Old regime: top surcharge 37%

    // ----- Health & Education Cess ------------------------------------------
    CESS: 0.04,  // 4% on (income tax + surcharge)

    // ----- Deduction statutory caps -----------------------------------------
    DEDUCTION_CAPS: {
      SECTION_80C_GROUP:  150000,  // 80C + 80CCC + 80CCD(1) combined
      SECTION_80CCD1B:     50000,  // Additional NPS — own contribution
      SECTION_80D_SELF:    25000,  // Health insurance — self & family
      SECTION_80D_PARENTS: 50000,  // Health insurance — parents (senior citizen)
      SECTION_24B:        200000,  // Home loan interest (self-occupied)
      SECTION_80E:           null, // No cap — education loan interest
      SECTION_80G:           null, // Variable (50% / 100% based on fund)
    },
  },
};

const DEFAULT_FY = '2025-26';

module.exports = { TAX_CONFIG, DEFAULT_FY };
