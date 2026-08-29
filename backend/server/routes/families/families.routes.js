const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const FamilyAccount = require('../../models/familyaccount.model');
const FamilyMembership = require('../../models/familymembership.model');
const User = require('../../models/user.model');
const { isAuthenticated, isAdmin } = require('../../middleware/auth.middleware');
const { sanitizeUser } = require('../../utils/sanitize');
const { generateInviteCode } = require('../../utils/inviteCode');

const router = express.Router();
router.use(isAuthenticated);

function validationError(res, err) {
  return res.status(400).json({ error: 'Validation failed', details: err.details.map((d) => d.message) });
}

async function uniqueInviteCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const exists = await FamilyAccount.findOne({ inviteCode: code });
    if (!exists) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function ensureInviteCode(family) {
  if (family.inviteCode) return family;
  family.inviteCode = await uniqueInviteCode();
  await family.save();
  return family;
}

// POST /api/families — create a new family
router.post('/', async (req, res, next) => {
  try {
    const schema = Joi.object({ name: Joi.string().min(2).max(80).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return validationError(res, error);

    const inviteCode = await uniqueInviteCode();
    const family = new FamilyAccount({
      name: value.name,
      adminId: req.user._id,
      members: [req.user._id],
      inviteCode,
      settings: {},
    });
    await family.save();

    await User.findByIdAndUpdate(req.user._id, { familyAccountId: family._id, role: 'admin' });

    await FamilyMembership.findOneAndUpdate(
      { userId: req.user._id, familyId: family._id },
      { userId: req.user._id, familyId: family._id, role: 'ADMIN', status: 'ACTIVE', requestedAt: new Date(), reviewedAt: new Date(), reviewedBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ family });
  } catch (err) { next(err); }
});

// GET /api/families/me — current user's family + membership
router.get('/me', async (req, res, next) => {
  try {
    const family = req.user.familyAccountId ? await FamilyAccount.findById(req.user.familyAccountId) : null;
    const membership = family
      ? await FamilyMembership.findOne({ userId: req.user._id, familyId: family._id })
      : null;
    res.json({ family, membership });
  } catch (err) { next(err); }
});

// POST /api/families/join — join via inviteCode → PENDING
router.post('/join', async (req, res, next) => {
  try {
    const schema = Joi.object({ inviteCode: Joi.string().trim().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return validationError(res, error);

    const code = value.inviteCode.trim().toUpperCase();
    const family = await FamilyAccount.findOne({ inviteCode: code });
    if (!family) return res.status(404).json({ error: 'Invalid invite code' });

    const existing = await FamilyMembership.findOne({ userId: req.user._id, familyId: family._id });
    if (existing) {
      if (existing.status === 'ACTIVE') return res.status(409).json({ error: 'Already a member' });
      if (existing.status === 'PENDING') return res.status(409).json({ error: 'Join request already pending' });
      existing.status = 'PENDING';
      existing.inviteCode = code;
      existing.requestedAt = new Date();
      existing.reviewedBy = undefined;
      existing.reviewedAt = undefined;
      await existing.save();
      return res.status(201).json({ membership: existing, family });
    }

    const membership = new FamilyMembership({
      userId: req.user._id,
      familyId: family._id,
      role: 'MEMBER',
      status: 'PENDING',
      inviteCode: code,
      requestedAt: new Date(),
    });
    await membership.save();
    res.status(201).json({ membership, family });
  } catch (err) { next(err); }
});

// GET /api/families/:id/members — active members
router.get('/:id/members', async (req, res, next) => {
  try {
    const family = await FamilyAccount.findById(req.params.id);
    if (!family) return res.status(404).json({ error: 'Family not found' });
    const isMember = String(req.user.familyAccountId) === String(family._id);
    if (!isMember && req.user.role !== 'admin') {
      const m = await FamilyMembership.findOne({ userId: req.user._id, familyId: family._id, status: 'ACTIVE' });
      if (!m) return res.status(403).json({ error: 'Not a member of this family' });
    }
    const memberships = await FamilyMembership.find({ familyId: family._id, status: 'ACTIVE' }).populate('userId');
    const members = memberships
      .filter((mm) => mm.userId)
      .map((mm) => ({ ...sanitizeUser(mm.userId), membershipRole: mm.role, membershipStatus: mm.status }));
    res.json({ family, members });
  } catch (err) { next(err); }
});

// GET /api/families/:id/requests — PENDING list (admin)
router.get('/:id/requests', async (req, res, next) => {
  try {
    const family = await FamilyAccount.findById(req.params.id);
    if (!family) return res.status(404).json({ error: 'Family not found' });
    if (String(family.adminId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const requests = await FamilyMembership.find({ familyId: family._id, status: 'PENDING' }).populate('userId');
    res.json({ family, requests });
  } catch (err) { next(err); }
});

// PATCH /api/families/:id/requests/:membershipId — accept/reject
router.patch('/:id/requests/:membershipId', async (req, res, next) => {
  try {
    const schema = Joi.object({ action: Joi.string().valid('accept', 'reject').required() });
    const { error, value } = schema.validate(req.body);
    if (error) return validationError(res, error);

    const family = await FamilyAccount.findById(req.params.id);
    if (!family) return res.status(404).json({ error: 'Family not found' });
    if (String(family.adminId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const membership = await FamilyMembership.findById(req.params.membershipId);
    if (!membership || String(membership.familyId) !== String(family._id)) {
      return res.status(404).json({ error: 'Membership not found' });
    }
    if (membership.status !== 'PENDING') return res.status(409).json({ error: `Already ${membership.status}` });

    if (value.action === 'accept') {
      membership.status = 'ACTIVE';
      membership.reviewedBy = req.user._id;
      membership.reviewedAt = new Date();
      await membership.save();
      await FamilyAccount.findByIdAndUpdate(family._id, { $addToSet: { members: membership.userId } });
      await User.findByIdAndUpdate(membership.userId, { familyAccountId: family._id, isActive: true });
    } else {
      membership.status = 'REJECTED';
      membership.reviewedBy = req.user._id;
      membership.reviewedAt = new Date();
      await membership.save();
    }
    res.json({ membership });
  } catch (err) { next(err); }
});

// DELETE /api/families/:id/members/:userId — remove → REMOVED
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const family = await FamilyAccount.findById(req.params.id);
    if (!family) return res.status(404).json({ error: 'Family not found' });
    if (String(family.adminId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (String(req.params.userId) === String(family.adminId)) {
      return res.status(400).json({ error: 'Cannot remove the family admin' });
    }
    const membership = await FamilyMembership.findOne({ familyId: family._id, userId: req.params.userId, status: 'ACTIVE' });
    if (!membership) return res.status(404).json({ error: 'Active membership not found' });
    membership.status = 'REMOVED';
    membership.removedAt = new Date();
    await membership.save();
    await FamilyAccount.findByIdAndUpdate(family._id, { $pull: { members: req.params.userId } });
    res.json({ membership });
  } catch (err) { next(err); }
});

// POST /api/families/:id/rotate-code — admin rotate inviteCode
router.post('/:id/rotate-code', async (req, res, next) => {
  try {
    const family = await FamilyAccount.findById(req.params.id);
    if (!family) return res.status(404).json({ error: 'Family not found' });
    if (String(family.adminId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    family.inviteCode = await uniqueInviteCode();
    await family.save();
    res.json({ family });
  } catch (err) { next(err); }
});

module.exports = router;
