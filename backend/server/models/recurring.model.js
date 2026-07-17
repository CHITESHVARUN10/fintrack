const mongoose = require('mongoose');

const recurringPaymentSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    title: { type: String },
    category: {
      type: String,
      enum: ['Household', 'Utility', 'Staff', 'Society', 'Vehicle', 'Other'],
    },
    amount: { type: Number },
    dueDate: { type: Number },
    paymentMethod: { type: String },
    startDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true },
);

recurringPaymentSchema.index({ memberId: 1 });
recurringPaymentSchema.index({ familyAccountId: 1 });
recurringPaymentSchema.index({ dueDate: 1 });

module.exports = mongoose.model('RecurringPayment', recurringPaymentSchema);
