const express = require('express');
const Joi = require('joi');
const Income = require('../../models/income.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { computeLiability, computeRegimeTaxes, aggregateDeductions, generateTips } = require('../../services/tax.service');

// Map a full computeLiability trace to the lightweight shape the Tax page uses.
function toRegimeResult(trace) {
  const gross = trace.grossIncome || 1;
  return {
    regime: trace.regime,
    grossIncome: trace.grossIncome,
    deductions: trace.totalDeductions,
    taxableIncome: trace.taxableIncome,
    taxBeforeCess: trace.incomeTaxAfterRebate,
    cess: trace.cess,
    totalTax: trace.finalTax,
    effectiveRate: Math.round((trace.finalTax / gross) * 1000) / 10,
  };
}

const router = express.Router();
router.use(isAuthenticated);

const calculateSchema = Joi.object({
  grossIncome: Joi.number().required(),
  deductions: Joi.number().default(0),
  regime: Joi.string().valid('Old', 'New').required(),
});

// Annual gross income estimate: monthly incomes * 12.
async function getAnnualGross(userId) {
  const incomes = await Income.find({ memberId: userId });
  return incomes.reduce((s, i) => s + (i.amount || 0) * 12, 0);
}

// GET /api/tax/estimate — both regimes, auto-aggregated.
router.get('/estimate', async (req, res, next) => {
  try {
    const grossIncome = await getAnnualGross(req.user._id);
    const deductions = await aggregateDeductions(req.user._id);
    const { old, new: newR } = computeRegimeTaxes(grossIncome, deductions);
    const recommended = old.finalTax <= newR.finalTax ? 'Old' : 'New';
    const savings = Math.abs(old.finalTax - newR.finalTax);
    res.json({
      grossIncome,
      deductions,
      old: toRegimeResult(old),
      new: toRegimeResult(newR),
      recommended,
      savings,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tax/calculate — manual override.
router.post('/calculate', async (req, res, next) => {
  try {
    const { error, value } = calculateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details.map((d) => d.message) });
    }
    const trace = computeLiability({
      grossSalary: value.grossIncome,
      regime: value.regime,
      deductions: { section80C: value.deductions },
    });
    res.json({ ...toRegimeResult(trace), regime: value.regime });
  } catch (err) {
    next(err);
  }
});

// GET /api/tax/tips
router.get('/tips', async (req, res, next) => {
  try {
    const tips = await generateTips(req.user._id);
    res.json(tips);
  } catch (err) {
    next(err);
  }
});

// GET /api/tax/compare — both regimes side by side.
router.get('/compare', async (req, res, next) => {
  try {
    const grossIncome = await getAnnualGross(req.user._id);
    const deductions = await aggregateDeductions(req.user._id);
    const { old, new: newR } = computeRegimeTaxes(grossIncome, deductions);
    const recommended = old.finalTax <= newR.finalTax ? 'Old' : 'New';
    const savings = Math.abs(old.finalTax - newR.finalTax);
    res.json({ old: toRegimeResult(old), new: toRegimeResult(newR), recommended, savings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
