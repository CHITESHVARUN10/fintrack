const Investment = require('../models/investment.model');
const Insurance = require('../models/insurance.model');
const EMILoan = require('../models/loan.model');
const EducationPayment = require('../models/education.model');
const { investedValue } = require('../utils/investmentCalc');

const FREQ_MONTHS = { Monthly: 1, Quarterly: 3, 'Half-Yearly': 6, Yearly: 12 };

const round = (n) => Math.round(n);

// FY 2025-26 income tax slabs (cumulative spans + marginal rates).
const SLABS = {
  Old: [
    [250000, 0],
    [250000, 0.05],
    [500000, 0.2],
    [Infinity, 0.3],
  ],
  New: [
    [300000, 0],
    [400000, 0.05],
    [300000, 0.1],
    [200000, 0.15],
    [300000, 0.2],
    [Infinity, 0.3],
  ],
};

const STANDARD_DEDUCTION = { Old: 50000, New: 75000 };
const REBATE_LIMIT = { Old: 500000, New: 700000 };

/**
 * Calculate Indian income tax for FY 2025-26.
 * @param {number} grossIncome
 * @param {number} deductions  additional deductions (80C/80D/...) beyond standard deduction
 * @param {'Old'|'New'} regime
 * @returns {{taxableIncome, taxBeforeCess, cess, totalTax}}
 */
function calculateTax(grossIncome, deductions, regime) {
  const std = STANDARD_DEDUCTION[regime] || 0;
  const taxableIncome = Math.max(0, (grossIncome || 0) - std - (deductions || 0));

  let tax = 0;
  let prev = 0;
  for (const [span, rate] of SLABS[regime]) {
    const portion = Math.min(Math.max(taxableIncome - prev, 0), span);
    tax += portion * rate;
    prev += span;
  }

  // Section 87A rebate: tax becomes zero if taxable income is within the limit.
  if (taxableIncome <= REBATE_LIMIT[regime]) tax = 0;

  const cess = tax * 0.04;
  return {
    taxableIncome: round(taxableIncome),
    taxBeforeCess: round(tax),
    cess: round(cess),
    totalTax: round(tax + cess),
  };
}

function annualize(amount, frequency) {
  if (!amount) return 0;
  if (frequency === 'One-time') return amount;
  const div = FREQ_MONTHS[frequency] || 12;
  return amount * (12 / div);
}

/**
 * Aggregate deductible amounts from all financial modules for a user.
 * Values are estimates suitable for a quick comparison/recommendation.
 */
async function aggregateDeductions(userId) {
  const [investments, insurances, loans, edus] = await Promise.all([
    Investment.find({ memberId: userId }),
    Insurance.find({ memberId: userId }),
    EMILoan.find({ memberId: userId }),
    EducationPayment.find({ memberId: userId }),
  ]);

  let section80C = 0;
  let section80CCD = 0;
  let section80D = 0;
  let section80E = 0;
  let section24 = 0;

  for (const inv of investments) {
    if (inv.fundCategory === 'ELSS' || inv.assetType === 'PPF') section80C += investedValue(inv);
    if (inv.assetType === 'NPS') section80CCD += investedValue(inv);
  }

  for (const ins of insurances) {
    if (ins.insuranceType === 'Health') {
      section80D += annualize(ins.premiumAmount, ins.premiumFrequency);
    }
  }

  for (const loan of loans) {
    if (loan.loanType === 'Home' && loan.interestRate && loan.principalAmount) {
      const annualInterest = Math.min((loan.interestRate / 100) * loan.principalAmount, 200000);
      section24 += annualInterest;
      const principalRepaid = Math.max(0, (loan.emiAmount || 0) * 12 - annualInterest);
      section80C += principalRepaid;
    }
  }

  for (const edu of edus) {
    section80E += annualize(edu.amount, edu.frequency);
  }

  const totalDeductions =
    section80C + section80CCD + section80D + section80E + section24;

  return {
    section80C: round(section80C),
    section80CCD: round(section80CCD),
    section80D: round(section80D),
    section80E: round(section80E),
    section24: round(section24),
    totalDeductions: round(totalDeductions),
  };
}

function inr(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** Generate human-readable tax-saving tips based on current deductions. */
async function generateTips(userId) {
  const d = await aggregateDeductions(userId);
  const tips = [];

  const unused80C = Math.max(0, 150000 - d.section80C);
  if (unused80C > 0) {
    const saving = round(unused80C * 0.3);
    tips.push(
      `You have ${inr(unused80C)} of unused Section 80C limit. Invest in ELSS/PPF to save up to ${inr(saving)} in tax.`,
    );
  }

  const unused80D = Math.max(0, 25000 - d.section80D);
  if (unused80D > 0) {
    tips.push(`You can claim up to ${inr(unused80D)} more under Section 80D (health insurance).`);
  }

  if (d.section80E === 0) {
    tips.push('No education loan interest claimed under 80E — if you have one, the interest is fully deductible.');
  }

  if (d.section24 === 0) {
    tips.push('No home loan interest claimed under Section 24 — if applicable, you can deduct up to ₹2,00,000.');
  }

  if (d.section80CCD === 0) {
    tips.push('Consider NPS (Section 80CCD(1B)) for an additional ₹50,000 deduction.');
  }

  if (tips.length === 0) {
    tips.push('You are utilising your major deductions well. Consider NPS for additional savings.');
  }

  return tips;
}

module.exports = { calculateTax, aggregateDeductions, generateTips };
