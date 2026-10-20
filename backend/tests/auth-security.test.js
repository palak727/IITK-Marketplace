import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { register, login, requestOTP, requestResetOTP } from '../controllers/authController.js';
import { generateToken, getAuthenticatedUser } from '../middleware/auth.js';
import { mongoCollections, resetMongo } from './mongoMock.js';
import { cancelOTP, consumeVerifiedOTP, issueOTP, verifyOTP as verifyOTPCode } from '../services/otpService.js';

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

test('failed signup email delivery reports an error and removes the unusable OTP', async () => {
  resetMongo();
  const gmailKeys = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_USER'];
  const saved = Object.fromEntries(gmailKeys.map((key) => [key, process.env[key]]));
  gmailKeys.forEach((key) => delete process.env[key]);

  try {
    const res = response();
    await requestOTP({ body: { email: 'delivery-failure@iitk.ac.in' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(mongoCollections.OTPVerification.length, 0);
  } finally {
    for (const key of gmailKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('cancelling an OTP only removes the matching pending code', async () => {
  resetMongo();
  const code = await issueOTP('cancel@iitk.ac.in', 'register');

  assert.equal(await cancelOTP('cancel@iitk.ac.in', 'register', '000000'), false);
  assert.equal(await cancelOTP('cancel@iitk.ac.uk', 'register', code), false);
  assert.equal(await cancelOTP('cancel@iitk.ac.in', 'register', code), true);
  await assert.rejects(verifyOTPCode('cancel@iitk.ac.in', 'register', code));
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
