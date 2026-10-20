import bcrypt from 'bcryptjs';
import User, { ALLOWED_HALLS } from '../models/User.js';
import { generateToken } from '../middleware/auth.js';
import { enqueueEmail } from '../services/mailer.js';
import {cancelOTP, consumeOTP, consumeVerifiedOTP, issueOTP, OTPError, OTP_REQUEST_COOLDOWN_MS, verifyOTP as verifyOTPCode} from '../services/otpService.js';

export const validatePassword = (password) =>
  typeof password === 'string' && password.length >= 8 && password.length <= 128 &&
  /[A-Za-z]/.test(password) && /\d/.test(password);

const validateName = (name) =>
  typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80;

export const isIITKEmail = (email = '') =>
  typeof email === 'string' && /^[a-zA-Z0-9._%+-]+@iitk\.ac\.in$/i.test(email.trim());

// Registration OTP
export const requestOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isIITKEmail(email))
      return res.status(400).json({ message: 'A valid @iitk.ac.in email is required.' });

    const cleanEmail = email.toLowerCase().trim();
    if (await User.exists({ email: cleanEmail }))
      return res.status(400).json({ message: 'User with this IITK email already exists.' });

    const otp = await issueOTP(cleanEmail, 'register');

    try {
      await enqueueEmail({
        to: cleanEmail,
        subject: 'IITK Campus Marketplace - Email Verification OTP',
        html: `<div style="font-family:Arial,sans-serif;padding:20px;color:#1e293b">
          <h2 style="color:#1e3a8a">IITK Campus Marketplace</h2>
          <p>Your OTP verification code is:</p>
          <h1 style="color:#2563eb;letter-spacing:4px;font-size:32px">${otp}</h1>
          <p style="font-size:13px;color:#64748b">This OTP will expire in 10 minutes.</p>
        </div>`
      });
    } catch {
      await cancelOTP(cleanEmail, 'register', otp);
      return res.status(503).json({ message: 'Failed to send OTP. Please try again.' });
    }

    return res.json({
      message: 'OTP sent successfully!',
      cooldownSeconds: Math.ceil(OTP_REQUEST_COOLDOWN_MS / 1000)
    });
  } catch (error) {
    if (!(error instanceof OTPError)) console.error('Request OTP error:', error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'Failed to send OTP. Please try again.'
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: 'Email and OTP are required.' });
    if (typeof email !== 'string' || !isIITKEmail(email) || typeof otp !== 'string')
      return res.status(400).json({ message: 'Invalid or expired OTP.' });

    await verifyOTPCode(email.toLowerCase().trim(), 'register', otp.trim());
    return res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    if (!(error instanceof OTPError)) console.error('Verify OTP error:', error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'Unable to verify the OTP right now.'
    });
  }
};

// Forgot / Reset Password OTP
export const requestResetOTP = async (req, res) => {
  const genericResponse = {
    message: 'If the account exists, a reset code will be sent when email delivery is available.'
  };
  let cleanEmail;
  let otp;

  try {
    const { email } = req.body;
    if (!email || !isIITKEmail(email))
      return res.status(400).json({ message: 'A valid @iitk.ac.in email is required.' });

    cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail }).select('_id');

    if (!user) return res.json(genericResponse);

    otp = await issueOTP(cleanEmail, 'reset');

    await enqueueEmail({
      to: cleanEmail,
      subject: 'IITK Campus Marketplace - Password Reset Verification Code',
      html: `<div style="font-family:Arial,sans-serif;padding:20px;color:#1e293b">
        <h2 style="color:#1e3a8a">IITK Campus Marketplace</h2>
        <p>Your verification code to reset your password is:</p>
        <h1 style="color:#2563eb;letter-spacing:4px;font-size:32px">${otp}</h1>
        <p style="font-size:13px;color:#64748b">This OTP will expire in 10 minutes.</p>
      </div>`
    });

    return res.json(genericResponse);
  } catch (error) {
    if (otp && cleanEmail) {
      try {
        await cancelOTP(cleanEmail, 'reset', otp);
      } catch (cancelError) {
        console.error('Cancel reset OTP error:', cancelError);
      }
    }

    if (!(error instanceof OTPError)) console.error('Request Reset OTP error:', error);
    // Keep reset requests indistinguishable for existing and unknown accounts,
    // including mail failures and per-address cooldowns.
    return res.json(genericResponse);
  }
};

export const resetPasswordWithOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (typeof email !== 'string' || typeof otp !== 'string' || !newPassword)
      return res.status(400).json({ message: 'Email, OTP, and new password are required.' });

    const cleanEmail = email.toLowerCase().trim();
    if (!isIITKEmail(cleanEmail))
      return res.status(400).json({ message: 'Only @iitk.ac.in emails are allowed.' });

    if (!validatePassword(newPassword))
      return res.status(400).json({
        message: 'Password must be 8-128 characters and include letters and numbers.'
      });

    const user = await User.findOne({ email: cleanEmail }).select('_id');
    if (!user) return res.status(400).json({ message: 'Invalid or expired OTP.' });

    await consumeOTP(cleanEmail, 'reset', otp.trim());
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } },
      { runValidators: true }
    );

    return res.json({ message: 'Password updated successfully! Please log in.' });
  } catch (error) {
    if (!(error instanceof OTPError)) console.error('Reset Password error:', error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'Unable to reset the password right now.'
    });
  }
};

// Auth & User Account Actions
export const register = async (req, res) => {
  try {
    const { name, email, password, hall, year } = req.body;
    const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const cleanHall = typeof hall === 'string' ? hall.trim() : '';
    const cleanYear = typeof year === 'string' ? year.trim() : '';

    if (!validateName(name) || !cleanEmail || !password)
      return res.status(400).json({ message: 'Name, email, and password are required.' });

    if (!isIITKEmail(cleanEmail))
      return res.status(400).json({ message: 'Only @iitk.ac.in emails are allowed to register.' });

    if (!validatePassword(password))
      return res.status(400).json({
        message: 'Password must be 8-128 characters and include letters and numbers.'
      });

    if (!ALLOWED_HALLS.includes(cleanHall))
      return res.status(400).json({ message: 'Please select a valid IITK hall.' });

    if (year !== undefined && (typeof year !== 'string' || cleanYear.length > 20))
      return res.status(400).json({ message: 'Year must be at most 20 characters.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    if (await User.exists({ email: cleanEmail }))
      return res.status(400).json({ message: 'User with this IITK email already exists.' });

    await consumeVerifiedOTP(cleanEmail, 'register');

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      emailVerified: true,
      hall: cleanHall,
      year: cleanYear || 'Y21'
    });

    const token = generateToken({
      id: user._id.toString(), name: user.name, email: user.email, hall: user.hall
    });

    return res.status(201).json({
      token,
      user: {
        id: user._id.toString(), name: user.name, email: user.email,
        hall: user.hall, year: user.year
      }
    });
  } catch (error) {
    if (!(error instanceof OTPError)) console.error('Registration error:', error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'Unable to create the account right now.'
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';

    if (!cleanEmail || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    if (!isIITKEmail(cleanEmail))
      return res.status(400).json({ message: 'Only @iitk.ac.in emails are permitted.' });

    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user || user.emailVerified === false || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid IITK credentials.' });

    const token = generateToken({
      id: user._id.toString(), name: user.name, email: user.email, hall: user.hall
    });

    return res.json({
      token,
      user: {
        id: user._id.toString(), name: user.name, email: user.email,
        hall: user.hall, year: user.year
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Unable to log in right now.' });
  }
};

export const getMe = async (req, res) => res.json({ user: req.user });
