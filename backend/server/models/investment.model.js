const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    investmentType: {
      type: String,
      enum: ['stock', 'mf_sip', 'fd', 'real_estate', 'other'],
    },
    // stock
    stockName: { type: String },
    ticker: { type: String },
    buyPrice: { type: Number },
    quantity: { type: Number },
    currentPrice: { type: Number },
    // mutual fund / SIP
    fundName: { type: String },
    fundHouse: { type: String },
    sipAmount: { type: Number },
    sipDate: { type: Number },
    units: { type: Number },
    nav: { type: Number },
    fundCategory: {
      type: String,
      enum: ['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Other'],
    },
    // fixed deposit
    bankName: { type: String },
    principalAmount: { type: Number },
    interestRate: { type: Number },
    tenureMonths: { type: Number, min: 0, max: 1200 },
    tenureDays: { type: Number, min: 0, max: 36500, validate: Number.isInteger },
    maturityAction: { type: String, enum: ['credit_account', 'renew_principal', 'renew_full'] },
    payoutAccount: { type: String, trim: true, maxlength: 80 },
    maturityDate: { type: Date },
    maturityAmount: { type: Number },
    interestType: { type: String, enum: ['Simple', 'Compound'] },
    taxableInterest: { type: Boolean },
    // real estate / other
    assetName: { type: String },
    assetType: {
      type: String,
      enum: ['Real Estate', 'Gold', 'PPF', 'NPS', 'Other'],
    },
    purchaseValue: { type: Number },
    purchaseDate: { type: Date },
    totalInvested: { type: Number },
    currentValue: { type: Number },
    // common
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['Active', 'Matured', 'Closed', 'Broken'] },
    taxPayments: { type: [require('./taxpayment.schema')], default: [] },
    notes: { type: String },
  },
  { timestamps: true },
);

// Existing deposits can keep their original terms until the owner edits them.
investmentSchema.pre('validate', function validateFixedDeposit() {
  if (this.investmentType !== 'fd' || !this.maturityAction) return;
  if (!this.startDate) this.invalidate('startDate', 'Enter the deposit opening date');
  if (!(this.principalAmount > 0)) this.invalidate('principalAmount', 'Enter a positive deposit amount');
  if (!(this.interestRate >= 0) || this.interestRate == null) this.invalidate('interestRate', 'Enter the annual interest rate');
  const months = this.tenureMonths || 0;
  const days = this.tenureDays || 0;
  if (!Number.isInteger(months) || months + days <= 0) {
    this.invalidate('tenureMonths', 'Enter the deposit term in whole months and days');
  }
  if (this.startDate && !this.maturityDate && months + days > 0) {
    const start = this.startDate;
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(start.getUTCDate(), lastDay) + days);
    this.maturityDate = end;
  }
  if (this.startDate && this.maturityDate && this.maturityDate <= this.startDate) {
    this.invalidate('maturityDate', 'Maturity must be after the opening date');
  }
});

investmentSchema.index({ memberId: 1 });
investmentSchema.index({ familyAccountId: 1 });
investmentSchema.index({ sipDate: 1 });
investmentSchema.index({ maturityDate: 1 });

module.exports = mongoose.model('Investment', investmentSchema);
