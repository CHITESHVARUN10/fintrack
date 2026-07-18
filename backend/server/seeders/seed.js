// Database seeding engine for the Personal & Family Finance Management System.
// Usage:
//   node server/seeders/seed.js --fresh   # wipe every collection, then re-seed
//   node server/seeders/seed.js --append   # add seed data without deleting
//
// All calls go through the app's own db.js so we hit the same MongoDB URI.

require('dotenv/config');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectDB = require('../db');

const User = require('../models/user.model');
const FamilyAccount = require('../models/familyaccount.model');
const Income = require('../models/income.model');
const Subscription = require('../models/subscription.model');
const RecurringPayment = require('../models/recurring.model');
const Investement = require('../models/investment.model');
const EMILoan = require('../models/loan.model');
const AdHocExpense = require('../models/expense.model');
const Insurance = require('../models/insurance.model');
const EducationPayment = require('../models/education.model');
const Notification = require('../models/notification.model');
const Form16 = require('../models/form16.model');
const TaxRecommendation = require('../models/taxrecommendation.model');

// --- date helpers (relative to "now" so the seed stays current) ---
const DAY = 864e5;
const daysFromNow = (n) => new Date(Date.now() + n * DAY);
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };

const isFresh = process.argv.includes('--fresh');
const mode = isFresh ? 'fresh' : 'append';

// Find an existing doc by a unique key, or create it. Keeps --append idempotent
// for the account/users and avoids duplicate-key crashes.
async function getOrCreateUser(email, data) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create(data);
}

async function seed() {
  await connectDB();
  console.log(`🌱 Seeding mode: ${mode}`);

  if (isFresh) {
    console.log('🧹 Wiping all collections…');
    await Promise.all([
      User.deleteMany({}),
      FamilyAccount.deleteMany({}),
      Income.deleteMany({}),
      Subscription.deleteMany({}),
      RecurringPayment.deleteMany({}),
      Investement.deleteMany({}),
      EMILoan.deleteMany({}),
      AdHocExpense.deleteMany({}),
      Insurance.deleteMany({}),
      EducationPayment.deleteMany({}),
      Notification.deleteMany({}),
      Form16.deleteMany({}),
      TaxRecommendation.deleteMany({}),
    ]);
  }

  // --- 1. Users ---
  const passwordHash = await bcrypt.hash('Test@1234', 12);
  const rohan = await getOrCreateUser('rohan@test.com', {
    name: 'Rohan Sharma',
    email: 'rohan@test.com',
    passwordHash,
    role: 'admin',
    isActive: true,
  });
  const priya = await getOrCreateUser('priya@test.com', {
    name: 'Priya Sharma',
    email: 'priya@test.com',
    passwordHash,
    role: 'member',
    isActive: true,
  });
  console.log('✅ Users seeded');

  // --- Family account (link users to it) ---
  let family = await FamilyAccount.findOne({ name: 'Sharma Family' });
  if (!family) {
    family = await FamilyAccount.create({
      name: 'Sharma Family',
      adminId: rohan._id,
      members: [rohan._id, priya._id],
    });
  } else {
    family.adminId = rohan._id;
    family.members = [rohan._id, priya._id];
    await family.save();
  }
  await User.updateMany(
    { _id: { $in: [rohan._id, priya._id] } },
    { familyAccountId: family._id },
  );
  console.log('✅ Family account seeded');

  const F = family._id;
  const R = rohan._id;
  const P = priya._id;

  // --- 2. Income ---
  await Income.insertMany([
    { memberId: R, familyAccountId: F, title: 'Salary — Acme Corp', amount: 120000, creditDate: 1, category: 'Salary', taxable: true },
    { memberId: R, familyAccountId: F, title: 'Freelance — Design Gigs', amount: 25000, creditDate: 15, category: 'Freelance', taxable: true },
    { memberId: P, familyAccountId: F, title: 'Salary — TechSoft', amount: 85000, creditDate: 5, category: 'Salary', taxable: true },
    { memberId: P, familyAccountId: F, title: 'Freelance — Tutoring', amount: 12000, creditDate: 20, category: 'Freelance', taxable: true },
  ]);
  console.log('✅ Income seeded');

  // --- 3. Subscriptions ---
  await Subscription.insertMany([
    { memberId: R, familyAccountId: F, name: 'Netflix', category: 'Entertainment', amount: 649, billingDate: 15, frequency: 'monthly', status: 'Active', autoRenew: true, renewalReminderDays: 3 },
    { memberId: R, familyAccountId: F, name: 'Spotify', category: 'Entertainment', amount: 119, billingDate: 20, frequency: 'monthly', status: 'Active', autoRenew: true },
    { memberId: R, familyAccountId: F, name: 'AWS', category: 'Cloud Storage', amount: 2200, billingDate: 5, frequency: 'monthly', status: 'Active', autoRenew: true },
    { memberId: P, familyAccountId: F, name: 'Notion', category: 'Productivity', amount: 800, billingDate: 10, frequency: 'monthly', status: 'Active', autoRenew: true },
    { memberId: R, familyAccountId: F, name: 'YouTube Premium', category: 'Entertainment', amount: 189, billingDate: 12, frequency: 'monthly', status: 'Active', autoRenew: true },
    { memberId: R, familyAccountId: F, name: 'LinkedIn Premium', category: 'News', amount: 2500, billingDate: 1, frequency: 'yearly', status: 'Active', autoRenew: true },
    { memberId: P, familyAccountId: F, name: 'Adobe Creative Cloud', category: 'Productivity', amount: 4230, billingDate: 8, frequency: 'yearly', status: 'Active', autoRenew: true },
  ]);
  console.log('✅ Subscriptions seeded');

  // --- 4. Recurring payments (all under Rohan) ---
  await RecurringPayment.insertMany([
    { memberId: R, familyAccountId: F, title: 'Electricity Bill', category: 'Utility', amount: 2800, dueDate: 10, paymentMethod: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Society Maintenance', category: 'Society', amount: 3500, dueDate: 5, paymentMethod: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Cook Salary', category: 'Staff', amount: 8000, dueDate: 1, paymentMethod: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Internet Bill', category: 'Utility', amount: 999, dueDate: 15, paymentMethod: 'UPI' },
  ]);
  console.log('✅ Recurring payments seeded');

  // --- 5. Investments ---
  const fdStart = yearsAgo(1);
  const fdMaturity = new Date(fdStart.getTime() + 36 * 30 * DAY); // ~36 months out
  await Investement.insertMany([
    {
      memberId: R, familyAccountId: F, investmentType: 'stock',
      stockName: 'Reliance Industries', ticker: 'RELIANCE',
      buyPrice: 2400, quantity: 500, currentPrice: 2780, status: 'Active',
    },
    {
      memberId: R, familyAccountId: F, investmentType: 'stock',
      stockName: 'Infosys', ticker: 'INFY',
      buyPrice: 1500, quantity: 200, currentPrice: 1680, status: 'Active',
    },
    {
      memberId: R, familyAccountId: F, investmentType: 'mf_sip',
      fundName: 'Mirae Asset Large Cap SIP', fundHouse: 'Mirae Asset',
      sipAmount: 5000, sipDate: 7, fundCategory: 'Equity',
      totalInvested: 120000, currentValue: 128000, status: 'Active',
    },
    {
      memberId: R, familyAccountId: F, investmentType: 'mf_sip',
      fundName: 'HDFC ELSS Tax Saver SIP', fundHouse: 'HDFC',
      sipAmount: 2500, sipDate: 7, fundCategory: 'ELSS',
      totalInvested: 60000, currentValue: 64000, status: 'Active',
    },
    {
      memberId: P, familyAccountId: F, investmentType: 'fd',
      bankName: 'SBI', principalAmount: 500000, interestRate: 7.1,
      tenureMonths: 36, interestType: 'Compound',
      startDate: fdStart, maturityDate: fdMaturity, maturityAmount: 614240, status: 'Active',
    },
    {
      memberId: R, familyAccountId: F, investmentType: 'real_estate',
      assetName: 'Flat — Andheri West', assetType: 'Real Estate',
      purchaseValue: 8500000, purchaseDate: yearsAgo(3),
      currentValue: 10500000, status: 'Active',
    },
  ]);
  console.log('✅ Investments seeded');

  // --- 6. EMI & Loans ---
  await EMILoan.insertMany([
    {
      memberId: R, familyAccountId: F, loanName: 'SBI Home Loan', loanType: 'Home', lender: 'SBI',
      principalAmount: 6000000, outstandingAmount: 5400000, emiAmount: 52000, emiDate: 5,
      interestRate: 8.5, tenureMonths: 240, startDate: yearsAgo(5), status: 'Active',
    },
    {
      memberId: P, familyAccountId: F, loanName: 'HDFC Car Loan', loanType: 'Car', lender: 'HDFC',
      principalAmount: 800000, outstandingAmount: 320000, emiAmount: 14500, emiDate: 10,
      interestRate: 9.2, tenureMonths: 60, startDate: yearsAgo(2), status: 'Active',
    },
  ]);
  console.log('✅ EMI & Loans seeded');

  // --- 7. Ad-hoc expenses (last 3 months, both members, mixed categories) ---
  await AdHocExpense.insertMany([
    { memberId: R, familyAccountId: F, title: 'Petrol', category: 'Fuel', amount: 1500, date: daysAgo(3), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Swiggy lunch', category: 'Food', amount: 450, date: daysAgo(3), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Ola cab', category: 'Travel', amount: 320, date: daysAgo(12), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Amazon order', category: 'Shopping', amount: 2400, date: daysAgo(20), paymentMode: 'Card' },
    { memberId: R, familyAccountId: F, title: 'Pharmacy', category: 'Medical', amount: 680, date: daysAgo(25), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'AC repair', category: 'Maintenance', amount: 3500, date: daysAgo(40), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Groceries', category: 'Food', amount: 2100, date: daysAgo(55), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Fuel', category: 'Fuel', amount: 1800, date: daysAgo(70), paymentMode: 'Card' },
    { memberId: R, familyAccountId: F, title: 'Flight tickets', category: 'Travel', amount: 8000, date: daysAgo(85), paymentMode: 'Card' },
    { memberId: R, familyAccountId: F, title: 'Gift', category: 'Other', amount: 1200, date: daysAgo(90), paymentMode: 'UPI' },
    { memberId: R, familyAccountId: F, title: 'Dinner (split)', category: 'Food', amount: 2000, date: daysAgo(6), paymentMode: 'UPI', splitWith: [P], splitType: 'Equal' },

    { memberId: P, familyAccountId: F, title: 'Myntra', category: 'Shopping', amount: 3200, date: daysAgo(5), paymentMode: 'Card' },
    { memberId: P, familyAccountId: F, title: 'Doctor visit', category: 'Medical', amount: 900, date: daysAgo(15), paymentMode: 'UPI' },
    { memberId: P, familyAccountId: F, title: 'Zomato', category: 'Food', amount: 520, date: daysAgo(18), paymentMode: 'UPI' },
    { memberId: P, familyAccountId: F, title: 'Fuel', category: 'Fuel', amount: 1000, date: daysAgo(30), paymentMode: 'UPI' },
    { memberId: P, familyAccountId: F, title: 'Plumber', category: 'Maintenance', amount: 1400, date: daysAgo(48), paymentMode: 'UPI' },
    { memberId: P, familyAccountId: F, title: 'Metro card', category: 'Travel', amount: 200, date: daysAgo(60), paymentMode: 'UPI' },
    { memberId: P, familyAccountId: F, title: 'Gift (split)', category: 'Shopping', amount: 2600, date: daysAgo(10), paymentMode: 'UPI', splitWith: [R], splitType: 'Equal' },
    { memberId: P, familyAccountId: F, title: 'Weekend trip (split)', category: 'Travel', amount: 5000, date: daysAgo(75), paymentMode: 'Card', splitWith: [R], splitType: 'Equal' },
  ]);
  console.log('✅ Ad-hoc expenses seeded');

  // --- 8. Insurance ---
  await Insurance.insertMany([
    {
      memberId: R, familyAccountId: F, policyName: 'LIC Jeevan Anand', insurer: 'LIC',
      insuranceType: 'Life', premiumAmount: 24000, premiumFrequency: 'Yearly',
      nextDueDate: daysFromNow(45), tax80C: true, status: 'Active', nominee: 'Priya Sharma',
    },
    {
      memberId: R, familyAccountId: F, policyName: 'Star Health Family Floater', insurer: 'Star Health',
      insuranceType: 'Health', premiumAmount: 18500, premiumFrequency: 'Yearly',
      nextDueDate: daysFromNow(20), tax80C: false, status: 'Active',
    },
    {
      memberId: P, familyAccountId: F, policyName: 'Vehicle Insurance', insurer: 'ICICI Lombard',
      insuranceType: 'Vehicle', premiumAmount: 8200, premiumFrequency: 'Yearly',
      nextDueDate: daysFromNow(90), status: 'Active',
    },
  ]);
  console.log('✅ Insurance seeded');

  // --- 9. Education payments ---
  await EducationPayment.insertMany([
    {
      memberId: R, familyAccountId: F, title: 'School Fees — Aryan', institution: 'Delhi Public School',
      category: 'School', amount: 18000, frequency: 'Quarterly', dueDate: daysFromNow(15), forMember: 'Aryan Sharma',
    },
    {
      memberId: P, familyAccountId: F, title: 'UPSC Coaching', institution: 'Vision IAS',
      category: 'Coaching', amount: 8500, frequency: 'Monthly', dueDate: daysFromNow(20), forMember: 'Priya Sharma',
    },
  ]);
  console.log('✅ Education payments seeded');

  // --- 10. Notifications (Rohan) ---
  await Notification.insertMany([
    { memberId: R, familyAccountId: F, type: 'subscription', message: 'Netflix subscription of ₹649 will be billed in 3 days.', relatedModule: 'subscriptions', isRead: false, scheduledAt: daysFromNow(3), channel: ['in-app'] },
    { memberId: R, familyAccountId: F, type: 'emi', message: 'SBI Home Loan EMI of ₹52,000 is due in 3 days.', relatedModule: 'loans', isRead: false, scheduledAt: daysFromNow(3), channel: ['in-app'] },
    { memberId: R, familyAccountId: F, type: 'insurance', message: 'Star Health policy premium is due in 7 days.', relatedModule: 'insurance', isRead: false, scheduledAt: daysFromNow(7), channel: ['in-app'] },
    { memberId: R, familyAccountId: F, type: 'subscription', message: 'Spotify subscription of ₹119 will be billed in 5 days.', relatedModule: 'subscriptions', isRead: false, scheduledAt: daysFromNow(5), channel: ['in-app'] },
    { memberId: R, familyAccountId: F, type: 'budget', message: 'You have exceeded your Food budget for this month.', relatedModule: 'expenses', isRead: true, scheduledAt: daysAgo(2), channel: ['in-app'] },
    { memberId: R, familyAccountId: F, type: 'report', message: 'Your June 2026 monthly report is ready.', relatedModule: 'reports', isRead: true, scheduledAt: daysAgo(10), channel: ['in-app'] },
  ]);
  console.log('✅ Notifications seeded');

  // --- 11. Form 16 (Rohan) + Tax Recommendation ---
  const form16 = await Form16.create({
    userId: R,
    financialYear: '2024-25',
    employeeName: 'Rohan Sharma',
    employerName: 'Acme Corp Pvt Ltd',
    employerPAN: 'AAACA1234A',
    basicSalary: 1000000,
    hra: 200000,
    specialAllowance: 180000,
    grossSalary: 1380000,
    standardDeduction: 50000,
    section80C: 150000,
    section80D: 25000,
    totalDeductions: 175000,
    taxableIncome: 1155000,
    tdsDeducted: 140000,
    taxRegimeUsed: 'Old',
    sourceType: 'Manual',
  });
  console.log('✅ Form 16 seeded');

  await TaxRecommendation.create({
    userId: R,
    form16Id: form16._id,
    oldRegimeTax: 156000,
    newRegimeTax: 112500,
    recommendedRegime: 'New',
    savingsAmount: 43500,
    explanation: 'Based on your income and deductions, the New Regime saves you more tax this year.',
    taxSavingSuggestions: [
      { suggestion: 'Shift to the New Tax Regime to save ₹43,500 this year.', potentialSaving: 43500 },
      { suggestion: 'Invest ₹50,000 more under Section 80C to maximise old-regime benefits if you switch back.', potentialSaving: 15000 },
    ],
    generatedAt: new Date(),
    // Mark stale so the recommendation is recomputed from the real aggregated
    // data (loans, education, investments, insurance) the first time it is
    // viewed, instead of showing these seed placeholder numbers.
    isStale: true,
  });
  console.log('✅ Tax recommendation seeded');
}

seed()
  .then(() => {
    console.log('\n🌱 Seeding complete. Rohan: rohan@test.com / Test@1234 | Priya: priya@test.com / Test@1234');
    return mongoose.connection.close();
  })
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\n❌ Seeding failed:', err);
    try { await mongoose.connection.close(); } catch { /* ignore */ }
    process.exit(1);
  });
