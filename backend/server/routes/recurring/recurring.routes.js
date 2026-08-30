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

// GET /api/recurring/suggestions
router.get('/suggestions', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { buildSuggestionsForRecurring } = require('../../services/subscriptionLinker.service');
    const memberId = req.user.role === 'admin' && req.query.memberId ? req.query.memberId : undefined;
    const suggestions = await buildSuggestionsForRecurring({ familyId: req.user.familyAccountId, memberId });
    res.json({ suggestions });
  } catch (err) { next(err); }
});

router.post('/:id/apply-suggestion', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { applySuggestion } = require('../../services/subscriptionLinker.service');
    const { acceptAmount, acceptDate } = req.body;
    const updated = await applySuggestion({ kind: 'recurring', id: req.params.id, acceptAmount, acceptDate, familyId: req.user.familyAccountId });
    res.json(updated);
  } catch (err) { next(err); }
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
