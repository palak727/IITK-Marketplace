import mongoose from 'mongoose';

const otpVerificationSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ['register', 'reset'] },
    codeHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
    requestWindowStartedAt: { type: Date, required: true },
    requestCount: { type: Number, default: 1 },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpVerificationSchema.index({ email: 1, purpose: 1 }, { unique: true });
otpVerificationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.OTPVerification || mongoose.model('OTPVerification', otpVerificationSchema);