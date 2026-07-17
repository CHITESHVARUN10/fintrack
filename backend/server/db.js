const mongoose = require('mongoose');

const URI =
  process.env.MONGODB_URI ||
  process.env.mongo_uri ||
  'mongodb://localhost:27017/fintrack';

async function connectDB() {
  try {
    await mongoose.connect(URI);
    console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
