import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Mail, ShieldCheck, KeyRound, Lock, ArrowLeft } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import iitkLogo from '../assets/iitk_logo.jpeg';

const ForgotPassword = () => {
  const { requestResetOTP, resetPassword } = useShop();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Send OTP, 2: Reset Password
  const [loading, setLoading] = useState(false);

  const isIITKEmail = email.toLowerCase().trim().endsWith('@iitk.ac.in');

  // Step 1: Send OTP to IITK Email
  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!isIITKEmail) {
      toast.error('Please enter a valid @iitk.ac.in email address');
      return;
    }
    setLoading(true);
    try {
      const result = await requestResetOTP(email);
      toast.success(result?.message || 'Sending OTP....');
      setStep(2);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to send OTP';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and Set New Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      toast.error('Please enter the OTP');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      toast.error('Password must be 8-128 characters and include letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (resetPassword) {
        await resetPassword({ email, otp, newPassword });
      }
      toast.success('Password reset successfully! Please log in.');
      navigate('/login');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to reset password';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center px-4 py-12 bg-linear-to-br from-slate-50 via-blue-50/50 to-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-md p-8 shadow-xl border border-slate-200"
      >
        <div className="text-center mb-6">
          <img
            src={iitkLogo}
            alt="IIT Kanpur Logo"
            className="w-14 h-14 object-contain mx-auto mb-3"
          />
          <h1 className="text-2xl font-bold text-navy">
            {step === 1 ? 'Reset Password' : 'Set New Password'}
          </h1>
          <p className="text-slate-500 text-xs mt-1.5 flex items-center justify-center gap-1">
            <ShieldCheck size={14} className="text-emerald-500" />
            Verified @iitk.ac.in webmail accounts only
          </p>
        </div>

        {step === 1 ? (
          /* STEP 1 FORM: Enter Email */
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">IITK Webmail</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="username@iitk.ac.in"
                  required
                  className={`input-field pl-10 text-sm ${
                    email && !isIITKEmail ? 'border-red-400 focus:ring-red-200' : ''
                  }`}
                />
              </div>
              {email && !isIITKEmail && (
                <p className="text-[11px] text-red-500 font-medium mt-1"> Email must end with @iitk.ac.in</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !isIITKEmail}
              className="btn-primary w-full text-sm py-3 shadow-lg"
            >
              {loading ? 'Sending OTP...' : 'Send Reset Code'}
            </button>
          </form>
        ) : (
          /* STEP 2 FORM: Enter OTP & New Password */
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">6-Digit OTP</label>
              <div className="relative">
                <KeyRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter the 6-digit code if it arrives"
                  required
                  className="input-field pl-10 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">New Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8+ characters with letters and numbers"
                  required
                  minLength={8}
                  maxLength={128}
                  className="input-field pl-10 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Confirm New Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="input-field pl-10 text-sm"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full text-sm py-3 shadow-lg">
              {loading ? 'Updating Password...' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-xs text-slate-500 hover:underline text-center block mt-2"
            >
              Change Email / Resend OTP
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-royal font-medium transition"
          >
            <ArrowLeft size={14} /> Back to Login
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;