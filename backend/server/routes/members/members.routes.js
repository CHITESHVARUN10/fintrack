const express = require('express');
const User = require('../../models/user.model');
const { isAuthenticated, isAdmin } = require('../../middleware/auth.middleware');
const { sanitizeUser } = require('../../utils/sanitize');
const { buildDashboard, buildMemberSummary } = require('../../services/dashboard.service');

const router = express.Router();
router.use(isAuthenticated, isAdmin);

// GET /api/members — all members in the admin's family account.
router.get('/', async (req, res, next) => {
  try {
    const members = await User.find({ familyAccountId: req.user.familyAccountId }).sort({ createdAt: 1 });
    res.json(members.map(sanitizeUser));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/members/:id — soft delete (deactivate, retain data).
router.delete('/:id', async (req, res, next) => {
  try {
    const member = await User.findById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Not found' });
    if (String(member.familyAccountId) !== String(req.user.familyAccountId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    member.isActive = false;
    await member.save();
    res.json({ message: 'deactivated', user: sanitizeUser(member) });
  } catch (err) {
    next(err);
  }
});

// GET /api/members/:id/dashboard — same logic as the dashboard route, scoped to member.
router.get('/:id/dashboard', async (req, res, next) => {
  try {
    const member = await User.findById(req.params.id);
    if (!member || String(member.familyAccountId) !== String(req.user.familyAccountId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const dashboard = await buildDashboard(member._id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

// GET /api/members/:id/summary — aggregated totals for the member.
router.get('/:id/summary', async (req, res, next) => {
  try {
    const member = await User.findById(req.params.id);
    if (!member || String(member.familyAccountId) !== String(req.user.familyAccountId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const summary = await buildMemberSummary(member._id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
