import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  const connectionString = uri || process.env.MONGODB_URI;

  if (!connectionString) {
    throw new Error('MONGODB_URI is required.');
  }

  await mongoose.connect(connectionString);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
