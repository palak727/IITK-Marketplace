import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { isIITKEmail, register, login } from '../controllers/authController.js';
import { resetMongo } from './mongoMock.js';

test('IITK email validation accepts valid campus email', () => {
  assert.equal(isIITKEmail('student@iitk.ac.in'), true);
});

test('IITK email validation rejects non-campus email', () => {
  assert.equal(isIITKEmail('student@gmail.com'), false);
});

test('register rejects invalid non-IITK email', async () => {
  resetMongo();

  let payload;
  await register(
    { body: { name: 'Test User', email: 'student@gmail.com', password: 'password123' } },
    { status(code) { this.code = code; return this; }, json(data) { payload = data; } }
  );

  assert.equal(payload.message.includes('Only @iitk.ac.in'), true);
});

test('login succeeds for a valid MongoDB user', async () => {
  resetMongo();
  const password = 'secret123';
  const hashed = await bcrypt.hash(password, 10);
  await User.create({
    name: 'Alice',
    email: 'alice@iitk.ac.in',
    password: hashed,
    hall: 'Hall 1',
    year: 'Y22',
  });

  let tokenPayload;
  await login(
    { body: { email: 'alice@iitk.ac.in', password } },
    { json(data) { tokenPayload = data; } }
  );

  assert.ok(tokenPayload.token);
  assert.equal(tokenPayload.user.email, 'alice@iitk.ac.in');
});
