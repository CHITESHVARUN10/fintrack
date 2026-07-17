const mongoose = require('mongoose');
const { hookStaleByUser } = require('../utils/taxStale');

const educationPaymentSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    title: { type: String },
    institution: { type: String },
    category: {
      type: String,
      enum: ['School', 'College', 'Coaching', 'Online Course', 'Other'],
    },
    amount: { type: Number },
    frequency: {
      type: String,
      enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-time'],
    },
    dueDate: { type: Date },
    startDate: { type: Date },
    endDate: { type: Date },
    forMember: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

educationPaymentSchema.index({ memberId: 1 });
educationPaymentSchema.index({ familyAccountId: 1 });
educationPaymentSchema.index({ dueDate: 1 });

hookStaleByUser(educationPaymentSchema);

module.exports = mongoose.model('EducationPayment', educationPaymentSchema);
