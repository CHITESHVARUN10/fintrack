// BHIM-like UPI handle → category heuristic (manual) + keyword map
// Combination of manual + auto-learn from RecipientDirectory (vendor primaryCategory per handle)
// Manual is low confidence (40), vendor primary is high (90), auto-learn medium (50)

const MANUAL_UPI_HANDLE_MAP = {
  // common handles – keep conservative, Food/Groceries vs Shopping vs Bills
  ybl: 'Shopping', // PhonePe / Yes Bank
  paytm: 'Shopping',
  apl: 'Shopping', // Amazon Pay
  ibl: 'Shopping',
  axl: 'Shopping',
  okaxis: 'Shopping',
  okhdfc: 'Shopping',
  okicici: 'Shopping',
  oksbi: 'Shopping',
  hdfc: 'Shopping',
  icici: 'Shopping',
  sbi: 'Shopping',
  tmb: 'Food', // Tamil Nadu Mercantile – often local food vendors (weak signal)
  yespay: 'Shopping',
  idfc: 'Shopping',
  // add more as learned
};

const KEYWORD_CATEGORY_MAP = {
  // Food / Groceries
  dairy: 'Food',
  milk: 'Food',
  paneer: 'Food',
  curd: 'Food',
  swiggy: 'Food',
  zomato: 'Food',
  zepto: 'Groceries',
  blinkit: 'Groceries',
  bigbasket: 'Groceries',
  grocery: 'Groceries',
  vegetable: 'Groceries',
  fruit: 'Groceries',
  // Shopping
  amazon: 'Shopping',
  flipkart: 'Shopping',
  myntra: 'Shopping',
  stationery: 'Shopping',
  book: 'Education',
  education: 'Education',
  school: 'Education',
  college: 'Education',
  // Bills + Loan EMI
  electricity: 'Bills',
  bescom: 'Bills',
  bses: 'Bills',
  water: 'Bills',
  gas: 'Bills',
  mobile: 'Bills',
  recharge: 'Bills',
  rent: 'Rent',
  emi: 'Bills',
  loan: 'Bills',
  housing: 'Bills',
  mortgage: 'Bills',
  homeloan: 'Bills',
  'home loan': 'Bills',
  'car loan': 'Bills',
  sbi: 'Bills',
  hdfc: 'Bills',
  icici: 'Bills',
  axis: 'Bills',
  kotak: 'Bills',
  bajaj: 'Bills',
  // Education loan still Education
  'education loan': 'Education',
  // Transport
  uber: 'Transportation',
  ola: 'Transportation',
  irctc: 'Transportation',
  metro: 'Transportation',
  // Medical
  pharmacy: 'Medical',
  hospital: 'Medical',
  clinic: 'Medical',
  // Entertainment + Subscriptions
  netflix: 'Entertainment',
  spotify: 'Entertainment',
  youtube: 'Entertainment',
  hotstar: 'Entertainment',
  prime: 'Entertainment',
  // Household
  maid: 'Household',
  cook: 'Household',
  society: 'Household',
  maintenance: 'Household',
};

module.exports = { MANUAL_UPI_HANDLE_MAP, KEYWORD_CATEGORY_MAP };
