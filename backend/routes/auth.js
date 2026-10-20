import express from 'express';
import {
  requestOTP,
  verifyOTP,
  register,
  login,
  getMe,
  requestResetOTP,
  resetPasswordWithOTP,
} from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/otp/request', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }), requestOTP);
router.post('/otp/verify', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 25 }), verifyOTP);
router.post('/reset-otp/request', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }), requestResetOTP);
router.post('/reset-password', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }), resetPasswordWithOTP);
router.post('/register', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }), register);
router.post('/login', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 }), login);
router.get('/me', authMiddleware, getMe);

export default router;
export { requestOTP, verifyOTP, register, login, getMe, requestResetOTP, resetPasswordWithOTP };
