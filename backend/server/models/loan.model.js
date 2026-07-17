const mongoose = require('mongoose');
const { hookStaleByUser } = require('../utils/taxStale');

const emiLoanSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    loanName: { type: String },
    loanType: {
      type: String,
      enum: ['Home', 'Car', 'Personal', 'Education', 'Gold', 'Other'],
    },
    lender: { type: String },
    principalAmount: { type: Number },
    outstandingAmount: { type: Number },
    emiAmount: { type: Number },
    emiDate: { type: Number },
    interestRate: { type: Number },
    tenureMonths: { type: Number },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['Active', 'Closed', 'Prepaid'] },
    notes: { type: String },
  },
  { timestamps: true },
);

emiLoanSchema.index({ memberId: 1 });
emiLoanSchema.index({ familyAccountId: 1 });
emiLoanSchema.index({ emiDate: 1 });

hookStaleByUser(emiLoanSchema);

module.exports = mongoose.model('EMILoan', emiLoanSchema);
