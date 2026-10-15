// Authentication & authorization middleware.

async function isAuthenticated(req, res, next) {
  if (!req.isAuthenticated?.() || !req.user?.isActive) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    if (req.user.familyAccountId) {
      const FamilyMembership = require('../models/familymembership.model');
      const revoked = await FamilyMembership.exists({ userId: req.user._id, familyId: req.user.familyAccountId, status: { $ne: 'ACTIVE' } });
      if (revoked) return res.status(403).json({ error: 'Active family membership required' });
      const active = await FamilyMembership.exists({ userId: req.user._id, familyId: req.user.familyAccountId, status: 'ACTIVE' });
      if (!active) return res.status(403).json({ error: 'Active family membership required' });
    }
    return next();
  } catch (err) { next(err); }
}

function isAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

module.exports = { isAuthenticated, isAdmin };
