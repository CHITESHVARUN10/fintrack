const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['EXPENSE','INCOME','INTERNAL_TRANSFER','CASH_WITHDRAWAL','CASH_EXPENSE'], required: true },
    mode: { type: String, enum: ['UPI','BANK','CASH','CARD','OTHER'], default: 'OTHER' },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    occurredAt: { type: Date, required: true },
    category: { type: String },
    subcategory: { type: String },
    productName: { type: String },
    productRef: { type: mongoose.Schema.Types.ObjectId },
    categorySplit: [{ category: String, amountPaise: Number }],
    lineItems: [
      {
        productRef: { type: mongoose.Schema.Types.ObjectId },
        productName: String,
        category: String,
        subcategory: String,
        quantity: Number,
        unit: String,
        amountPaise: Number,
      },
    ],
    recipientVendorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'RecipientDirectory' },
    sender: { name: String, upiId: String, accountRef: String },
    recipient: { name: String, upiId: String, accountRef: String },
    familyTransfer: { fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } },
    cashLeg: { from: { type: String, enum: ['BANK','CASH'] }, to: { type: String, enum: ['BANK','CASH'] } },
    visibility: { type: String, enum: ['FAMILY','PRIVATE'], default: 'FAMILY' },
    status: { type: String, enum: ['ACTIVE','PENDING_REVIEW','RECONCILED','VOIDED'], default: 'ACTIVE' },
    confidence: { type: Number },
    sourceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SourceRecord' }],
    mergedFrom: [{ type: mongoose.Schema.Types.ObjectId }],
    metadata: { type: mongoose.Schema.Types.Mixed },
    candidateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    batchId: { type: String },
    fingerprint: { type: String },
  },
  { timestamps: true },
);

transactionSchema.index({ familyId: 1, occurredAt: -1 });
transactionSchema.index({ createdBy: 1, occurredAt: -1 });
transactionSchema.index({ familyId: 1, type: 1 });
transactionSchema.index({ familyId: 1, category: 1 });
transactionSchema.index({ familyId: 1, subcategory: 1 });
transactionSchema.index({ familyId: 1, recipientVendorRef: 1, occurredAt: -1 });
transactionSchema.index({ amountPaise: 1, occurredAt: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ batchId: 1 });
transactionSchema.index({ fingerprint: 1 });
transactionSchema.index({ 'lineItems.productName': 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
