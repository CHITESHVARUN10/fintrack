const mongoose = require('mongoose');

// A member opts a single calendar month into family visibility. Missing or
// `shared: false` means the month's transactions are only visible to their
// creator, even when individual transactions keep visibility "FAMILY".
const monthShareSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    shared: { type: Boolean, default: false },
  },
  { timestamps: true },
);

monthShareSchema.index({ userId: 1, familyId: 1, month: 1 }, { unique: true });
monthShareSchema.index({ familyId: 1, shared: 1, month: 1 });

module.exports = mongoose.model('MonthShare', monthShareSchema);
