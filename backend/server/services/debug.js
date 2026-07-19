const { EXCLUSION_REASON, EXCLUSION_CATEGORY, generateSuggestions, explainResult } = require('./taxEngine.service');
const res = {
  recommendedRegime: 'Old',
  savingsAmount: 0,
  oldRegime: {
    taxableIncome: 1000000,
    totalTax: 100000,
    unverified: [{ section: '80CCD', amount: 132600, needsConfirmation: true, exclusionReason: EXCLUSION_REASON.UNCONFIRMED_SUBTYPE, exclusionCategory: EXCLUSION_CATEGORY.CATEGORY_DATA_VALIDATION }]
  },
  newRegime: { taxableIncome: 1000000, totalTax: 100000 }
};
const suggs = generateSuggestions(res);
console.log('Suggs:', suggs);
