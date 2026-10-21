import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import connectDB from './config/db.js';
import { seedSampleProducts } from './services/productSeeder.js';
import User from './models/User.js';

const seedUsers = [
  { name: 'Priya Verma', email: 'priya.verma@iitk.ac.in', sellerName: 'Priya Verma (Y22)' },
  { name: 'Aman Sharma', email: 'aman.sharma@iitk.ac.in', sellerName: 'Aman Sharma (Y22)' },
  { name: 'Rohan Gupta', email: 'rohan.gupta@iitk.ac.in', sellerName: 'Rohan Gupta (Y22)' },
  { name: 'Sneha Patel', email: 'sneha.patel@iitk.ac.in', sellerName: 'Sneha Patel (Y22)' },
  { name: 'Ananya Roy', email: 'ananya.roy@iitk.ac.in', sellerName: 'Ananya Roy (Y22)' },
];
export const requireSeedConfiguration = () => {
  if (!process.env.SEED_USER_PASSWORD) throw new Error('SEED_USER_PASSWORD is required.');
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Set ALLOW_PRODUCTION_SEED=true to authorize production seeding.');
  }
};

export const ensureSeedUsers = async () => {
  await User.init();
  const accounts = [];

  for (const seededUser of seedUsers) {
    const matches = await User.find({ $or: [{ email: seededUser.email }, { name: seededUser.name }] }).limit(3).lean();
    const byEmail = matches.find((user) => user.email === seededUser.email);
    const byName = matches.filter((user) => user.name === seededUser.name);
    if (byName.length > 1) throw new Error(`More than one account uses the seeded name ${seededUser.name}.`);
    if (byEmail && byEmail.name !== seededUser.name) throw new Error(`The seeded email ${seededUser.email} belongs to a different name.`);
    if (byEmail && byName[0] && String(byEmail._id) !== String(byName[0]._id)) {
      throw new Error(`The seeded email and name for ${seededUser.name} belong to different accounts.`);
    }

    const existing = byEmail || byName[0];
    if (existing?.emailVerified === false) {
      throw new Error(`The existing ${seededUser.name} account is unverified; its credentials were left unchanged.`);
    }
    accounts.push(existing ? { ...seededUser, user: existing, created: false } : null);
  }

  for (let index = 0; index < seedUsers.length; index += 1) {
    if (accounts[index]) continue;
    const seededUser = seedUsers[index];
    const user = await User.create({
      name: seededUser.name,
      email: seededUser.email,
      password: await bcrypt.hash(process.env.SEED_USER_PASSWORD, 10),
      emailVerified: true,
      hall: 'Hall 1',
      year: 'Y22',
    });
    accounts[index] = { ...seededUser, user, created: true };
  }

  return accounts;
};

const seed = async () => {
  requireSeedConfiguration();
  await connectDB();
  try {
    const accounts = await ensureSeedUsers();
    const sellerIdsByName = Object.fromEntries(accounts.map(({ sellerName, user }) => [sellerName, String(user._id)]));
    const { inserted, skipped } = await seedSampleProducts(sellerIdsByName);
    console.info(`Users: ${accounts.filter(({ created }) => created).length} created, ${accounts.filter(({ created }) => !created).length} reused.`);
    for (const { name, user } of accounts) console.info(`${name}: ${user.email}${user.emailVerified === false ? ' (unverified)' : ''}`);
    console.info(`Seeded products: ${inserted} inserted, ${skipped} already present; listings linked to User IDs.`);
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
