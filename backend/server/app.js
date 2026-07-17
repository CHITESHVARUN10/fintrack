const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('./config/passport.config');

const app = express();

// ---- Core middleware ----
app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
        ? process.env.CORS_ORIGIN.split(',')
        : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Sessions (stored in MongoDB, 7-day TTL) ----
const sessionStore = new MongoStore({
  mongoUrl: process.env.MONGODB_URI || process.env.mongo_uri,
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
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// ---- Passport ----
app.use(passport.initialize());
app.use(passport.session());

// ---- Health check ----
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---- Route groups (mounted under /api) ----
app.use('/api/auth', require('./routes/auth/auth.routes'));
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
