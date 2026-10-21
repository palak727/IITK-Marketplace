import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Product from '../models/Product.js';

const migrate = async () => {
  await connectDB();
  try {
    await Product.init();
    console.info('Product lifecycle indexes are ready. No product records were changed.');
  } finally {
    await mongoose.disconnect();
  }
};

migrate().catch((error) => {
  console.error('Product lifecycle migration failed:', error.message);
  process.exitCode = 1;
});
