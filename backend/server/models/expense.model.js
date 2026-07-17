const mongoose = require('mongoose');

const adHocExpenseSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    title: { type: String },
    category: {
      type: String,
      enum: ['Fuel', 'Travel', 'Maintenance', 'Medical', 'Shopping', 'Food', 'Other'],
    },
    amount: { type: Number },
    date: { type: Date },
    recurrenceHint: { type: String },
    tags: [{ type: String }],
    paymentMode: { type: String, enum: ['Cash', 'UPI', 'Card', 'Net Banking'] },
    splitWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    splitType: { type: String, enum: ['Equal', 'Custom'] },
    splitAmounts: { type: Map, of: Number },
    receipt: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

adHocExpenseSchema.index({ memberId: 1 });
adHocExpenseSchema.index({ familyAccountId: 1 });
adHocExpenseSchema.index({ date: 1 });

module.exports = mongoose.model('AdHocExpense', adHocExpenseSchema);
