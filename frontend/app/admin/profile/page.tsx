'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminProfile, updateAdminProfile, adminUpdateEmail, adminUpdatePassword } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AuthAdmin } from '@/lib/types';

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<AuthAdmin | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);

  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailError, setEmailError] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getAdminProfile();
      setProfile(p);
      setFullName(p.full_name || '');
      setPhone(p.phone || '');
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(''); setProfileError('');
    setSavingProfile(true);
    try {
      const p = await updateAdminProfile({ full_name: fullName, phone: phone || undefined });
      setProfile(p);
      setProfileMsg('Profile updated.');
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setSavingProfile(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(''); setEmailError('');
    setSavingEmail(true);
    try {
      const res = await adminUpdateEmail(newEmail);
      setEmailMsg(res.message || 'Verification OTP sent to your current email.');
      setNewEmail('');
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setSavingEmail(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(''); setPwdError('');
    if (newPassword !== confirmPassword) {
      setPwdError('Passwords do not match.');
      return;
    }
    setSavingPwd(true);
    try {
      await adminUpdatePassword({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword });
      setPwdMsg('Password updated.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPwdError(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) return <p className="empty-state">Loading profile…</p>;
  if (!profile) return <p className="empty-state">Unable to load profile.</p>;

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">My Profile</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat__label">Role</div>
          <div className="admin-stat__value" style={{ fontSize: '1.1rem' }}>{profile.role.replace('_', ' ')}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__label">Status</div>
          <div className="admin-stat__value" style={{ fontSize: '1.1rem' }}><span className={`admin-tag ${profile.status === 'active' ? 'admin-tag-green' : 'admin-tag-red'}`}>{profile.status}</span></div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__label">Email</div>
          <div className="admin-stat__value" style={{ fontSize: '1.1rem' }}>{profile.email}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__label">Admin ID</div>
          <div className="admin-stat__value" style={{ fontSize: '1.1rem' }}>{profile.admin_id}</div>
        </div>
      </div>

      <div className="admin-form" style={{ marginBottom: '1.5rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem' }}>Basic Info</h2>
        {profileMsg && <div className="auth-success">{profileMsg}</div>}
        {profileError && <div className="auth-error">{profileError}</div>}
        <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="admin-form__grid">
            <div className="form-field">
              <span>Full Name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-field">
              <span>Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Profile'}</button>
        </form>
      </div>

      <div className="admin-form" style={{ marginBottom: '1.5rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem' }}>Change Email</h2>
        {emailMsg && <div className="auth-success">{emailMsg}</div>}
        {emailError && <div className="auth-error">{emailError}</div>}
        <form onSubmit={submitEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-field">
            <span>New Email</span>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="new@example.com" />
          </div>
          <button className="btn btn-primary" disabled={savingEmail}>{savingEmail ? 'Sending OTP…' : 'Send OTP'}</button>
        </form>
      </div>

      <div className="admin-form">
        <h2 className="section-title" style={{ fontSize: '1.1rem' }}>Change Password</h2>
        {pwdMsg && <div className="auth-success">{pwdMsg}</div>}
        {pwdError && <div className="auth-error">{pwdError}</div>}
        <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-field">
            <span>Current Password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="admin-form__grid">
            <div className="form-field">
              <span>New Password</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="≥8 chars, upper+lower+number+special" />
            </div>
            <div className="form-field">
              <span>Confirm New Password</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          </div>
          <button className="btn btn-primary" disabled={savingPwd}>{savingPwd ? 'Updating…' : 'Update Password'}</button>
        </form>
      </div>
    </div>
  );
}
