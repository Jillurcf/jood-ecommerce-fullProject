'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminSignIn } from '@/lib/api';
import { ApiError } from '@/lib/api';

export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminSignIn({ email, password });
      router.push('/admin/sign-in/verify-otp');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh' }}>
      <div className="auth-card card">
        <h1 className="auth-title">Admin Sign In</h1>
        <p className="auth-subtitle">Jood Administration</p>
        {error && <div className="auth-error">{error}</div>}
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
            <span>Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>
        <div className="auth-footer-text">
          <Link href="/admin/sign-in/forgot-password" className="auth-link">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
