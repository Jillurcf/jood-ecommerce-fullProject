'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminAdmins, requestCreateAdmin, suspendAdmin, activateAdmin, forceLogoutAdmin } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminAccount } from '@/lib/types';

function roleTag(role: string) {
  if (role === 'master_admin') return 'admin-tag-red';
  if (role === 'super_admin') return 'admin-tag-amber';
  if (role === 'admin') return 'admin-tag';
  return 'admin-tag-gray';
}

function AdminRow({ a, onAction }: { a: AdminAccount; onAction: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn: (id: number) => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(a.id); onAction(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{a.full_name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{a.admin_id}</div>
      </td>
      <td>{a.email}</td>
      <td>{a.phone || '—'}</td>
      <td><span className={`admin-tag ${roleTag(a.role)}`}>{a.role.replace('_', ' ')}</span></td>
      <td><span className={`admin-tag ${a.status === 'active' ? 'admin-tag-green' : 'admin-tag-red'}`}>{a.status}</span></td>
      <td>{a.is_online ? '🟢 Online' : '—'}</td>
      <td>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.72rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {a.status === 'active' && (
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--danger)' }} disabled={busy} onClick={() => act(suspendAdmin)}>Suspend</button>
          )}
          {a.status !== 'active' && (
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--success)' }} disabled={busy} onClick={() => act(activateAdmin)}>Activate</button>
          )}
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--primary-dark)' }} disabled={busy} onClick={() => act(forceLogoutAdmin)}>Force Logout</button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminAdminsPage() {
  const [data, setData] = useState<{ admins: AdminAccount[]; pagination: { page: number; limit: number; total: number; total_pages: number } } | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('admin');
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (q) params.q = q;
    try {
      const res = await getAdminAdmins(params);
      setData(res);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load admins.');
    } finally {
      setLoading(false);
    }
  }, [page, q, limit]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setCreateMsg('');
    setCreating(true);
    try {
      const res = await requestCreateAdmin(createEmail, createRole);
      setCreateMsg(res.message || 'OTP sent to the new admin email. Continue with the two-step approval.');
      setCreateEmail(''); setCreateName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Admins</h1>
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Invite New Admin</h2>
        {error && <div className="auth-error">{error}</div>}
        {createMsg && <div className="auth-success">{createMsg}</div>}
        <form className="admin-form__grid" style={{ display: 'grid', gap: '0.75rem' }} onSubmit={handleCreate}>
          <div className="form-field">
            <span>Full Name</span>
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} required />
          </div>
          <div className="form-field">
            <span>Email</span>
            <input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <span>Role</span>
            <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="master_admin">Master Admin</option>
              <option value="sub_admin">Sub Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn btn-primary" disabled={creating}>{creating ? 'Sending…' : 'Send OTP'}</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ display: 'flex', gap: '0.6rem', padding: '0.9rem 1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          style={{ flex: 1, minWidth: 160, border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          placeholder="Search name, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" onClick={(e) => { (e.target as HTMLButtonElement).closest('.card')?.querySelector('input'); setPage(1); load(); }}>Search</button>
      </div>

      {loading ? (
        <p className="empty-state">Loading admins…</p>
      ) : !data || data.admins.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No admins found.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Online</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.admins.map((a) => (
                <AdminRow key={a.id} a={a} onAction={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="pagination">
          <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {data.pagination.page} of {data.pagination.total_pages}</span>
          <button className="btn btn-outline" disabled={page >= data.pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
