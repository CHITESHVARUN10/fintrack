const express = require('express');
const mongoose = require('mongoose');
const Investment = require('../../models/investment.model');
const Transaction = require('../../models/transaction.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify, sameId } = require('../../utils/scope');
const { parseSaleInput, detailPayload, dividendFilter, saleWrite } = require('../../services/stockSales');

const { registerFinanceTransactions, requireUnlinked, clearRetiredLinks } = require('../financeTransactions');

const router = express.Router();
router.use(isAuthenticated);
registerFinanceTransactions(router, Investment, 'investments');

// Per-type invested / current value estimates for the summary.
function investedValue(d) {
  switch (d.investmentType) {
    case 'stock':
      return (d.buyPrice || 0) * (d.quantity || 0);
    case 'mf_sip':
      return d.totalInvested || d.sipAmount || 0;
    case 'fd':
      return d.principalAmount || 0;
    case 'real_estate':
      return d.totalInvested || d.purchaseValue || 0;
    default:
      return d.totalInvested || d.purchaseValue || 0;
  }
}

function currentValueOf(d) {
  switch (d.investmentType) {
    case 'stock':
      return (d.currentPrice || 0) * (d.quantity || 0);
    case 'mf_sip':
      return d.currentValue || (d.units || 0) * (d.nav || 0);
    case 'fd':
      return d.maturityAmount || d.principalAmount || 0;
    case 'real_estate':
      return d.currentValue || d.purchaseValue || 0;
    default:
      return d.currentValue || d.purchaseValue || 0;
  }
}

// GET /api/investments/summary — invested vs current value grouped by type.
router.get('/summary', async (req, res, next) => {
  try {
    const filter = await buildListFilter(req);
    const docs = await Investment.find(filter);
    const byType = {};
    let totalInvested = 0;
    let totalCurrentValue = 0;
    for (const d of docs) {
      const t = d.investmentType || 'other';
      if (!byType[t]) byType[t] = { investmentType: t, totalInvested: 0, totalCurrentValue: 0, count: 0 };
      const inv = investedValue(d);
      const cur = currentValueOf(d);
      byType[t].totalInvested += inv;
      byType[t].totalCurrentValue += cur;
      byType[t].count += 1;
      totalInvested += inv;
      totalCurrentValue += cur;
    }
    res.json({ byType: Object.values(byType), overall: { totalInvested, totalCurrentValue } });
  } catch (err) {
    next(err);
  }
});

// GET /api/investments (optional ?type= filter)
router.get('/', async (req, res, next) => {
  try {
    const filter = await buildListFilter(req);
    if (req.query.type) filter.investmentType = req.query.type;
    const items = await Investment.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

async function withDetails(req, item) {
  const dividends = await Transaction.find(await dividendFilter(item, req)).select('amountPaise').lean();
  const totalDividendPaise = dividends.reduce((total, row) => total + (row.amountPaise || 0), 0);
  return detailPayload(item, totalDividendPaise);
}

// GET /api/investments/:id — full position detail with sale and dividend history.
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const item = await Investment.findOne({ _id: req.params.id, familyAccountId: req.user.familyAccountId });
    if (!item || (!sameId(item.memberId, req.user._id) && req.user.role !== 'admin')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(await withDetails(req, item));
  } catch (err) {
    next(err);
  }
});

// POST /api/investments/:id/sales — record an explicit stock sale.
router.post('/:id/sales', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const item = await Investment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    if (item.investmentType !== 'stock') {
      return res.status(409).json({ error: 'Only stock investments can record sales' });
    }
    const parsed = parseSaleInput(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { sale } = parsed;

    // A retried request returns the already-updated position without selling again.
    if ((item.sales || []).some((row) => row.requestId === sale.requestId)) {
      return res.json(await withDetails(req, item));
    }

    const { filter, update } = saleWrite(item, sale);
    const updated = await Investment.findOneAndUpdate(filter, update, { returnDocument: 'after', updatePipeline: true });
    if (!updated) {
      const current = await Investment.findById(item._id);
      if (!current) return res.status(404).json({ error: 'Not found' });
      if ((current.sales || []).some((row) => row.requestId === sale.requestId)) {
        return res.json(await withDetails(req, current));
      }
      return res.status(409).json({ error: 'Cannot sell more than the remaining quantity' });
    }
    res.json(await withDetails(req, updated));
  } catch (err) {
    next(err);
  }
});

// POST /api/investments
router.post('/', async (req, res, next) => {
  try {
    const { sales, originalQuantity, ...body } = req.body;
    const item = new Investment({
      ...body,
      memberId: req.user._id,
      familyAccountId: req.user.familyAccountId,
    });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/investments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await Investment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    // Sale history is server-managed; edits cannot rewrite it directly.
    const { memberId, familyAccountId, _id, sales, originalQuantity, ...updates } = req.body;
    const previousType = item.investmentType;
    const typeChanged = Object.hasOwn(updates, 'investmentType') && updates.investmentType !== previousType;
    const quantityChanged = Object.hasOwn(updates, 'quantity') && updates.quantity !== item.quantity;
    if (typeChanged || quantityChanged) {
      if (item.sales?.length) {
        return res.status(409).json({ error: 'This holding has recorded sales. Update its price or record another sale to change the holding.' });
      }
      // A concurrent first sale takes precedence over an older edit form.
      item.$where = { 'sales.0': { $exists: false } };
    } else {
      delete updates.quantity;
    }
    if (typeChanged && !await requireUnlinked(res, 'investments', item)) return;
    Object.assign(item, updates);
    await item.save();
    if (typeChanged && previousType) await clearRetiredLinks('investments', item, previousType);
    res.json(await withDetails(req, item));
  } catch (err) {
    if (err.name === 'DocumentNotFoundError') return res.status(409).json({ error: 'The holding changed. Reload it before editing.' });
    next(err);
  }
});

// DELETE /api/investments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Investment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    if (!await requireUnlinked(res, 'investments', item)) return;
    await item.deleteOne();
    await clearRetiredLinks('investments', item);
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
