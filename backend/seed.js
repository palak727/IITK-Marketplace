import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { seedSampleProducts } from './services/productSeeder.js';

const seed = async () => {
  await connectDB();
  try {
    const { inserted, skipped } = await seedSampleProducts();
    console.info(`Seeded products: ${inserted} inserted, ${skipped} skipped.`);
  } finally {
    await mongoose.disconnect();
  }
};

seed().catch((error) => {
  console.error('Product seeding failed:', error);
  process.exitCode = 1;
});