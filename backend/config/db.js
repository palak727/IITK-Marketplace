import mongoose from 'mongoose';
import { setMemoryMode } from '../store/memoryStore.js';

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri || uri.includes('<username>') || uri.includes('YOUR_')) {
    console.warn(' MONGO_URI not provided or invalid placeholder found. Falling back to in-memory store.');
    setMemoryMode(true);
    return false;
  }

  try {
    if (mongoose.connection.readyState === 1) {
      setMemoryMode(false);
      return true;
    }
    const conn = await mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    setMemoryMode(false);
    return true;
  } catch (error) {
    console.warn(`MongoDB connection failed: ${error.message}. Falling back to in-memory store.`);
    setMemoryMode(true);
    return false;
  }
};

export default connectDB;
