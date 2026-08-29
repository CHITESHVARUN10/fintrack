const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    scope: { type: String, enum: ['FAMILY','CATEGORY','MEMBER'], required: true },
    category: { type: String },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    period: { type: String, enum: ['MONTHLY','WEEKLY','YEARLY'], default: 'MONTHLY' },
    amountPaise: { type: Number, required: true },
    spentPaise: { type: Number, default: 0 },
    periodKey: { type: String },
  },
  { timestamps: true },
);

budgetSchema.index({ familyId: 1, periodKey: 1 });

module.exports = mongoose.model('Budget', budgetSchema);
