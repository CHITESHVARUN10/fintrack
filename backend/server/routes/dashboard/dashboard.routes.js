const express = require('express');
const { isAuthenticated, isAdmin } = require('../../middleware/auth.middleware');
const { buildDashboard } = require('../../services/dashboard.service');

const router = express.Router();

// GET /api/dashboard — aggregated snapshot for the requesting user.
router.get('/', isAuthenticated, async (req, res, next) => {
  try {
    const dashboard = await buildDashboard(req.user._id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/member/:memberId — admin only, scoped to a family member.
router.get('/member/:memberId', isAuthenticated, isAdmin, async (req, res, next) => {
  try {
    const member = await require('../../models/user.model').findById(req.params.memberId);
    if (!member || String(member.familyAccountId) !== String(req.user.familyAccountId)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const dashboard = await buildDashboard(member._id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
