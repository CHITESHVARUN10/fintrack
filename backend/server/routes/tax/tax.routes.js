const express = require('express');
const Joi = require('joi');
const Income = require('../../models/income.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { calculateTax, aggregateDeductions, generateTips } = require('../../services/tax.service');

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
    const oldRegime = calculateTax(grossIncome, deductions.totalDeductions, 'Old');
    const newRegime = calculateTax(grossIncome, deductions.totalDeductions, 'New');
    const recommended = oldRegime.totalTax <= newRegime.totalTax ? 'Old' : 'New';
    const savings = Math.abs(oldRegime.totalTax - newRegime.totalTax);
    res.json({
      grossIncome,
      deductions,
      old: oldRegime,
      new: newRegime,
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
    const result = calculateTax(value.grossIncome, value.deductions, value.regime);
    res.json({ ...result, regime: value.regime });
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
    const oldRegime = calculateTax(grossIncome, deductions.totalDeductions, 'Old');
    const newRegime = calculateTax(grossIncome, deductions.totalDeductions, 'New');
    const recommended = oldRegime.totalTax <= newRegime.totalTax ? 'Old' : 'New';
    const savings = Math.abs(oldRegime.totalTax - newRegime.totalTax);
    res.json({ old: oldRegime, new: newRegime, recommended, savings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
