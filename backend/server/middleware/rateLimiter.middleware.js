const rateLimit = require('express-rate-limit');

// Rate limit for the login route: max 10 requests / 15 min per IP.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

module.exports = { loginRateLimiter };
