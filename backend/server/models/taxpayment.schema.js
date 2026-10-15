const mongoose = require('mongoose');
// Explicit amounts paid in a selected FY, distinct from portfolio value or a
// scheduled premium/EMI. Eligibility is reviewed by the canonical tax engine.
module.exports = new mongoose.Schema({
  financialYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  section: { type: String, required: true, enum: ['80C', '80CCD', '80D', '80E', '80G', '24b'] },
  amount: { type: Number, required: true, min: 0.01, max: Number.MAX_SAFE_INTEGER, validate: Number.isFinite },
}, { _id: false });
