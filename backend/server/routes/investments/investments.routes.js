const express = require('express');
const Investment = require('../../models/investment.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

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
    const filter = buildListFilter(req);
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
    const filter = buildListFilter(req);
    if (req.query.type) filter.investmentType = req.query.type;
    const items = await Investment.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/investments
router.post('/', async (req, res, next) => {
  try {
    const item = new Investment({
      ...req.body,
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
    const { memberId, familyAccountId, _id, ...updates } = req.body;
    Object.assign(item, updates);
    await item.save();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/investments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Investment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
