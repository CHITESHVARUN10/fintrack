const express = require('express');
const Subscription = require('../../models/subscription.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// Compute the next renewal date from the billing day-of-month and frequency.
function computeNextRenewal(frequency, billingDate, base = new Date()) {
  if (!billingDate) return undefined;
  const day = billingDate;
  const y = base.getFullYear();
  const m = base.getMonth();
  let next = new Date(y, m, day);
  if (frequency === 'yearly') {
    if (next <= base) next = new Date(y + 1, m, day);
  } else {
    if (next <= base) next = new Date(y, m + 1, day);
  }
  return next;
}

// GET /api/subscriptions
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.frequency) filter.frequency = req.query.frequency;
    const items = await Subscription.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions
router.post('/', async (req, res, next) => {
  try {
    const body = { ...req.body, memberId: req.user._id, familyAccountId: req.user.familyAccountId };
    if (body.frequency && body.billingDate) {
      body.nextRenewalDate = computeNextRenewal(body.frequency, body.billingDate);
    }
    const item = new Subscription(body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    const { memberId, familyAccountId, _id, ...updates } = req.body;
    Object.assign(item, updates);
    if (item.frequency && item.billingDate) {
      item.nextRenewalDate = computeNextRenewal(item.frequency, item.billingDate);
    }
    await item.save();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Subscription.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
