import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { validateJWTConfig } from '../middleware/auth.js';

const savedEnvironment = { ...process.env };
const restoreEnvironment = () => {
  for (const key of Object.keys(process.env)) if (!(key in savedEnvironment)) delete process.env[key];
  Object.assign(process.env, savedEnvironment);
};

test('MongoDB URI is mandatory in every environment', async () => {
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.MONGO_URI;
    await assert.rejects(connectDB(), /MONGO_URI is required/);

    process.env.NODE_ENV = 'development';
    process.env.MONGO_URI = 'mongodb://<username>:<password>@localhost/database';
    await assert.rejects(connectDB(), /MONGO_URI is required/);
  } finally {
    restoreEnvironment();
  }
});

test('MongoDB connection failures are propagated instead of falling back', async () => {
  const originalConnect = mongoose.connect;
  const savedUri = process.env.MONGO_URI;
  const savedMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = 'mongodb://localhost:27017/unavailable';
    mongoose.connect = async () => { throw new Error('connection refused'); };
    await assert.rejects(connectDB(), /MongoDB connection failed: connection refused/);
  } finally {
    mongoose.connect = originalConnect;
    if (savedUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = savedUri;
    if (savedMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedMode;
  }
});

test('production requires a sufficiently strong JWT secret', () => {
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(validateJWTConfig, /JWT_SECRET/);
    process.env.JWT_SECRET = 'x'.repeat(32);
    assert.doesNotThrow(validateJWTConfig);
  } finally {
    restoreEnvironment();
  }
});
