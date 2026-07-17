const express = require('express');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter } = require('../../utils/scope');
const {
  generateMonthlyPDF,
  generateMonthlyExcel,
  generateAnnualPDF,
  generateAnnualExcel,
  generateCategoryPDF,
  generateCategoryExcel,
  generateTaxPDF,
} = require('../../services/reportService');

const router = express.Router();
router.use(isAuthenticated);

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// GET /api/reports/monthly?month=&year=&format=pdf|excel
router.get('/monthly', async (req, res, next) => {
  try {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    if (!month || !year || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid month (1-12) and year are required' });
    }
    const { memberId } = buildListFilter(req);
    const isExcel = req.query.format === 'excel';
    const buf = isExcel
      ? await generateMonthlyExcel(memberId, month, year)
      : await generateMonthlyPDF(memberId, month, year);
    const ext = isExcel ? 'xlsx' : 'pdf';
    res.setHeader('Content-Type', isExcel ? XLSX : PDF);
    res.setHeader('Content-Disposition', `attachment; filename="monthly-report-${year}-${pad2(month)}.${ext}"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/annual?year=&format=pdf|excel
router.get('/annual', async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10);
    if (!year) return res.status(400).json({ error: 'Valid year is required' });
    const { memberId } = buildListFilter(req);
    const isExcel = req.query.format === 'excel';
    const buf = isExcel
      ? await generateAnnualExcel(memberId, year)
      : await generateAnnualPDF(memberId, year);
    const ext = isExcel ? 'xlsx' : 'pdf';
    res.setHeader('Content-Type', isExcel ? XLSX : PDF);
    res.setHeader('Content-Disposition', `attachment; filename="annual-report-${year}.${ext}"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/category?from=&to=&format=pdf|excel
router.get('/category', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'Valid from and to dates are required' });
    }
    const { memberId } = buildListFilter(req);
    const isExcel = req.query.format === 'excel';
    const buf = isExcel
      ? await generateCategoryExcel(memberId, from, to)
      : await generateCategoryPDF(memberId, from, to);
    const ext = isExcel ? 'xlsx' : 'pdf';
    res.setHeader('Content-Type', isExcel ? XLSX : PDF);
    res.setHeader('Content-Disposition', `attachment; filename="expense-report-${from}-to-${to}.${ext}"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/tax?year=&format=pdf  (tax summary is PDF only)
router.get('/tax', async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const { memberId } = buildListFilter(req);
    const buf = await generateTaxPDF(memberId, year);
    res.setHeader('Content-Type', PDF);
    res.setHeader('Content-Disposition', `attachment; filename="tax-summary-${year}.pdf"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
