const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    title: { type: String },
    amount: { type: Number },
    creditDate: { type: Number, min: 1, max: 31 },
    category: {
      type: String,
      enum: ['Salary', 'Freelance', 'Rental', 'Business', 'Other'],
    },
    taxable: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true },
);

incomeSchema.index({ memberId: 1 });
incomeSchema.index({ familyAccountId: 1 });

module.exports = mongoose.model('Income', incomeSchema);
