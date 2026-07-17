const mongoose = require('mongoose');

const taxSavingSuggestionSchema = new mongoose.Schema(
  {
    suggestion: { type: String },
    potentialSaving: { type: Number },
  },
  { _id: false },
);

const taxRecommendationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    form16Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Form16' },
    oldRegimeTax: { type: Number },
    newRegimeTax: { type: Number },
    recommendedRegime: { type: String, enum: ['Old', 'New'] },
    savingsAmount: { type: Number },
    explanation: { type: String },
    taxSavingSuggestions: [taxSavingSuggestionSchema],
    generatedAt: { type: Date },
    isStale: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taxRecommendationSchema.index({ userId: 1 });
taxRecommendationSchema.index({ form16Id: 1 });

module.exports = mongoose.model('TaxRecommendation', taxRecommendationSchema);
