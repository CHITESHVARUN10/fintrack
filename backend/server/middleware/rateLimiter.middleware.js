const rateLimit = require('express-rate-limit');

// Rate limit for the login route: max 10 requests / 15 min per IP.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Rate limit for Gemini-powered endpoints (Form 16 extraction + tax
// recommendations): max 4 requests / 5 min, keyed by user account + IP.
// Both parts matter: the user part stops one account hammering the key
// from many devices, the IP part stops many accounts (or logged-out
// credential-stuffing) hammering from one machine.
// NOTE: router.use(isAuthenticated) must run before this so req.user exists.
// On Render, app.set('trust proxy', 1) makes req.ip the real client IP.
const geminiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${req.user && req.user._id ? req.user._id : 'anon'}:${req.ip}`,
  message: {
    error:
      'Too many AI requests. Gemini-powered features are limited to 4 requests per 5 minutes. Please try again shortly.',
  },
});

module.exports = { loginRateLimiter, geminiRateLimiter };
