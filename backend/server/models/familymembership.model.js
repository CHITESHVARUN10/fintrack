const mongoose = require('mongoose');

const familyMembershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    role: { type: String, enum: ['ADMIN', 'MEMBER'], default: 'MEMBER' },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'REJECTED', 'REMOVED'],
      default: 'PENDING',
    },
    inviteCode: { type: String },
    requestedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    removedAt: { type: Date },
  },
  { timestamps: true },
);

familyMembershipSchema.index({ userId: 1, familyId: 1 });
familyMembershipSchema.index({ familyId: 1, status: 1 });
familyMembershipSchema.index({ inviteCode: 1 });

module.exports = mongoose.model('FamilyMembership', familyMembershipSchema);
