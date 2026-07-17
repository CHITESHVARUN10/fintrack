const express = require('express');
const Insurance = require('../../models/insurance.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// GET /api/insurance
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.insuranceType) filter.insuranceType = req.query.insuranceType;
    if (req.query.status) filter.status = req.query.status;
    const items = await Insurance.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/insurance
router.post('/', async (req, res, next) => {
  try {
    const item = new Insurance({
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

// PUT /api/insurance/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await Insurance.findById(req.params.id);
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

// DELETE /api/insurance/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Insurance.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
