const express = require('express');
const RecurringPayment = require('../../models/recurring.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// GET /api/recurring
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.category) filter.category = req.query.category;
    const items = await RecurringPayment.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/recurring
router.post('/', async (req, res, next) => {
  try {
    const item = new RecurringPayment({
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

// PUT /api/recurring/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await RecurringPayment.findById(req.params.id);
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

// DELETE /api/recurring/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await RecurringPayment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
