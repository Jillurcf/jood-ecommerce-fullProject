'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminVerifyOtp, adminResendOtp } from '@/lib/api';
import { ApiError } from '@/lib/api';

export default function AdminVerifyOtpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminVerifyOtp(email, otp);
      router.push('/admin');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSending(true);
    try {
      const res = await adminResendOtp(email);
      setMessage(res.message || 'OTP resent.');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not resend OTP.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh' }}>
      <div className="auth-card card">
        <h1 className="auth-title">Verify OTP</h1>
        <p className="auth-subtitle">Enter the one-time code sent to your email</p>
        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div className="form-field">
            <span>OTP Code</span>
            <input
              type="text"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="otp-input"
              maxLength={6}
            />
          </div>
          <button className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify & Sign In'}
          </button>
        </form>
        <div className="auth-footer-text">
          <button className="auth-link" onClick={handleResend} disabled={sending || !email}>
            {sending ? 'Resending…' : 'Resend code'}
          </button>
        </div>
      </div>
    </div>
  );
}
