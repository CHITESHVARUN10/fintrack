const mongoose = require('mongoose');

const offeringSchema = new mongoose.Schema(
  {
    category: String,
    subcategories: { type: [String], default: [] },
    hits: { type: Number, default: 1 },
    lastSeen: Date,
  },
  { _id: false },
);

const vendorProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: String,
    subcategory: String,
    typicalAmountPaise: Number,
    unit: String,
    hits: { type: Number, default: 1 },
    lastSeen: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const priceMapSchema = new mongoose.Schema(
  { amountPaise: Number, productRef: { type: mongoose.Schema.Types.ObjectId }, hits: { type: Number, default: 1 }, lastSeen: Date },
  { _id: false },
);

const recipientDirectorySchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount', required: true },
    vendorKey: { type: String, required: true },
    upiId: { type: String, sparse: true },
    label: { type: String, required: true },
    category: { type: String },
    primaryCategory: { type: String },
    offerings: [offeringSchema],
    products: [vendorProductSchema],
    priceMap: [priceMapSchema],
    description: String,
    aliases: { type: [String], default: [] },
    contact: {
      phone: String,
      email: String,
      address: String,
      preferredMode: { type: String, enum: ['UPI', 'BANK', 'CASH', 'CARD', 'OTHER'] },
    },
    notes: String,
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    hits: { type: Number, default: 1 },
    lastSeen: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

recipientDirectorySchema.index({ familyId: 1, vendorKey: 1 }, { unique: true });
recipientDirectorySchema.index(
  { familyId: 1, upiId: 1 },
  { unique: true, partialFilterExpression: { upiId: { $exists: true, $type: 'string' } } },
);
recipientDirectorySchema.index({ familyId: 1, category: 1 });
recipientDirectorySchema.index({ familyId: 1, primaryCategory: 1 });
recipientDirectorySchema.index({ familyId: 1, status: 1 });
recipientDirectorySchema.index({ familyId: 1, 'products.name': 1 });
recipientDirectorySchema.index({ familyId: 1, aliases: 1 });

module.exports = mongoose.model('RecipientDirectory', recipientDirectorySchema);
