const mongoose = require('mongoose');

const taxSavingSuggestionSchema = new mongoose.Schema(
  {
    suggestion: { type: String },
    potentialSaving: { type: Number },
  },
  { _id: false },
);

// Static, plain-English description of a claimed deduction section. The text is
// authored in code (never by AI) so the user understands each item.
const deductionItemSchema = new mongoose.Schema(
  {
    section: { type: String },
    label: { type: String },
    amount: { type: Number },
    note: { type: String },
  },
  { _id: false },
);

const taxRecommendationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    form16Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Form16' },
    oldRegimeTax: { type: Number },
    newRegimeTax: { type: Number },
    recommendedRegime: { type: String, enum: ['Old', 'New'] },
    savingsAmount: { type: Number },
    explanation: { type: String },
    taxSavingSuggestions: [taxSavingSuggestionSchema],
    // Full FY 2025-26 computation trace for BOTH regimes (each a complete
    // waterfall: exemptions → GTI → deductions → taxable → slabs → rebate →
    // surcharge → cess → final → TDS → refund/payable). Stored so the saved
    // view renders identically later.
    regimes: { type: mongoose.Schema.Types.Mixed },
    // Snapshot of the inputs used so the saved recommendation renders
    // consistently later (gross used and the plain-English deduction breakdown).
    grossSalaryUsed: { type: Number },
    totalDeductions: { type: Number },
    deductionBreakdown: [deductionItemSchema],
    // Audit fields: flag a Gross-Salary vs component-sum mismatch and carry the
    // full machine-readable calculation trace for verification.
    grossSalaryMismatch: { type: Boolean },
    mismatchDetail: { type: String },
    debug: { type: mongoose.Schema.Types.Mixed },
    // Per-deduction provenance (Part 2) and the full step-by-step audit
    // trace (Part 9) for the saved recommendation.
    deductionLineItems: { type: [mongoose.Schema.Types.Mixed] },
    calculationTrace: { type: [mongoose.Schema.Types.Mixed] },
    generatedAt: { type: Date },
    isStale: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taxRecommendationSchema.index({ userId: 1 });
taxRecommendationSchema.index({ form16Id: 1 });

module.exports = mongoose.model('TaxRecommendation', taxRecommendationSchema);
