const mongoose = require('mongoose');

const importBatchSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    batchId: { type: String, required: true, unique: true },
    source: { type: String, enum: ['BANK_STATEMENT', 'SCREENSHOT'], required: true },
    fileName: { type: String },
    total: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    reconciled: { type: Number, default: 0 },
    pendingReview: { type: Number, default: 0 },
    deduped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    fileHash: { type: String, index: true },
    fileSize: { type: Number },
    rowHash: { type: String },
    periodFrom: { type: Date },
    periodTo: { type: Date },
    status: { type: String, enum: ['success', 'partial', 'failed'], default: 'success' },
  },
  { timestamps: true },
);

importBatchSchema.index({ familyId: 1, createdAt: -1 });
importBatchSchema.index({ batchId: 1 });
importBatchSchema.index({ familyId: 1, fileHash: 1 });

module.exports = mongoose.model('ImportBatch', importBatchSchema);
