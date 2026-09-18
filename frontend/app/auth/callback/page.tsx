'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import SuspenseBoundary from '@/components/SuspenseBoundary';

/**
 * Handles the Google OAuth redirect callback.
 * The backend redirects here with ?status=success|error&...
 * Auth cookies are already set by the backend; we just refresh the client state.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const status = searchParams.get('status');
  const errorCode = searchParams.get('error_code');
  const message = searchParams.get('message');
  const email = searchParams.get('email');

  useEffect(() => {
    if (status === 'success') {
      refresh().then(() => {
        router.replace('/');
      });
    }
  }, [status, refresh, router]);

  if (status === 'success') {
    return (
      <div className="auth-page">
        <div className="auth-card card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Signing you in…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1 className="auth-title">Sign-in Failed</h1>
          <div className="auth-error">
            {message || errorCode || 'Google sign-in failed.'}
          </div>
          <Link href="/auth/sign-in" className="btn btn-primary auth-submit" style={{ marginTop: '1rem' }}>
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Fallback — no status param
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">Authentication</h1>
        {email && (
          <p className="auth-subtitle">Signed in as <strong>{email}</strong></p>
        )}
        <Link href="/" className="btn btn-primary auth-submit" style={{ marginTop: '1rem' }}>
          Go to Home
        </Link>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <SuspenseBoundary>
      <AuthCallbackInner />
    </SuspenseBoundary>
  );
}
