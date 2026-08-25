import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';
import { isMemoryMode, memoryStore } from '../store/memoryStore.js';
import { enqueueEmail } from '../services/mailer.js';

export const isIITKEmail = (email = '') => {
  return email.toLowerCase().trim().endsWith('@iitk.ac.in');
};

// -------------------------------------------------------------
// Registration OTP Handlers
// -------------------------------------------------------------

export const requestOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isIITKEmail(email)) {
      return res.status(400).json({ message: 'A valid @iitk.ac.in webmail is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check if user already exists
    let existingUser = false;
    if (isMemoryMode()) {
      existingUser = memoryStore.users.some((u) => u.email === cleanEmail);
    } else {
      existingUser = await User.findOne({ email: cleanEmail });
    }

    if (existingUser) {
      return res.status(400).json({ message: 'User with this IITK email already exists.' });
    }

    // 2. Generate and store 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    memoryStore.otps.set(`register_${cleanEmail}`, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    });

    // Do not hold the HTTP request open while SMTP connects from Render.
    enqueueEmail({
      from: process.env.RESEND_FROM || 'IITK Marketplace <onboarding@resend.dev>',
      to: cleanEmail,
      subject: 'IITK Campus Marketplace - Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #1e3a8a;">IITK Campus Marketplace</h2>
          <p>Your OTP verification code is:</p>
          <h1 style="color: #2563eb; letter-spacing: 4px; font-size: 32px;">${otp}</h1>
          <p style="font-size: 13px; color: #64748b;">This OTP will expire in 10 minutes.</p>
        </div>
      `,
    });

    return res.json({
      message: 'OTP sent to your IITK webmail address.',
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const record = memoryStore.otps.get(`register_${cleanEmail}`);

    if (!record || record.otp !== otp.toString().trim() || record.expiresAt < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    memoryStore.otps.delete(`register_${cleanEmail}`);

    return res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// -------------------------------------------------------------
// Forgot / Reset Password OTP Handlers
// -------------------------------------------------------------

export const requestResetOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isIITKEmail(email)) {
      return res.status(400).json({ message: 'A valid @iitk.ac.in webmail is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check if user exists
    let user = null;
    if (isMemoryMode()) {
      user = memoryStore.users.find((u) => u.email === cleanEmail);
    } else {
      user = await User.findOne({ email: cleanEmail });
    }

    if (!user) {
      return res.status(404).json({ message: 'No user registered with this email address.' });
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins

    if (isMemoryMode()) {
      memoryStore.otps.set(`reset_${cleanEmail}`, { otp, expiresAt });
    } else {
      user.resetOtp = otp;
      user.resetOtpExpire = expiresAt;
      await user.save();
    }

    enqueueEmail({
      from: process.env.RESEND_FROM || 'IITK Marketplace <onboarding@resend.dev>',
      to: cleanEmail,
      subject: 'IITK Campus Marketplace - Password Reset Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #1e3a8a;">IITK Campus Marketplace</h2>
          <p>Your verification code to reset your password is:</p>
          <h1 style="color: #2563eb; letter-spacing: 4px; font-size: 32px;">${otp}</h1>
          <p style="font-size: 13px; color: #64748b;">This OTP will expire in 10 minutes.</p>
        </div>
      `,
    });

    return res.json({
      message: 'Password reset OTP sent to your email.',
    });
  } catch (error) {
    console.error('Request Reset OTP error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isIITKEmail(cleanEmail)) {
      return res.status(400).json({ message: 'Only @iitk.ac.in emails are allowed.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (isMemoryMode()) {
      const user = memoryStore.users.find((u) => u.email === cleanEmail);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const record = memoryStore.otps.get(`reset_${cleanEmail}`);
      if (!record || record.otp !== otp.toString().trim() || record.expiresAt < Date.now()) {
        return res.status(400).json({ message: 'Invalid or expired OTP.' });
      }

      user.password = hashedPassword;
      memoryStore.otps.delete(`reset_${cleanEmail}`);
      if (typeof memoryStore.save === 'function') memoryStore.save();

      return res.json({ message: 'Password updated successfully! Please log in.' });
    }

    // Database Mode
    const user = await User.findOne({ email: cleanEmail });
    if (!user || !user.resetOtp) {
      return res.status(400).json({ message: 'Invalid request or expired OTP.' });
    }

    if (user.resetOtp !== otp.toString().trim() || Date.now() > user.resetOtpExpire) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetOtp: '', resetOtpExpire: '' },
      }
    );

    return res.json({ message: 'Password updated successfully! Please log in.' });
  } catch (error) {
    console.error('Reset Password error:', error);
    return res.status(500).json({ message: error.message });
  }
};

// -------------------------------------------------------------
// Auth & User Account Actions
// -------------------------------------------------------------

export const register = async (req, res) => {
  try {
    const { name, email, password, hall, year } = req.body;
    const cleanEmail = email?.toLowerCase().trim();

    if (!name || !cleanEmail || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (!isIITKEmail(cleanEmail)) {
      return res.status(400).json({ message: 'Only @iitk.ac.in emails are allowed to register.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (isMemoryMode()) {
      const existing = memoryStore.users.find((u) => u.email === cleanEmail);
      if (existing) {
        return res.status(400).json({ message: 'User with this IITK email already exists.' });
      }

      const userId = `user-${Date.now()}`;
      const newUser = {
        _id: userId,
        id: userId,
        name,
        email: cleanEmail,
        password: hashedPassword,
        hall: hall || 'Hall 1',
        year: year || 'Y21',
        isOnline: true,
        lastSeen: new Date(),
      };

      memoryStore.users.push(newUser);
      if (typeof memoryStore.save === 'function') memoryStore.save();

      const token = generateToken({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        hall: newUser.hall,
      });

      return res.status(201).json({
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          hall: newUser.hall,
          year: newUser.year,
        },
      });
    }

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ message: 'User with this IITK email already exists.' });
    }

    const user = await User.create({
      name,
      email: cleanEmail,
      password: hashedPassword,
      hall: hall || 'Hall 1',
      year: year || 'Y21',
    });

    const token = generateToken({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      hall: user.hall,
    });

    return res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        hall: user.hall,
        year: user.year,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email?.toLowerCase().trim();

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (!isIITKEmail(cleanEmail)) {
      return res.status(400).json({ message: 'Only @iitk.ac.in emails are permitted.' });
    }

    if (isMemoryMode()) {
      const user = memoryStore.users.find((u) => u.email === cleanEmail);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ message: 'Invalid IITK credentials.' });
      }

      const userId = user.id || user._id;
      const token = generateToken({
        id: userId,
        name: user.name,
        email: user.email,
        hall: user.hall,
      });

      return res.json({
        token,
        user: {
          id: userId,
          name: user.name,
          email: user.email,
          hall: user.hall,
          year: user.year,
        },
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid IITK credentials.' });
    }

    const token = generateToken({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      hall: user.hall,
    });

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        hall: user.hall,
        year: user.year,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const getMe = async (req, res) => {
  return res.json({ user: req.user });
};
