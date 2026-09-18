'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminForgotPassword, adminVerifyRecoveryOtp, adminResendRecoveryOtp, adminResetPassword } from '@/lib/api';
import { ApiError } from '@/lib/api';

type Step = 'request' | 'verify' | 'reset' | 'done';

export default function AdminForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    setLoading(true);
    try {
      const res = await adminForgotPassword(email);
      setMessage(res.message || 'Recovery code sent to your email.');
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    setLoading(true);
    try {
      const res = await adminVerifyRecoveryOtp(email, otp);
      setResetToken(res.reset_token);
      setStep('reset');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(''); setMessage('');
    setLoading(true);
    try {
      const res = await adminResendRecoveryOtp(email);
      setMessage(res.message || 'Code resent.');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await adminResetPassword(resetToken, password, confirmPassword);
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh' }}>
      <div className="auth-card card">
        {step === 'request' && (
          <>
            <h1 className="auth-title">Forgot Password</h1>
            <p className="auth-subtitle">Enter your admin email to receive a recovery code</p>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            <form className="auth-form" onSubmit={handleRequest}>
              <div className="form-field">
                <span>Email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
              </div>
              <button className="btn btn-primary auth-submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send Code'}
              </button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <h1 className="auth-title">Verify Code</h1>
            <p className="auth-subtitle">Enter the recovery code emailed to you</p>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            <form className="auth-form" onSubmit={handleVerify}>
              <div className="form-field">
                <span>Recovery Code</span>
                <input type="text" required value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" className="otp-input" maxLength={6} />
              </div>
              <button className="btn btn-primary auth-submit" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
            <div className="auth-footer-text">
              <button className="auth-link" onClick={handleResend} disabled={loading}>
                Resend code
              </button>
            </div>
          </>
        )}

        {step === 'reset' && (
          <>
            <h1 className="auth-title">Reset Password</h1>
            <p className="auth-subtitle">Choose a new strong password</p>
            {error && <div className="auth-error">{error}</div>}
            <form className="auth-form" onSubmit={handleReset}>
              <div className="form-field">
                <span>New Password</span>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="≥8 chars, upper+lower+number+special" />
              </div>
              <div className="form-field">
                <span>Confirm Password</span>
                <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
              </div>
              <button className="btn btn-primary auth-submit" disabled={loading}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className="auth-title">Password Reset</h1>
            <div className="auth-success" style={{ marginTop: '1rem' }}>
              Your password has been reset successfully.
            </div>
            <div className="auth-footer-text">
              <Link href="/admin/sign-in" className="auth-link">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
