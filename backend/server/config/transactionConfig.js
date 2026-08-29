const TRANSACTION_CONFIG = {
  categories: ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Other'],
  thresholds: {
    autoMerge: 85,
    pendingReview: 60,
  },
  timeWindows: {
    highConfidenceMinutes: 10,
    mediumConfidenceMinutes: 30,
    dateToleranceDays: 1,
  },
};

module.exports = { TRANSACTION_CONFIG };
