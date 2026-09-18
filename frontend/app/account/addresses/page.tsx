'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress } from '@/lib/api';
import type { UserAddress } from '@/lib/types';

const emptyAddr = {
  address_type: 'shipping',
  address_line1: '',
  landmark: '',
  city: '',
  emirate: '',
  country: 'UAE',
  postal_code: '',
  is_default: false,
};

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyAddr);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getAddresses();
      setAddresses(data);
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function startCreate() {
    setEditing(0);
    setForm({ ...emptyAddr });
  }

  function startEdit(addr: UserAddress) {
    setEditing(addr.id);
    setForm({
      address_type: addr.address_type || 'shipping',
      address_line1: addr.address_line1 || '',
      landmark: addr.landmark || '',
      city: addr.city || '',
      emirate: addr.emirate || '',
      country: addr.country || 'UAE',
      postal_code: addr.postal_code || '',
      is_default: addr.is_default,
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      if (editing && editing > 0) {
        await updateAddress(editing, form as never);
      } else {
        await createAddress(form as never);
      }
      setEditing(null);
      setMsg('Address saved');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this address?')) return;
    try {
      await deleteAddress(id);
      await load();
    } catch {
      /* ignore */
    }
  }

  async function handleDefault(id: number) {
    try {
      await setDefaultAddress(id);
      await load();
    } catch {
      /* ignore */
    }
  }

  if (loading) return <p className="empty-state">Loading addresses…</p>;

  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">Addresses</h2>
        {!editing && (
          <button className="btn btn-primary" onClick={startCreate}>Add Address</button>
        )}
      </div>

      {msg && <div className="auth-success">{msg}</div>}
      {error && <div className="auth-error">{error}</div>}

      {editing !== null && (
        <form onSubmit={handleSave} className="auth-form card" style={{ padding: '1.25rem', maxWidth: 500, marginBottom: '1.5rem' }}>
          <label className="form-field">
            <span>Address Line 1</span>
            <input type="text" required value={String(form.address_line1)} onChange={(e) => set('address_line1', e.target.value)} />
          </label>
          <label className="form-field">
            <span>Landmark</span>
            <input type="text" value={String(form.landmark)} onChange={(e) => set('landmark', e.target.value)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="form-field">
              <span>City</span>
              <input type="text" required value={String(form.city)} onChange={(e) => set('city', e.target.value)} />
            </label>
            <label className="form-field">
              <span>Emirate / State</span>
              <input type="text" value={String(form.emirate)} onChange={(e) => set('emirate', e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="form-field">
              <span>Country</span>
              <input type="text" value={String(form.country)} onChange={(e) => set('country', e.target.value)} />
            </label>
            <label className="form-field">
              <span>Postal Code</span>
              <input type="text" value={String(form.postal_code)} onChange={(e) => set('postal_code', e.target.value)} />
            </label>
          </div>
          <label className="auth-check">
            <input type="checkbox" checked={Boolean(form.is_default)} onChange={(e) => set('is_default', e.target.checked)} />
            Set as default
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !editing ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No addresses saved yet.</p>
        </div>
      ) : (
        <div className="address-list">
          {addresses.map((a) => (
            <div className="address-card card" key={a.id}>
              <div className="address-card__content">
                {a.is_default && <span className="badge badge-green" style={{ marginBottom: '0.25rem' }}>Default</span>}
                <div>{a.address_line1}</div>
                {a.landmark && <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{a.landmark}</div>}
                <div style={{ fontSize: '0.88rem' }}>
                  {[a.city, a.emirate, a.country].filter(Boolean).join(', ')}
                </div>
                {a.postal_code && <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>PC: {a.postal_code}</div>}
              </div>
              <div className="address-card__actions">
                {!a.is_default && (
                  <button className="btn btn-ghost" onClick={() => handleDefault(a.id)}>Set Default</button>
                )}
                <button className="btn btn-ghost" onClick={() => startEdit(a)}>Edit</button>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
