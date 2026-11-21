const mongoose = require('mongoose');

const offsetSchema = new mongoose.Schema({
  familyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  transactionIds: { type: [mongoose.Schema.Types.ObjectId], required: true },
  purpose: { type: String, trim: true, required: true, maxlength: 120 },
}, { timestamps: true });

// A single write records both legs. Each transaction can belong to one pair.
offsetSchema.index({ transactionIds: 1 }, { unique: true });

module.exports = mongoose.model('TransactionOffset', offsetSchema);
