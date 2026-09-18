'use client';

import { useEffect, useState } from 'react';
import { getProfile, updateProfile } from '@/lib/api';
import type { AccountProfile } from '@/lib/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const updated = await updateProfile({
        full_name: profile.full_name,
        phone: profile.phone,
        bio: profile.bio,
        address: profile.address,
        city: profile.city,
        country: profile.country,
      });
      setProfile(updated);
      setMsg('Profile updated');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (!profile) return <p className="empty-state">Could not load profile.</p>;

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1rem' }}>Profile</h2>
      {msg && <div className="auth-success">{msg}</div>}
      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSave} className="auth-form" style={{ maxWidth: 500 }}>
        <label className="form-field">
          <span>Full Name</span>
          <input
            type="text"
            value={profile.full_name}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Email</span>
          <input type="email" value={profile.email} disabled />
        </label>
        <label className="form-field">
          <span>Phone</span>
          <input
            type="tel"
            value={profile.phone || ''}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Bio</span>
          <textarea
            rows={3}
            value={profile.bio || ''}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>City</span>
          <input
            type="text"
            value={profile.city || ''}
            onChange={(e) => setProfile({ ...profile, city: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Country</span>
          <input
            type="text"
            value={profile.country || ''}
            onChange={(e) => setProfile({ ...profile, country: e.target.value })}
          />
        </label>
        <button type="submit" className="btn btn-primary auth-submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
