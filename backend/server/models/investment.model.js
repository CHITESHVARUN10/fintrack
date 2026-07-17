const mongoose = require('mongoose');
const { hookStaleByUser } = require('../utils/taxStale');

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
    tenureMonths: { type: Number },
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
    notes: { type: String },
  },
  { timestamps: true },
);

investmentSchema.index({ memberId: 1 });
investmentSchema.index({ familyAccountId: 1 });
investmentSchema.index({ sipDate: 1 });
investmentSchema.index({ maturityDate: 1 });

hookStaleByUser(investmentSchema);

module.exports = mongoose.model('Investment', investmentSchema);
