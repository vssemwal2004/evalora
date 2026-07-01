const mongoose = require('mongoose');
const env = require('./env');

async function dropLegacyUserIndexes(connection) {
  const collections = await connection.connection.db.listCollections({ name: 'users' }).toArray();
  if (collections.length === 0) return;

  const users = connection.connection.collection('users');
  const indexes = await users.indexes();
  const legacyEmailIndex = indexes.find((index) => index.name === 'email_1' && index.unique);

  if (legacyEmailIndex) {
    await users.dropIndex('email_1');
    console.log('Dropped legacy users.email unique index; role-scoped login indexes are used instead.');
  }
}

async function connectDB() {
  if (!env.mongoUri) {
    console.warn('MONGO_URI is not configured. Backend will start without database connection.');
    return null;
  }

  mongoose.set('strictQuery', true);

  const connection = await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== 'production',
  });

  await dropLegacyUserIndexes(connection);

  console.log(`MongoDB connected: ${connection.connection.host}`);
  return connection;
}

module.exports = connectDB;
