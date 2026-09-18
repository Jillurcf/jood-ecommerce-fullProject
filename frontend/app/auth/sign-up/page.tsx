'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/api';

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
    agree_terms: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    if (!form.agree_terms) {
      setError('You must agree to the terms');
      return;
    }

    setBusy(true);
    try {
      await signUp(form);
      router.push(`/auth/verify-otp?email=${encodeURIComponent(form.email)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Join Jood today</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="form-field">
            <span>Full Name</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Phone</span>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Confirm Password</span>
            <input
              type="password"
              required
              value={form.confirm_password}
              onChange={(e) => set('confirm_password', e.target.value)}
            />
          </label>

          <label className="auth-check" style={{ marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              checked={form.agree_terms}
              onChange={(e) => set('agree_terms', e.target.checked)}
            />
            I agree to the Terms &amp; Conditions
          </label>

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="auth-link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
