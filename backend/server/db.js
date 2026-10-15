const mongoose = require('mongoose');

// Atlas cluster takes precedence in EVERY environment (dev included) —
// dev and prod share one database by design, so all data persists in
// Atlas rather than the local instance. Local Mongo is only a fallback
// when no Atlas URI is configured at all.
const mongoUri =
  process.env.mongo_uri_production ||
  process.env.MONGODB_ATLAS_URI ||
  process.env.MONGODB_URI ||
  process.env.mongo_uri ||
  'mongodb://127.0.0.1:27017/fintrack';

async function connectDB() {
  try {
    await mongoose.connect(mongoUri);
    console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
module.exports.mongoUri = mongoUri;
