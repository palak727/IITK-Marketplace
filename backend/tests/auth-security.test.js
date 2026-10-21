import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { isIITKEmail, register, login, requestResetOTP } from '../controllers/authController.js';
import { generateToken, getAuthenticatedUser, authMiddleware } from '../middleware/auth.js';
import { setupProductRoutes } from '../routes/products.js';
import { setupChatRoutes } from '../routes/chat.js';
import { mongoCollections, resetMongo } from './mongoMock.js';
import { consumeVerifiedOTP, issueOTP, verifyOTP as verifyOTPCode } from '../services/otpService.js';
import { ensureSeedUsers, requireSeedConfiguration } from '../seed.js';

process.env.OTP_SECRET ||= 'test-otp-secret';

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return payload; },
});

const makeUser = (values) => User.create({
  name: values.name || 'Test Student',
  email: values.email,
  password: values.password || 'hashed-password',
  ...values,
});

test('registration is rejected without a verified registration OTP', async () => {
  resetMongo();
  const res = response();
  await register({ body: { name: 'Test Student', email: 'signup1@iitk.ac.in', password: 'student123' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(mongoCollections.User.length, 0);
});

test('registration accepts only IITK email addresses', async () => {
  resetMongo();
  const res = response();
  await register({ body: { name: 'Test Student', email: 'student@gmail.com', password: 'student123' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(mongoCollections.User.length, 0);
  assert.equal(isIITKEmail('student@iitk.ac.in'), true);
});

test('verified registration OTP is purpose-bound and consumed by registration', async () => {
  resetMongo();
  const code = await issueOTP('signup2@iitk.ac.in', 'register');
  assert.notEqual(mongoCollections.OTPVerification[0].codeHash, code);
  await verifyOTPCode('signup2@iitk.ac.in', 'register', code);

  const res = response();
  await register({ body: { name: 'Test Student', email: 'signup2@iitk.ac.in', password: 'student123', hall: 'Hall 1' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(mongoCollections.User[0].emailVerified, true);
  await assert.rejects(consumeVerifiedOTP('signup2@iitk.ac.in', 'register'));
});

test('an OTP remains valid across backend instances when they share the configured secret', async () => {
  resetMongo();
  const previousSecret = process.env.OTP_SECRET;
  process.env.OTP_SECRET = 'stable-test-otp-secret';
  try {
    const code = await issueOTP('restart@iitk.ac.in', 'register');
    const anotherInstance = await import('../services/otpService.js?separate-instance');
    await anotherInstance.verifyOTP('restart@iitk.ac.in', 'register', code);
    assert.ok(mongoCollections.OTPVerification[0].verifiedAt);
  } finally {
    if (previousSecret === undefined) delete process.env.OTP_SECRET;
    else process.env.OTP_SECRET = previousSecret;
  }
});

test('OTP cannot be transferred between email addresses or purposes', async () => {
  resetMongo();
  const resetCode = await issueOTP('signup3@iitk.ac.in', 'reset');
  await assert.rejects(verifyOTPCode('signup3@iitk.ac.in', 'register', resetCode));
  await verifyOTPCode('signup3@iitk.ac.in', 'reset', resetCode);
  await assert.rejects(consumeVerifiedOTP('signup3@iitk.ac.in', 'register'));

  const registrationCode = await issueOTP('signup4@iitk.ac.in', 'register');
  await verifyOTPCode('signup4@iitk.ac.in', 'register', registrationCode);
  await assert.rejects(consumeVerifiedOTP('signup5@iitk.ac.in', 'register'));
});

test('expired and over-attempted OTPs are rejected', async () => {
  resetMongo();
  const expiredCode = await issueOTP('signup6@iitk.ac.in', 'register');
  mongoCollections.OTPVerification[0].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(verifyOTPCode('signup6@iitk.ac.in', 'register', expiredCode));

  const code = await issueOTP('signup7@iitk.ac.in', 'register');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(verifyOTPCode('signup7@iitk.ac.in', 'register', '000000'));
  }
  await assert.rejects(verifyOTPCode('signup7@iitk.ac.in', 'register', code));
});

test('resending a code invalidates the previous code and accepts the new one', async () => {
  resetMongo();
  const firstCode = await issueOTP('resend@iitk.ac.in', 'register');
  const record = mongoCollections.OTPVerification[0];
  record.createdAt = new Date(Date.now() - 61_000);

  const secondCode = await issueOTP('resend@iitk.ac.in', 'register');
  await assert.rejects(verifyOTPCode('resend@iitk.ac.in', 'register', firstCode));
  await verifyOTPCode('resend@iitk.ac.in', 'register', secondCode);
  assert.ok(record.verifiedAt);
});

test('reset OTP requests have the same response for known and unknown addresses', async () => {
  resetMongo();
  await makeUser({ email: 'known@iitk.ac.in' });
  const known = response();
  const unknown = response();
  await requestResetOTP({ body: { email: 'known@iitk.ac.in' } }, known);
  await requestResetOTP({ body: { email: 'unknown@iitk.ac.in' } }, unknown);
  assert.equal(known.statusCode, unknown.statusCode);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(mongoCollections.OTPVerification.length, 0);
});

test('login rejects explicitly unverified accounts and protected identity comes from MongoDB', async () => {
  resetMongo();
  const password = await bcrypt.hash('student123', 10);
  const unverified = await makeUser({ email: 'unverified@iitk.ac.in', password, emailVerified: false });
  const active = await makeUser({ email: 'active@iitk.ac.in', password, emailVerified: true });

  const rejected = response();
  await login({ body: { email: unverified.email, password: 'student123' } }, rejected);
  assert.equal(rejected.statusCode, 400);

  const accepted = response();
  await login({ body: { email: active.email, password: 'student123' } }, accepted);
  assert.ok(accepted.body.token);
  assert.equal((await getAuthenticatedUser(accepted.body.token)).id, String(active._id));

  const deletedToken = generateToken({ id: '0123456789abcdef01234567' });
  assert.equal(await getAuthenticatedUser(deletedToken), null);
});

test('newly seeded user can log in and use a protected route with the configured password', async () => {
  resetMongo();
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    allowProduction: process.env.ALLOW_PRODUCTION_SEED,
    password: process.env.SEED_USER_PASSWORD,
    jwtSecret: process.env.JWT_SECRET,
  };
  try {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_PRODUCTION_SEED = 'true';
    process.env.SEED_USER_PASSWORD = 'seed-login-test-2026';
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-characters';
    requireSeedConfiguration();
    const accounts = await ensureSeedUsers();
    const account = accounts[0].user;

    const wrongPassword = response();
    await login({ body: { email: account.email, password: 'incorrect-password' } }, wrongPassword);
    assert.equal(wrongPassword.statusCode, 400);

    const accepted = response();
    await login({ body: { email: ` ${account.email.toUpperCase()} `, password: process.env.SEED_USER_PASSWORD } }, accepted);
    assert.ok(accepted.body.token);
    assert.equal(accepted.body.user.id, String(account._id));

    const protectedResponse = response();
    let authorized = false;
    await authMiddleware({ headers: { authorization: `Bearer ${accepted.body.token}` } }, protectedResponse, () => {
      authorized = true;
    });
    assert.equal(authorized, true);
    assert.equal(protectedResponse.statusCode, 200);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.allowProduction === undefined) delete process.env.ALLOW_PRODUCTION_SEED;
    else process.env.ALLOW_PRODUCTION_SEED = previous.allowProduction;
    if (previous.password === undefined) delete process.env.SEED_USER_PASSWORD;
    else process.env.SEED_USER_PASSWORD = previous.password;
    if (previous.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous.jwtSecret;
    resetMongo();
  }
});

test('private product and chat routes register authentication middleware', () => {
  const routes = new Map();
  const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map((method) => [method, (path, ...handlers) => {
    routes.set(`${method.toUpperCase()} ${path}`, handlers);
  }]));
  setupProductRoutes(router);
  setupChatRoutes(router);

  for (const route of [
    'GET /seller/mine',
    'POST /',
    'PATCH /:id', 'PATCH /:id/status', 'DELETE /:id',
    'GET /my-conversations', 'GET /unread', 'GET /conversation/:conversationId',
    'POST /conversation/:conversationId/read', 'POST /send',
  ]) assert.ok(routes.get(route)?.includes(authMiddleware), `${route} must require authentication`);
});
