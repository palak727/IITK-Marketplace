import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import OTPVerification from '../models/OTPVerification.js';

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
export const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;
const REQUEST_COOLDOWN_MS = OTP_REQUEST_COOLDOWN_MS;
const MAX_REQUESTS_PER_WINDOW = 5;
export const MAX_OTP_ATTEMPTS = 5;

export class OTPError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const hashOTP = (email, purpose, otp) => {
  const pepper = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!pepper) throw new OTPError('OTP verification is not configured.', 503);
  return createHmac('sha256', pepper).update(`${purpose}:${email}:${otp}`).digest('hex');
};

const matchesOTP = (recordHash, email, purpose, otp) => {
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp) || !recordHash) return false;
  const candidate = Buffer.from(hashOTP(email, purpose, otp), 'hex');
  const stored = Buffer.from(recordHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
};

const checkRequestLimit = (record, now) => {
  if (record && now - new Date(record.createdAt).getTime() < REQUEST_COOLDOWN_MS) {
    throw new OTPError('Please wait before requesting another code.', 429);
  }
  if (record && now - new Date(record.requestWindowStartedAt).getTime() < REQUEST_WINDOW_MS &&
      record.requestCount >= MAX_REQUESTS_PER_WINDOW) {
    throw new OTPError('Too many code requests. Please try again later.', 429);
  }
};

export const createOTP = () => String(randomInt(100000, 1000000));

export const issueOTP = async (email, purpose) => {
  const now = new Date();
  const otp = createOTP();
  const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS);
  const codeHash = hashOTP(email, purpose, otp);

  const current = await OTPVerification.findOne({ email, purpose }).lean();
  checkRequestLimit(current, now.getTime());

  const windowActive = current && now.getTime() - new Date(current.requestWindowStartedAt).getTime() < REQUEST_WINDOW_MS;
  const values = {
    codeHash,
    expiresAt,
    attempts: 0,
    verifiedAt: null,
    consumedAt: null,
    createdAt: now,
    requestWindowStartedAt: windowActive ? current.requestWindowStartedAt : now,
    requestCount: windowActive ? current.requestCount + 1 : 1,
    purgeAt: new Date(now.getTime() + 24 * REQUEST_WINDOW_MS),
  };

  if (!current) {
    try {
      await OTPVerification.create({ email, purpose, ...values });
    } catch (error) {
      if (error.code === 11000) throw new OTPError('Please wait before requesting another code.', 429);
      throw error;
    }
    return otp;
  }

  const updated = await OTPVerification.findOneAndUpdate(
    { _id: current._id, requestCount: current.requestCount, createdAt: current.createdAt },
    { $set: values },
    { new: true }
  );
  if (!updated) throw new OTPError('Please wait before requesting another code.', 429);
  return otp;
};

export const cancelOTP = async (email, purpose, otp) => {
  const codeHash = hashOTP(email, purpose, otp);
  const result = await OTPVerification.deleteOne({ email, purpose, codeHash });
  return result.deletedCount === 1;
};

export const verifyOTP = async (email, purpose, otp) => {
  const now = new Date();
  const record = await OTPVerification.findOne({ email, purpose }).lean();
  if (!record || record.consumedAt || record.verifiedAt || record.expiresAt <= now || record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new OTPError('Invalid or expired OTP.');
  }

  if (!matchesOTP(record.codeHash, email, purpose, otp)) {
    await OTPVerification.updateOne(
      { _id: record._id, attempts: { $lt: MAX_OTP_ATTEMPTS }, verifiedAt: null, consumedAt: null, expiresAt: { $gt: now } },
      { $inc: { attempts: 1 }, ...(record.attempts >= MAX_OTP_ATTEMPTS - 1 ? { $set: { expiresAt: now } } : {}) }
    );
    throw new OTPError('Invalid or expired OTP.');
  }

  const result = await OTPVerification.updateOne(
    { _id: record._id, attempts: record.attempts, verifiedAt: null, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { verifiedAt: now, codeHash: null } }
  );
  if (result.modifiedCount !== 1) throw new OTPError('Invalid or expired OTP.');
  return true;
};

export const consumeVerifiedOTP = async (email, purpose) => {
  const now = new Date();
  const result = await OTPVerification.updateOne(
    { email, purpose, verifiedAt: { $ne: null }, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } }
  );
  if (result.modifiedCount !== 1) throw new OTPError('A valid, verified email code is required.');
  return true;
};

export const consumeOTP = async (email, purpose, otp) => {
  const now = new Date();
  const record = await OTPVerification.findOne({ email, purpose }).lean();
  if (!record || record.consumedAt || record.verifiedAt || record.expiresAt <= now || record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new OTPError('Invalid or expired OTP.');
  }
  if (!matchesOTP(record.codeHash, email, purpose, otp)) {
    await OTPVerification.updateOne(
      { _id: record._id, attempts: { $lt: MAX_OTP_ATTEMPTS }, consumedAt: null, verifiedAt: null, expiresAt: { $gt: now } },
      { $inc: { attempts: 1 }, ...(record.attempts >= MAX_OTP_ATTEMPTS - 1 ? { $set: { expiresAt: now } } : {}) }
    );
    throw new OTPError('Invalid or expired OTP.');
  }
  const result = await OTPVerification.updateOne(
    { _id: record._id, attempts: record.attempts, consumedAt: null, verifiedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now, codeHash: null } }
  );
  if (result.modifiedCount !== 1) throw new OTPError('Invalid or expired OTP.');
  return true;
};