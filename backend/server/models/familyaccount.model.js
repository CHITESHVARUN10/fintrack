const mongoose = require('mongoose');

const familyAccountSchema = new mongoose.Schema(
  {
    name: { type: String },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

familyAccountSchema.index({ adminId: 1 });

module.exports = mongoose.model('FamilyAccount', familyAccountSchema);
