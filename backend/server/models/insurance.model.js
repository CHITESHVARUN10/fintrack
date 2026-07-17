const mongoose = require('mongoose');
const { hookStaleByUser } = require('../utils/taxStale');

const insuranceSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    policyName: { type: String },
    insurer: { type: String },
    insuranceType: {
      type: String,
      enum: ['Life', 'Health', 'Vehicle', 'Term', 'Home', 'Other'],
    },
    premiumAmount: { type: Number },
    premiumFrequency: {
      type: String,
      enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'],
    },
    nextDueDate: { type: Date },
    startDate: { type: Date },
    endDate: { type: Date },
    sumAssured: { type: Number },
    nominee: { type: String },
    policyNumber: { type: String },
    status: { type: String, enum: ['Active', 'Lapsed', 'Matured', 'Claimed'] },
    tax80C: { type: Boolean },
    notes: { type: String },
  },
  { timestamps: true },
);

insuranceSchema.index({ memberId: 1 });
insuranceSchema.index({ familyAccountId: 1 });
insuranceSchema.index({ nextDueDate: 1 });

hookStaleByUser(insuranceSchema);

module.exports = mongoose.model('Insurance', insuranceSchema);
