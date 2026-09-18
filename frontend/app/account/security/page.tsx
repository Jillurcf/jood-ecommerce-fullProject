'use client';

import { useState } from 'react';
import { requestEmailChange, resendEmailOtp, verifyEmailChange, updatePassword } from '@/lib/api';

export default function SecurityPage() {
  // Email change
  const [emailStep, setEmailStep] = useState<'idle' | 'otp-sent' | 'done'>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  async function handleRequestEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailErr('');
    setEmailMsg('');
    try {
      await requestEmailChange(newEmail);
      setEmailStep('otp-sent');
      setEmailMsg('Verification code sent to your new email.');
    } catch (err: unknown) {
      setEmailErr(err instanceof Error ? err.message : 'Failed');
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleResendEmail() {
    try {
      await resendEmailOtp();
      setEmailMsg('Code resent.');
    } catch {
      setEmailErr('Failed to resend');
    }
  }

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailErr('');
    setEmailMsg('');
    try {
      await verifyEmailChange(emailOtp);
      setEmailStep('done');
      setEmailMsg('Email updated successfully.');
    } catch (err: unknown) {
      setEmailErr(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setEmailBusy(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwErr('');
    setPwMsg('');
    if (newPw !== confirmPw) {
      setPwErr('Passwords do not match');
      setPwBusy(false);
      return;
    }
    try {
      await updatePassword({
        current_password: currentPw,
        new_password: newPw,
        confirm_password: confirmPw,
      });
      setPwMsg('Password updated. Other sessions have been invalidated.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: unknown) {
      setPwErr(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Security</h2>

      {/* ── Update Email ─────────────────────────────────── */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Change Email</h3>

        {emailMsg && <div className="auth-success">{emailMsg}</div>}
        {emailErr && <div className="auth-error">{emailErr}</div>}

        {emailStep === 'idle' && (
          <form onSubmit={handleRequestEmail} className="auth-form" style={{ maxWidth: 400 }}>
            <label className="form-field">
              <span>New Email</span>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={emailBusy}>
              {emailBusy ? 'Sending…' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {emailStep === 'otp-sent' && (
          <form onSubmit={handleVerifyEmail} className="auth-form" style={{ maxWidth: 400 }}>
            <label className="form-field">
              <span>Enter OTP</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value)}
                placeholder="000000"
                className="otp-input"
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={emailBusy}>
                {emailBusy ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleResendEmail}>
                Resend Code
              </button>
            </div>
          </form>
        )}

        {emailStep === 'done' && (
          <button className="btn btn-outline" onClick={() => { setEmailStep('idle'); setEmailMsg(''); setNewEmail(''); setEmailOtp(''); }}>
            Change Email Again
          </button>
        )}
      </div>

      {/* ── Update Password ──────────────────────────────── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Change Password</h3>

        {pwMsg && <div className="auth-success">{pwMsg}</div>}
        {pwErr && <div className="auth-error">{pwErr}</div>}

        <form onSubmit={handlePassword} className="auth-form" style={{ maxWidth: 400 }}>
          <label className="form-field">
            <span>Current Password</span>
            <input
              type="password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>New Password (min 8 chars)</span>
            <input
              type="password"
              required
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Confirm New Password</span>
            <input
              type="password"
              required
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={pwBusy}>
            {pwBusy ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
