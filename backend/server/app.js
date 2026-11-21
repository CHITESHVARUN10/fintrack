const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('./config/passport.config');
const connectDB = require('./db');
// Resolved once in db.js — Atlas-first in every environment.
const mongoUri = connectDB.mongoUri;

const app = express();

// ---- Core middleware ----
// Browser requests normally come through the web app's same-origin proxy.
// Keep an explicit allowlist for clients that call the API directly.
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173', // local Vite dev
  'http://localhost:3000', // local alt / previews
  'https://fintrack-rust-theta.vercel.app', // hosted web frontend
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

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

// ---- Sessions (stored in MongoDB, 7-day TTL) ----
const isProd = process.env.NODE_ENV === 'production';
// Behind Render/Heroku-style proxies TLS terminates at the proxy.
// Without trust proxy, express-session sees http and refuses to set
// Secure cookies, which silently breaks login in production.
if (isProd) app.set('trust proxy', 1);
const sessionStore = new MongoStore({
  mongoUrl: mongoUri,
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
      // The browser sees /api on its own host, so the cookie can stay Lax.
      sameSite: 'lax',
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
app.use('/api/expenses', require('./routes/expenses/expenses.routes'));
app.use('/api/tax', require('./routes/tax/tax.routes'));
app.use('/api/members', require('./routes/members/members.routes'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications/notifications.routes'));

// ---- 404 fallback for unknown API routes ----
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---- Global error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express] Unhandled error:', err);
  res.status(err.status || (['ValidationError', 'CastError'].includes(err.name) ? 400 : 500)).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
