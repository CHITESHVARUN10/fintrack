const express = require('express');
const Notification = require('../../models/notification.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    if (req.query.type) filter.type = req.query.type;
    if (req.query.relatedModule) filter.relatedModule = req.query.relatedModule;
    if (req.query.isRead !== undefined) filter.isRead = req.query.isRead === 'true';
    const items = await Notification.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications (self, or admin can target a member via memberId)
router.post('/', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (req.user.role === 'admin' && body.memberId) {
      body.memberId = body.memberId;
      body.familyAccountId = req.user.familyAccountId;
    } else {
      body.memberId = req.user._id;
      body.familyAccountId = req.user.familyAccountId;
    }
    const item = new Notification(body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res, next) => {
  try {
    const filter = buildListFilter(req);
    const result = await Notification.updateMany(
      { ...filter, isRead: false },
      { $set: { isRead: true } },
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res, next) => {
  try {
    const item = await Notification.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    item.isRead = true;
    await item.save();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await Notification.findById(req.params.id);
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

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Notification.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
