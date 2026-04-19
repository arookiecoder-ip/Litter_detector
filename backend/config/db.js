// config/db.js
const mongoose = require('mongoose');

/**
 * Connect to MongoDB.
 *
 * Priority:
 *  1. MONGODB_URI env var  → real MongoDB (local or Atlas)
 *  2. No URI set           → spin up an in-memory MongoDB automatically
 *     (uses mongodb-memory-server, great for development without installing MongoDB)
 */
const connectDB = async () => {
  let uri = process.env.MONGODB_URI;
  let isInMemory = false;

  if (!uri || uri.trim() === '') {
    isInMemory = true;
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log('🧪 Using in-memory MongoDB (no MONGODB_URI set)');
      console.log(`   URI: ${uri}`);

      // Shutdown cleanly on process exit
      process.on('exit', () => mongod.stop());
      process.on('SIGINT', async () => { await mongod.stop(); process.exit(0); });
      process.on('SIGTERM', async () => { await mongod.stop(); process.exit(0); });
    } catch (err) {
      console.error('❌ Failed to start in-memory MongoDB:', err.message);
      console.error('   → Set MONGODB_URI in backend/.env to a real MongoDB instance.');
      process.exit(1);
    }
  }

  return new Promise((resolve, reject) => {
    const connectWithRetry = () => {
      mongoose.connect(uri, {
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
      })
      .then(async () => {
        const host = mongoose.connection.host;
        console.log(`✅ MongoDB connected → ${host}`);

        if (isInMemory) {
          try {
            const User = require('../models/User');
            const adminCount = await User.countDocuments();
            if (adminCount === 0) {
              const testUser = new User({
                email: 'admin@example.com',
                password: 'password123',
                name: 'Test Admin',
                role: 'admin',
                gdprConsentAccepted: true,
                gdprConsentTimestamp: new Date(),
              });
              await testUser.save();
              console.log('🌱 In-memory DB: Seeded default user (admin@example.com / password123)');
            }
          } catch (err) {
            console.error('Failed to seed DB:', err.message);
          }
        }

        resolve();
      })
      .catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message);
        console.log('🔄 Retrying in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      });
    };
    connectWithRetry();
  });
};

module.exports = connectDB;
