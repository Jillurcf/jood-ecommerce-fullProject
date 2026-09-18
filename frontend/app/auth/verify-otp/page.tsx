'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyOtp, resendOtp } from '@/lib/api';
import SuspenseBoundary from '@/components/SuspenseBoundary';

function VerifyOtpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyOtp(email, otp);
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setSuccess('');
    try {
      await resendOtp(email);
      setSuccess('A new OTP has been sent to your email.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend';
      setError(msg);
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1 className="auth-title">Verify Email</h1>
          <p className="auth-subtitle">No email specified. Please sign up first.</p>
          <Link href="/auth/sign-up" className="btn btn-primary auth-submit">Go to Sign Up</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">Verify OTP</h1>
        <p className="auth-subtitle">
          Enter the 6-digit code sent to <strong>{email}</strong>
        </p>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form onSubmit={handleVerify} className="auth-form">
          <label className="form-field">
            <span>Verification Code</span>
            <input
              type="text"
              inputMode="numeric"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000"
              className="otp-input"
            />
          </label>

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <p className="auth-footer-text">
          Didn&apos;t receive the code?{' '}
          <button
            type="button"
            className="auth-link"
            onClick={handleResend}
            disabled={resending}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {resending ? 'Sending…' : 'Resend OTP'}
          </button>
        </p>

        <p className="auth-footer-text">
          <Link href="/auth/sign-in" className="auth-link">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <SuspenseBoundary>
      <VerifyOtpInner />
    </SuspenseBoundary>
  );
}
