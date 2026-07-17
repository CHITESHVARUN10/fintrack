const express = require('express');
const AdHocExpense = require('../../models/expense.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// GET /api/expenses (?from, ?to, ?category)
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.category) filter.category = req.query.category;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }
    const items = await AdHocExpense.find(filter).sort({ date: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses/bulk-import (JSON array)
router.post('/bulk-import', async (req, res, next) => {
  try {
    const arr = req.body;
    if (!Array.isArray(arr)) {
      return res.status(400).json({ error: 'Expected a JSON array of expense objects' });
    }
    const docs = arr.map((e) => ({
      ...e,
      memberId: req.user._id,
      familyAccountId: req.user.familyAccountId,
    }));
    const inserted = await AdHocExpense.insertMany(docs);
    res.status(201).json({ inserted: inserted.length, ids: inserted.map((d) => d._id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses
router.post('/', async (req, res, next) => {
  try {
    const item = new AdHocExpense({
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

// PUT /api/expenses/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await AdHocExpense.findById(req.params.id);
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

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await AdHocExpense.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
