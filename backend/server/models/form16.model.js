const mongoose = require('mongoose');
const { hookStaleByForm16 } = require('../utils/taxStale');

const form16Schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    financialYear: { type: String },
    employeeName: { type: String },
    employeePAN: { type: String },
    employeeDesignation: { type: String },
    employeeCode: { type: String },
    employeeAddress: { type: String },
    employerName: { type: String },
    employerTAN: { type: String },
    employerPAN: { type: String },
    employerAddress: { type: String },
    basicSalary: { type: Number },
    hra: { type: Number },
    rentPaid: { type: Number },
    specialAllowance: { type: Number },
    lta: { type: Number },
    otherAllowances: { type: Number },
    grossSalary: { type: Number },
    standardDeduction: { type: Number },
    professionalTax: { type: Number },
    section80C: { type: Number },
    section80D: { type: Number },
    section80E: { type: Number },
    section80G: { type: Number },
    section80CCD: { type: Number },
    totalDeductions: { type: Number },
    taxableIncome: { type: Number },
    taxOnIncome: { type: Number },
    rebate87A: { type: Number },
    educationCess: { type: Number },
    totalTaxPayable: { type: Number },
    tdsDeducted: { type: Number },
    taxRegimeUsed: { type: String, enum: ['Old', 'New'] },
    sourceType: { type: String, enum: ['PDF', 'Manual', 'Duplicate'], default: 'PDF' },
    originalForm16Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Form16', default: null },
    pdfReference: { type: String, default: null },
    isEdited: { type: Boolean, default: false },
    // Canonical TaxpayerContext (Part 1) — the single source of truth for all
    // tax data. Any PUT to this doc updates these fields and the stale hook
    // marks the linked TaxRecommendation isStale.
    taxpayerContext: { type: mongoose.Schema.Types.Mixed },
    // Part 1 / Final 3%: Finalization lock. Set to true when the user clicks
    // "Save and Continue" on the Review page. Once true, computeTax in the
    // recommendation flow reads deductions exclusively from finalizedDeductions
    // and NEVER re-fetches or re-merges from investment records.
    isFinalized: { type: Boolean, default: false },
    // Part 1 / Final 3%: The complete, user-approved DeductionLineItem array
    // built by the /deductions-preview endpoint (Form16 OCR + Investment Records
    // + User Manual). Stored so what the user saw on Review equals what
    // computeTax uses — guaranteed immutable after finalization.
    finalizedDeductions: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

form16Schema.index({ userId: 1 });

hookStaleByForm16(form16Schema);

module.exports = mongoose.model('Form16', form16Schema);
