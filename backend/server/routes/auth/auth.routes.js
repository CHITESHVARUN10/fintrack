const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Joi = require('joi');

const User = require('../../models/user.model');
const FamilyAccount = require('../../models/familyaccount.model');
const { isAuthenticated, isAdmin } = require('../../middleware/auth.middleware');
const { loginRateLimiter } = require('../../middleware/rateLimiter.middleware');
const { sanitizeUser } = require('../../utils/sanitize');
const { sendEmail } = require('../../utils/mailer');

const router = express.Router();

// ---- Validation schemas ----
const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const inviteSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().optional(),
});

const acceptInviteSchema = Joi.object({
  password: Joi.string().min(6).required(),
  name: Joi.string().optional(),
});

function validationError(res, err) {
  return res.status(400).json({ error: 'Validation failed', details: err.details.map((d) => d.message) });
}

// ---- POST /api/auth/register ----
router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return validationError(res, error);

    const email = value.email.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(value.password, 12);
    const isFirstUser = (await User.countDocuments()) === 0;

    let familyAccountId = null;
    if (isFirstUser) {
      const family = new FamilyAccount({ name: `${value.name}'s Family` });
      family.members = [];
      await family.save();
      familyAccountId = family._id;
    } else {
      // Join the existing (single) family account.
      const existingFamily = await FamilyAccount.findOne().sort({ createdAt: 1 });
      familyAccountId = existingFamily ? existingFamily._id : null;
    }

    const user = new User({
      name: value.name,
      email,
      passwordHash,
      role: isFirstUser ? 'admin' : 'member',
      familyAccountId,
    });
    await user.save();

    if (isFirstUser) {
      // Link the family account to its admin.
      const family = await FamilyAccount.findById(familyAccountId);
      family.adminId = user._id;
      family.members = [user._id];
      await family.save();
    } else if (familyAccountId) {
      // Add the new member to the family's member list.
      await FamilyAccount.findByIdAndUpdate(familyAccountId, {
        $addToSet: { members: user._id },
      });
    }

    return res.status(201).json({ user: sanitizeUser(user), role: user.role });
  } catch (err) {
    next(err);
  }
});

// ---- POST /api/auth/login (rate limited) ----
router.post('/login', loginRateLimiter, (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return validationError(res, error);

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid email or password' });
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.json({ user: sanitizeUser(user) });
    });
  })(req, res, next);
});

// ---- POST /api/auth/logout ----
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie('fintrack.sid');
      return res.json({ message: 'Logged out' });
    });
  });
});

// ---- GET /api/auth/me ----
router.get('/me', isAuthenticated, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// ---- POST /api/auth/invite (admin only) ----
router.post('/invite', isAuthenticated, isAdmin, async (req, res, next) => {
  try {
    const { error, value } = inviteSchema.validate(req.body);
    if (error) return validationError(res, error);

    const email = value.email.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'User with this email already exists' });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const invited = new User({
      name: value.name || email.split('@')[0],
      email,
      role: 'member',
      familyAccountId: req.user.familyAccountId,
      inviteToken,
      inviteExpiry,
      isActive: false,
    });
    await invited.save();

    const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invite/${inviteToken}`;
    try {
      await sendEmail({
        to: email,
        subject: 'You have been invited to FinTrack',
        text: `You have been invited to join a FinTrack family account. Use this link to set your password: ${inviteUrl}`,
        html: `<p>You have been invited to join a FinTrack family account.</p>
               <p><a href="${inviteUrl}">Set your password &amp; activate your account</a></p>`,
      });
    } catch (mailErr) {
      // Email is best-effort; the invite (and activation link) still work.
      console.warn('[auth] invite email failed:', mailErr?.message || mailErr);
    }

    return res.json({
      message: 'Invite sent',
      invited: sanitizeUser(invited),
      inviteToken,
    });
  } catch (err) {
    next(err);
  }
});

// ---- POST /api/auth/accept-invite/:token ----
router.post('/accept-invite/:token', async (req, res, next) => {
  try {
    const { error, value } = acceptInviteSchema.validate(req.body);
    if (error) return validationError(res, error);

    const user = await User.findOne({
      inviteToken: req.params.token,
      inviteExpiry: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invite token' });

    user.passwordHash = await bcrypt.hash(value.password, 12);
    if (value.name) user.name = value.name;
    user.inviteToken = undefined;
    user.inviteExpiry = undefined;
    user.isActive = true;
    await user.save();

    return res.json({ message: 'Invite accepted. You can now log in.', user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
