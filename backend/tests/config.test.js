import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { validateJWTConfig } from '../middleware/auth.js';
import { isMailerConfigured } from '../services/mailer.js';

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

test('production frontend build requires explicit public API and socket URLs', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const viteConfig = readFileSync(join(root, 'frontend', 'vite.config.js'), 'utf8');
  const envExample = readFileSync(join(root, 'frontend', '.env.example'), 'utf8');
  assert.match(viteConfig, /VITE_API_BASE_URL/);
  assert.match(viteConfig, /VITE_SOCKET_URL/);
  assert.match(envExample, /VITE_API_BASE_URL=/);
  assert.match(envExample, /VITE_SOCKET_URL=/);
  assert.doesNotMatch(envExample, /GMAIL_/);
});

test('production requires a sufficiently strong JWT secret and Gmail settings are complete-only', () => {
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(validateJWTConfig, /JWT_SECRET/);
    process.env.JWT_SECRET = 'x'.repeat(32);
    assert.doesNotThrow(validateJWTConfig);

    for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_USER']) delete process.env[key];
    assert.equal(isMailerConfigured(), false);
    process.env.GMAIL_CLIENT_ID = 'client-id-placeholder';
    process.env.GMAIL_CLIENT_SECRET = 'client-secret-placeholder';
    process.env.GMAIL_REFRESH_TOKEN = 'refresh-token-placeholder';
    process.env.GMAIL_USER = 'sender@example.com';
    assert.equal(isMailerConfigured(), true);
  } finally {
    restoreEnvironment();
  }
});
