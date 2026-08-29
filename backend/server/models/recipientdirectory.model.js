const mongoose = require('mongoose');

const recipientDirectorySchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    vendorKey: { type: String, required: true },
    upiId: { type: String, sparse: true },
    label: { type: String, required: true },
    category: { type: String },
    hits: { type: Number, default: 1 },
    lastSeen: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

recipientDirectorySchema.index({ familyId: 1, vendorKey: 1 }, { unique: true });
recipientDirectorySchema.index({ familyId: 1, upiId: 1 }, { unique: true, sparse: true });
recipientDirectorySchema.index({ familyId: 1, category: 1 });

module.exports = mongoose.model('RecipientDirectory', recipientDirectorySchema);
