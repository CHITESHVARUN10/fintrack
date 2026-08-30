const FLAT_CATEGORIES = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Other'];

const CATEGORY_TAXONOMY = {
  Groceries: ['Staples','Vegetables','Fruits','Dairy','Bakery','Household'],
  Food: ['Dairy','Protein','Vegetables','Snacks','Beverages','Meals','Sweets'],
  Electricity: ['Bill','Maintenance'],
  Rent: ['House','Office','Deposit'],
  Transportation: ['Fuel','Metro','Cab','Parking','Maintenance'],
  Shopping: ['Clothing','Electronics','Home','Stationery','Gifts'],
  Medical: ['Pharmacy','Consultation','Lab','Insurance'],
  Education: ['Fees','Books','Coaching','Stationery'],
  Entertainment: ['Movies','OTT','Gaming','Events'],
  Bills: ['Mobile','Internet','Water','Gas','Society'],
  Household: ['Cleaning','Cook','Maid','Repairs','Utility'],
  Other: [],
};

const TRANSACTION_CONFIG = {
  categories: FLAT_CATEGORIES,
  taxonomy: CATEGORY_TAXONOMY,
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

module.exports = { TRANSACTION_CONFIG, FLAT_CATEGORIES, CATEGORY_TAXONOMY };
