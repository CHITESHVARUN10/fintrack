const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    familyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyAccount' },
    inviteToken: { type: String },
    inviteExpiry: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
