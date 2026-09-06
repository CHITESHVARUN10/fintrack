const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('./config/passport.config');

const app = express();

// ---- Core middleware ----
// Browsers calling the API from the hosted web frontend need an explicit
// origin allowlist. Native mobile apps send no Origin header, so CORS
// never applies to them — no entry needed for Flutter.
// CORS_ORIGIN (comma-separated) only ADDS origins later; the built-ins
// below always apply, so Render works with zero CORS env vars set.
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173', // local Vite dev
  'http://localhost:3000', // local alt / previews
  'https://fintrack.vercel.app', // hosted web frontend
];
const extraOrigins =
  process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
    ? process.env.CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
const allowedOrigins = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins])];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Sessions (stored in MongoDB, 7-day TTL) ----
const isProd = process.env.NODE_ENV === 'production';
// Behind Render/Heroku-style proxies TLS terminates at the proxy.
// Without trust proxy, express-session sees http and refuses to set
// Secure cookies, which silently breaks login in production.
if (isProd) app.set('trust proxy', 1);
const sessionStore = new MongoStore({
  mongoUrl:
    process.env.MONGODB_URI ||
    process.env.mongo_uri_production ||
    process.env.mongo_uri,
  collectionName: 'sessions',
  ttl: 7 * 24 * 60 * 60, // 7 days
  autoRemove: 'native',
});

app.use(
  session({
    name: 'fintrack.sid',
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      // Cross-origin frontend (e.g. Vercel) needs SameSite=None + Secure.
      // Same-origin / local dev keeps Lax.
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// ---- Passport ----
app.use(passport.initialize());
app.use(passport.session());

// ---- Health checks ----
// /api/health is the Render healthCheckPath. /health is the human-friendly
// one — open it in a browser to manually verify the server is up.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) =>
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }),
);

// ---- Route groups (mounted under /api) ----
app.use('/api/auth', require('./routes/auth/auth.routes'));
app.use('/api/families', require('./routes/families/families.routes'));
app.use('/api/transactions', require('./routes/transactions/transactions.routes'));
app.use('/api/imports', require('./routes/imports/imports.routes'));
app.use('/api/budgets', require('./routes/budgets/budgets.routes'));
app.use('/api/vendors', require('./routes/vendors.routes'));
app.use('/api/recipients', require('./routes/recipients/recipients.routes'));
app.use('/api/analytics', require('./routes/analytics/analytics.routes'));
app.use('/api/dashboard', require('./routes/dashboard/dashboard.routes'));
app.use('/api/income', require('./routes/income/income.routes'));
app.use('/api/subscriptions', require('./routes/subscriptions/subscriptions.routes'));
app.use('/api/recurring', require('./routes/recurring/recurring.routes'));
app.use('/api/investments', require('./routes/investments/investments.routes'));
app.use('/api/loans', require('./routes/loans/loans.routes'));
app.use('/api/expenses', require('./routes/expenses/expenses.routes'));
app.use('/api/insurance', require('./routes/insurance/insurance.routes'));
app.use('/api/education', require('./routes/education/education.routes'));
app.use('/api/tax', require('./routes/tax/tax.routes'));
app.use('/api/members', require('./routes/members/members.routes'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications/notifications.routes'));
app.use('/api/form16', require('./routes/form16/form16.routes'));

// ---- 404 fallback for unknown API routes ----
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---- Global error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express] Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
