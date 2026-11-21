const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    name: { type: String },
    category: {
      type: String,
      enum: ['Entertainment', 'Productivity', 'Health', 'News', 'Gaming', 'Cloud Storage', 'Other'],
    },
    amount: { type: Number },
    // Each entry is a price and the date it took effect. `amount` above always
    // reflects the price in force today.
    priceHistory: [
      {
        _id: false,
        amount: { type: Number, required: true },
        effectiveFrom: { type: Date, required: true },
      },
    ],
    billingDate: { type: Number },
    frequency: { type: String, enum: ['monthly', 'yearly'] },
    startDate: { type: Date },
    endDate: { type: Date },
    renewalReminderDays: { type: Number, default: 30 },
    lastRenewalDate: { type: Date },
    nextRenewalDate: { type: Date },
    paymentMethod: { type: String },
    autoRenew: { type: Boolean },
    status: { type: String, enum: ['Active', 'Paused', 'Cancelled'], default: 'Active' },
    notes: { type: String },
  },
  { timestamps: true },
);

subscriptionSchema.index({ memberId: 1 });
subscriptionSchema.index({ familyAccountId: 1 });
subscriptionSchema.index({ billingDate: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
