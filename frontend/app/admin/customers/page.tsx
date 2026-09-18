'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminCustomers, blockAdminCustomer, freezeAdminCustomer, deleteAdminCustomer } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminCustomer } from '@/lib/types';

function statusTag(status: string) {
  if (status === 'active') return 'admin-tag-green';
  if (status === 'blocked' || status === 'deleted') return 'admin-tag-red';
  return 'admin-tag-gray';
}

function CustomerRow({ c, onAction }: { c: AdminCustomer; onAction: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn: (id: number) => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(c.id); onAction(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{c.full_name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.user_id}</div>
      </td>
      <td>{c.email}</td>
      <td>{c.phone || '—'}</td>
      <td><span className={`admin-tag ${statusTag(c.status)}`}>{c.status}</span></td>
      <td>{c._count?.orders ?? 0}</td>
      <td>{c.last_login_at ? new Date(c.last_login_at).toLocaleDateString() : '—'}</td>
      <td>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.72rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {c.status !== 'blocked' && (
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--danger)' }} disabled={busy} onClick={() => act(blockAdminCustomer)}>Block</button>
          )}
          {c.status !== 'inactive' && (
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--primary-dark)' }} disabled={busy} onClick={() => act(freezeAdminCustomer)}>Freeze</button>
          )}
          {c.status !== 'deleted' && (
            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: 'var(--danger)' }} disabled={busy} onClick={() => { if (confirm(`Soft-delete ${c.full_name}?`)) act(deleteAdminCustomer); }}>Delete</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminCustomersPage() {
  const [data, setData] = useState<{ users: AdminCustomer[]; pagination: { page: number; limit: number; total: number; total_pages: number } } | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (q) params.q = q;
    if (status) params.status = status;
    try {
      const res = await getAdminCustomers(params);
      setData(res);
      setError('');
    } catch {
      setError('Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Customers</h1>
      </div>

      <form className="card" style={{ display: 'flex', gap: '0.6rem', padding: '0.9rem 1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }}>
        <input
          style={{ flex: 1, minWidth: 160, border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          placeholder="Search name, email, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blocked">Blocked</option>
          <option value="deleted">Deleted</option>
        </select>
        <button className="btn btn-primary">Search</button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p className="empty-state">Loading customers…</p>
      ) : !data || data.users.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No customers found.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Orders</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((c) => (
                <CustomerRow key={c.id} c={c} onAction={load} />
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
