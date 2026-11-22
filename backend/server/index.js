require('dotenv').config();
const app = require('./app');
const connectDB = require('./db');
// Scheduled jobs (cron) start with the server.
require('./services/cronJobs');
// Scheduled jobs (cron) are imported here once available (Phase 11).
// require('./services/cron.service');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

connectDB()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[server] FinTrack API listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to start server:', err);
    process.exit(1);
  });
