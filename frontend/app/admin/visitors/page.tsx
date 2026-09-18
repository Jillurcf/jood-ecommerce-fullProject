'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminVisitors, getAdminVisitorChart } from '@/lib/api';
import type { AdminVisitor } from '@/lib/types';

function VisitorCard({ v, onVisit }: { v: AdminVisitor; onVisit: (key: string) => void }) {
  return (
    <div className="card" style={{ padding: '1rem' }} role="button" tabIndex={0} onClick={() => onVisit(v.visitor_key)} onKeyDown={(e) => { if (e.key === 'Enter') onVisit(v.visitor_key); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.9rem' }}>{v.city || 'Unknown'} {v.country ? `(${v.country})` : ''}</strong>
        <span className="admin-tag">{v.visit_count} visits</span>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
        <div>IP: {v.ip_address || 'Unknown'}</div>
        <div>Last: {v.last_visit ? new Date(v.last_visit).toLocaleString() : '—'}</div>
        <div>Area: {v.area || '—'}</div>
      </div>
    </div>
  );
}

export default function AdminVisitorsPage() {
  const [data, setData] = useState<{ visitors: AdminVisitor[]; pagination: { page: number; limit: number; total: number; total_pages: number } } | null>(null);
  const [chart, setChart] = useState<{ label: string; visitors: number; page_views: number }[]>([]);
  const [range, setRange] = useState('day');
  const [page, setPage] = useState(1);
  const [limit] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [visitorRes, chartRes] = await Promise.all([
        getAdminVisitors({ page: String(page), limit: String(limit) }),
        getAdminVisitorChart({ range }).catch(() => [] as { label: string; visitors: number; page_views: number }[]),
      ]);
      setData(visitorRes);
      setChart(chartRes);
      setError('');
    } catch {
      setError('Failed to load visitors.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, range]);

  useEffect(() => { load(); }, [load]);

  const maxViews = Math.max(...chart.map((c) => c.page_views), 0);

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Visitors</h1>
        <select
          style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          value={range}
          onChange={(e) => { setRange(e.target.value); setPage(1); }}
        >
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {chart.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Visitors / Page Views</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', height: 180, overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {chart.map((c) => (
              <div key={c.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minWidth: 40 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{c.page_views}</div>
                  <div
                    title={`${c.label}: ${c.visitors} visitors, ${c.page_views} page views`}
                    style={{
                      width: 30,
                      height: maxViews ? Math.max((c.page_views / maxViews) * 120, 4) : 4,
                      background: 'var(--primary)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="empty-state">Loading visitors…</p>
      ) : !data || data.visitors.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No visitors tracked yet.</p>
        </div>
      ) : (
        <div className="visitor-grid">
          {data.visitors.map((v) => (
            <VisitorCard key={v.id} v={v} onVisit={() => {}} />
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
