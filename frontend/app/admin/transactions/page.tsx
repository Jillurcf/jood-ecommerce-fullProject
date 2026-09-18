'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminTransactions, getAdminTransactionSummary } from '@/lib/api';
import type { AdminTransaction } from '@/lib/types';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['paid', 'completed', 'confirmed', 'captured', 'success', 'successful'].includes(s)) return 'admin-tag-green';
  if (['failed', 'cancelled', 'canceled', 'refunded', 'partially_refunded'].includes(s)) return 'admin-tag-red';
  return 'admin-tag-amber';
}

function formatMoney(n: number) {
  return `AED ${Number(n || 0).toFixed(2)}`;
}

export default function AdminTransactionsPage() {
  const [data, setData] = useState<{ transactions: AdminTransaction[]; pagination: { page: number; limit: number; total: number; total_pages: number } } | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
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
      const [res, sum] = await Promise.all([
        getAdminTransactions(params),
        getAdminTransactionSummary().catch(() => null),
      ]);
      setData(res);
      setSummary(sum);
      setError('');
    } catch {
      setError('Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status, limit]);

  useEffect(() => { load(); }, [load]);

  const moneyOf = (key: string) => formatMoney(Number((summary as Record<string, unknown>)?.[key] ?? 0));

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Transactions</h1>
      </div>

      {summary && (
        <div className="admin-stats">
          <div className="admin-stat">
            <div className="admin-stat__label">Total Revenue</div>
            <div className="admin-stat__value">{moneyOf('total_revenue')}</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat__label">Paid</div>
            <div className="admin-stat__value">{moneyOf('paid_revenue')}</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat__label">Pending</div>
            <div className="admin-stat__value">{moneyOf('pending_revenue')}</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat__label">Refunded</div>
            <div className="admin-stat__value">{moneyOf('refunded_revenue')}</div>
          </div>
        </div>
      )}

      <form className="card" style={{ display: 'flex', gap: '0.6rem', padding: '0.9rem 1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }}>
        <input
          style={{ flex: 1, minWidth: 160, border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          placeholder="Search order, customer, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn btn-primary">Filter</button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {loading ? (
        <p className="empty-state">Loading transactions…</p>
      ) : !data || data.transactions.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No transactions found.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Method</th>
                <th>Order Status</th>
                <th>Payment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.order_number}</td>
                  <td>
                    <div>{t.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{t.email}</div>
                  </td>
                  <td>{formatMoney(t.grand_total)}</td>
                  <td>{t.payment_method}</td>
                  <td><span className={`admin-tag ${statusBadge(t.order_status)}`}>{t.order_status}</span></td>
                  <td><span className={`admin-tag ${statusBadge(t.payment_status)}`}>{t.payment_status}</span></td>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
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
