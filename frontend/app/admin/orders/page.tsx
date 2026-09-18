'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getAdminOrders } from '@/lib/api';
import type { AdminOrdersData } from '@/lib/types';
import SuspenseBoundary from '@/components/SuspenseBoundary';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['paid', 'completed', 'confirmed', 'captured', 'success', 'successful'].includes(s)) return 'admin-tag-green';
  if (['failed', 'cancelled', 'canceled', 'refunded', 'partially_refunded'].includes(s)) return 'admin-tag-red';
  return 'admin-tag-amber';
}

function formatMoney(n: number) {
  return `AED ${Number(n || 0).toFixed(2)}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat__label">{label}</div>
      <div className="admin-stat__value">{value}</div>
    </div>
  );
}

function AdminOrdersInner() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AdminOrdersData | null>(null);
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [bucket, setBucket] = useState(searchParams.get('bucket') || '');
  const [paymentMethod, setPaymentMethod] = useState(searchParams.get('payment_method') || '');
  const [startDate, setStartDate] = useState(searchParams.get('from') || '');
  const [endDate, setEndDate] = useState(searchParams.get('to') || '');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (q) params.q = q;
    if (status) params.order_status = status;
    if (bucket) params.bucket = bucket;
    if (paymentMethod) params.payment_method = paymentMethod;
    if (startDate) params.from = startDate;
    if (endDate) params.to = endDate;
    try {
      const res = await getAdminOrders(params);
      setData(res);
      setError('');
    } catch {
      setError('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status, bucket, paymentMethod, startDate, endDate, limit]);

  useEffect(() => { load(); }, [load]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Orders</h1>
        <Link href="/admin/orders" className="btn btn-outline" onClick={(e) => { e.preventDefault(); setPage(1); setStatus(''); setBucket(''); setPaymentMethod(''); setStartDate(''); setEndDate(''); setQ(''); }}>Reset Filters</Link>
      </div>

      <form className="card" style={{ display: 'flex', gap: '0.6rem', padding: '0.9rem 1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={applySearch}>
        <input
          style={{ flex: 1, minWidth: 160, border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          placeholder="Search order, tracking, customer, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          type="date"
          style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          type="date"
          style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <select style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }} value={bucket} onChange={(e) => { setBucket(e.target.value); setPage(1); }}>
          <option value="">All buckets</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0.5rem 0.75rem' }} value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}>
          <option value="">All methods</option>
          <option value="cod">COD</option>
          <option value="card">Card</option>
        </select>
        <button className="btn btn-primary">Filter</button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {data && data.summary && (
        <div className="admin-stats">
          <Stat label="Total Orders" value={data.summary.total_orders ?? 0} />
          <Stat label="Total Revenue" value={formatMoney(data.summary.total_revenue ?? 0)} />
          <Stat label="Refunds" value={formatMoney(data.summary.total_refunds ?? 0)} />
          <Stat label="Pending Payments" value={formatMoney(data.summary.pending_payments ?? 0)} />
        </div>
      )}

      {loading ? (
        <p className="empty-state">Loading orders…</p>
      ) : !data || data.orders.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No orders found.</p>
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
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.order_number}`} style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>
                      {o.order_number}
                    </Link>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{o.tracking_id}</div>
                  </td>
                  <td>
                    <div>{o.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{o.email}</div>
                  </td>
                  <td>{formatMoney(o.grand_total)}</td>
                  <td>{o.payment_method}</td>
                  <td><span className={`admin-tag ${statusBadge(o.order_status)}`}>{o.order_status}</span></td>
                  <td><span className={`admin-tag ${statusBadge(o.payment_status)}`}>{o.payment_status}</span></td>
                  <td>{new Date(o.created_at).toLocaleDateString()}</td>
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

export default function AdminOrdersPage() {
  return (
    <SuspenseBoundary>
      <AdminOrdersInner />
    </SuspenseBoundary>
  );
}
