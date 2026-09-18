'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { validateResetToken, resetPassword } from '@/lib/api';
import SuspenseBoundary from '@/components/SuspenseBoundary';

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    validateResetToken(token)
      .then(() => {
        setTokenValid(true);
        setValidating(false);
      })
      .catch(() => {
        setTokenValid(false);
        setValidating(false);
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password, confirmPassword);
      setSuccess('Password updated. Redirecting to sign in…');
      setTimeout(() => router.push('/auth/sign-in'), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!token || validating) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <p style={{ color: 'var(--muted)', textAlign: 'center' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1 className="auth-title">Invalid Link</h1>
          <p className="auth-subtitle">This reset link is invalid or has expired.</p>
          <Link href="/auth/forgot-password" className="btn btn-primary auth-submit">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">Reset Password</h1>
        <p className="auth-subtitle">Enter your new password</p>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="form-field">
            <span>New Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Confirm Password</span>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <SuspenseBoundary>
      <ResetPasswordInner />
    </SuspenseBoundary>
  );
}
