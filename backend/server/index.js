require('dotenv').config();
const app = require('./app');
const connectDB = require('./db');
// Scheduled jobs (cron) start with the server.
require('./services/cronJobs');
// Scheduled jobs (cron) are imported here once available (Phase 11).
// require('./services/cron.service');

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] FinTrack API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to start server:', err);
    process.exit(1);
  });
