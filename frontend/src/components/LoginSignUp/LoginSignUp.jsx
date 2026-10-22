import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useShop } from '../../context/ShopContext';
import { HALLS } from '../../utils/api';
import iitkLogo from '../../assets/iitk_logo.jpeg';

const LoginSignUpComponent = () => {
  const { login, register, requestOTP, verifyOTP } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    hall: 'Hall 1',
    year: 'Y21',
    otp: '',
  });

  const isIITKEmail = form.email.toLowerCase().trim().endsWith('@iitk.ac.in');

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'email') {
      setOtpSent(false);
      setOtpVerified(false);
      setForm((prev) => ({ ...prev, otp: '' }));
    }
  };

  const handleSendOTP = async () => {
    if (!isIITKEmail) {
      toast.error('Please enter your valid @iitk.ac.in email address');
      return;
    }
    setLoading(true);
    try {
      const result = await requestOTP(form.email);
      setOtpSent(true);
      setResendCooldown(Number(result?.cooldownSeconds) || 60);
      toast.success('Check your email for the verification code.');
    } catch (err) {
      const errorMessage = err.message || 'Failed to send OTP';
      
      // Auto-switch mode to login if user already exists
      if (errorMessage.toLowerCase().includes('already exists') || errorMessage.toLowerCase().includes('registered')) {
        toast.error('Profile already exists! Switching to login mode.');
        setMode('login');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!form.otp.trim()) {
      toast.error('Please enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      await verifyOTP(form.email, form.otp);
      setOtpVerified(true);
      toast.success('Email verified successfully!');
    } catch (err) {
      const errorMessage = err.message || 'Invalid OTP';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isIITKEmail) {
      toast.error('Only @iitk.ac.in emails are allowed to access campus marketplace.');
      return;
    }
    if (mode === 'signup' && !otpVerified) {
      toast.error('Please request and verify your OTP first');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      const errorMessage = err.message || 'Authentication failed';
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
            {mode === 'login' ? 'Welcome Back' : 'Join IITK Campus Marketplace'}
          </h1>
          <p className="text-slate-500 text-xs mt-1.5">
            Sign in with your IITK campus email to list items and chat with sellers
          </p>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              mode === 'login' ? 'bg-white shadow-sm text-navy' : 'text-slate-500 hover:text-navy'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              mode === 'signup' ? 'bg-white shadow-sm text-navy' : 'text-slate-500 hover:text-navy'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="relative">
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Full Name"
                required
                className="input-field text-sm"
              />
            </div>
          )}

          <div className="relative">
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="username@iitk.ac.in"
              required
              className={`input-field text-sm ${
                form.email && !isIITKEmail ? 'border-red-400 focus:ring-red-200' : ''
              }`}
            />
          </div>
          {form.email && !isIITKEmail && (
            <p className="text-[11px] text-red-500 font-medium">⚠️ Email must end with @iitk.ac.in</p>
          )}

          {mode === 'signup' && (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    name="otp"
                    value={form.otp}
                    onChange={handleChange}
                    placeholder="6-digit OTP"
                    className="input-field text-sm"
                  />
                </div>
                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendOTP}
                    disabled={loading || !isIITKEmail}
                    className="btn-secondary text-xs px-3 shrink-0"
                  >
                    Send OTP
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleVerifyOTP}
                    disabled={loading || otpVerified}
                    className="btn-secondary text-xs px-3 shrink-0"
                  >
                    {otpVerified ? 'Verified ✓' : 'Verify'}
                  </button>
                )}
              </div>
              {otpSent && !otpVerified && (
                <p className="text-xs text-slate-500">
                  {resendCooldown > 0 ? (
                    <>Didn&apos;t receive the code? Resend available in {resendCooldown}s</>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOTP}
                      disabled={loading}
                      className="text-royal font-semibold hover:underline disabled:opacity-50"
                    >
                      Resend OTP
                    </button>
                  )}
                </p>
              )}
              {otpVerified && <p className="text-xs text-emerald-600 font-semibold">Email verified — you can create your account.</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <select name="hall" value={form.hall} onChange={handleChange} className="input-field text-sm">
                    {HALLS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <input
                    name="year"
                    value={form.year}
                    onChange={handleChange}
                    placeholder="Batch (e.g. Y21)"
                    className="input-field text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {/* Password Section */}
          <div>
            <div className="relative">
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Password (8+ characters, letters and numbers)"
                required
                minLength={8}
                maxLength={128}
                className="input-field text-sm"
              />
            </div>

            {/* Forgot Password Link in Login Mode */}
            {mode === 'login' && (
              <div className="flex justify-end mt-1.5">
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                >
                  Forgot Password?
                </Link>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full text-sm py-3 mt-2 shadow-lg">
            {loading ? 'Processing...' : mode === 'login' ? 'Login with IITK Mail' : 'Create Student Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          {mode === 'login' ? (
            <>
              New to IITK Marketplace?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-royal font-bold hover:underline ml-1"
              >
                Sign up here
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-royal font-bold hover:underline ml-1"
              >
                Log in here
              </button>
            </>
          )}
        </p>

        <Link to="/" className="block text-center text-xs text-slate-400 mt-4 hover:text-royal font-medium">
          ← Return to Marketplace Home
        </Link>
      </motion.div>
    </div>
  );
};

export default LoginSignUpComponent;
