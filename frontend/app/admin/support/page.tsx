'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminSupport } from '@/lib/api';
import type { AdminSupportItem } from '@/lib/types';

function typeTag(type: string) {
  return type === 'support' ? 'admin-tag' : 'admin-tag-gray';
}

export default function AdminSupportPage() {
  const [data, setData] = useState<{ items: AdminSupportItem[]; pagination: { page: number; limit: number; total: number; total_pages: number } } | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (type) params.type = type;
    if (status) params.status = status;
    try {
      const res = await getAdminSupport(params);
      setData(res);
      setError('');
    } catch {
      setError('Failed to load support requests.');
    } finally {
      setLoading(false);
    }
  }, [page, type, status, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Support Inbox</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          >
            <option value="">All types</option>
            <option value="support">Support</option>
            <option value="contact">Contact</option>
          </select>
          <select
            style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p className="empty-state">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No support requests found.</p>
        </div>
      ) : (
        <div className="orders-list">
          {data.items.map((item) => (
            <Link key={item.id} href={`/admin/support/${item.id}`} className="order-card card">
              <div className="order-card__row">
                <div>
                  <div className="order-card__number" style={{ fontSize: '0.85rem' }}>
                    {item.subject || 'No subject'}
                  </div>
                  <div className="order-card__date">
                    {item.name} · {item.email}
                  </div>
                </div>
                <span className={`admin-tag ${typeTag(item.type)}`}>{item.type}</span>
                {item.status && <span className="admin-tag admin-tag-amber">{item.status}</span>}
                <div className="order-card__total" style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--muted)' }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
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
