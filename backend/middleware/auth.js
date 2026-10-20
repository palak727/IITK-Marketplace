import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';

const DEVELOPMENT_JWT_SECRET = randomBytes(32).toString('hex');

const getJWTSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production.');
  return DEVELOPMENT_JWT_SECRET;
};

export const validateJWTConfig = () => {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, getJWTSecret());
  } catch {
    return null;
  }
};

export const generateToken = (payload) => {
  return jwt.sign(payload, getJWTSecret(), { expiresIn: '7d' });
};

export const getAuthenticatedUser = async (token) => {
  const decoded = verifyToken(token);
  if (!decoded?.id) return null;

  if (mongoose.connection.readyState !== 1) throw new Error('Database unavailable');
  if (!mongoose.isValidObjectId(decoded.id)) return null;
  const user = await User.findById(decoded.id).select('name email hall year emailVerified').lean();
  if (!user || user.emailVerified === false) return null;
  return { ...decoded, id: String(user._id), name: user.name, email: user.email, hall: user.hall, year: user.year };
};

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required. Please login.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const user = await getAuthenticatedUser(token);
    if (!user) return res.status(401).json({ message: 'Invalid or expired token.' });
    req.user = user;
    return next();
  } catch {
    return res.status(503).json({ message: 'Authentication service temporarily unavailable.' });
  }
};
