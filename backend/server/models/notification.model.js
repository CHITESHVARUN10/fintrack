const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount' },
    type: { type: String },
    message: { type: String },
    relatedModule: { type: String },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    channel: [{ type: String }],
  },
  { timestamps: true },
);

notificationSchema.index({ memberId: 1 });
notificationSchema.index({ familyAccountId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
