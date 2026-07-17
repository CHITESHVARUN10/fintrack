const express = require('express');
const EMILoan = require('../../models/loan.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// GET /api/loans
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.loanType) filter.loanType = req.query.loanType;
    const items = await EMILoan.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/loans
router.post('/', async (req, res, next) => {
  try {
    const item = new EMILoan({
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

// PUT /api/loans/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await EMILoan.findById(req.params.id);
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

// DELETE /api/loans/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await EMILoan.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
