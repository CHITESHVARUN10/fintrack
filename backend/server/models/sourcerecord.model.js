const mongoose = require('mongoose');

const sourceRecordSchema = new mongoose.Schema(
  {
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    source: { type: String, enum: ['MANUAL','BANK_STATEMENT','SCREENSHOT','SHARE','TELEGRAM','WHATSAPP'], required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
    parsedFields: { type: mongoose.Schema.Types.Mixed },
    fileRef: { type: String },
    batchId: { type: String },
    upiId: { type: String },
    transactionIdExt: { type: String },
    utr: { type: String },
    extractedAt: { type: Date, default: Date.now },
    confidence: { type: Number },
    fingerprint: { type: String },
  },
  { timestamps: true },
);

sourceRecordSchema.index({ transactionId: 1 });
sourceRecordSchema.index({ familyId: 1, source: 1 });
sourceRecordSchema.index({ batchId: 1 });
sourceRecordSchema.index({ utr: 1 });
sourceRecordSchema.index({ transactionIdExt: 1 });
sourceRecordSchema.index({ fingerprint: 1 });

module.exports = mongoose.model('SourceRecord', sourceRecordSchema);
