import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri || uri.includes('<username>') || uri.includes('YOUR_')) {
    throw new Error('MONGO_URI is required and must contain a valid MongoDB connection string.');
  }

  try {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    const conn = await mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
    });
    logger.info(`Connected to database host ${conn.connection.host}`, 'db');
    return conn.connection;
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${error.message}`,{cause: error});
  }
};

export default connectDB;
