const mongoose = require('mongoose');

const familyAccountSchema = new mongoose.Schema(
  {
    name: { type: String },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    inviteCode: { type: String, unique: true, sparse: true, index: true },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

familyAccountSchema.index({ adminId: 1 });
familyAccountSchema.index({ inviteCode: 1 });

module.exports = mongoose.model('FamilyAccount', familyAccountSchema);
