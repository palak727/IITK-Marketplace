import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import connectDB from './config/db.js';
import Product from './models/Product.js';
import User from './models/User.js';
import { seedProducts } from './data/seedProducts.js';

export const seedUsers = [
  { name: 'Priya Verma', email: 'priya.verma@iitk.ac.in' },
  { name: 'Aman Sharma', email: 'aman.sharma@iitk.ac.in' },
  { name: 'Rohan Gupta', email: 'rohan.gupta@iitk.ac.in' },
  { name: 'Sneha Patel', email: 'sneha.patel@iitk.ac.in' },
  { name: 'Ananya Roy', email: 'ananya.roy@iitk.ac.in' },
];
export const requireSeedConfiguration = () => {
  if (!process.env.SEED_USER_PASSWORD) throw new Error('SEED_USER_PASSWORD is required.');
};

export const ensureSeedUsers = async () => {
  const accounts = [];
  for (const seededUser of seedUsers) {
    let user = await User.findOne({ email: seededUser.email });
    const created = !user;
    if (!user) {
      user = await User.create({
        name: seededUser.name,
        email: seededUser.email,
        password: await bcrypt.hash(process.env.SEED_USER_PASSWORD, 10),
        emailVerified: true,
        hall: 'Hall 1',
        year: 'Y22',
      });
    }
    accounts.push({ ...seededUser, user, created });
  }
  return accounts;
};

export const seedDemoData = async () => {
  const accounts = await ensureSeedUsers();
  const sellersByEmail = Object.fromEntries(accounts.map(({ email, user }) => [email, user]));
  const products = [];
  for (const { sellerEmail, ...listing } of seedProducts) {
    const seller = sellersByEmail[sellerEmail];
    const existing = await Product.findOne({ sellerId: seller._id, name: listing.name });
    if (!existing) {
      products.push(await Product.create({
        ...listing,
        sellerId: seller._id,
      }));
    }
  }
  return { accounts, products };
};

const seed = async () => {
  requireSeedConfiguration();
  await connectDB();
  try {
    const { accounts, products } = await seedDemoData();
    console.info(`Users: ${accounts.filter(({ created }) => created).length} created, ${accounts.filter(({ created }) => !created).length} reused.`);
    console.info(`Sample listings inserted: ${products.length}. Existing sample listings were skipped.`);
  } finally {
    await mongoose.disconnect();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  dotenv.config();
  seed().catch((error) => {
    console.error('Product seeding failed:', error);
    process.exitCode = 1;
  });
}
