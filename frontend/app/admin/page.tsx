'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminDashboard } from '@/lib/api';
import type { AdminDashboardData, OrderSummary } from '@/lib/types';

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

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminDashboard();
      setData(res);
      setError('');
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="empty-state">Loading dashboard…</p>;
  if (error) return <p className="empty-state">{error}</p>;
  if (!data) return null;

  const latestOrders: OrderSummary[] = data.latestOrders ?? [];

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Dashboard</h1>
        <button className="btn btn-outline" onClick={load}>Refresh</button>
      </div>

      <div className="admin-stats">
        <Stat label="Total Users" value={data.totalUsers} />
        <Stat label="Users w/ Orders" value={data.usersWithOrders} />
        <Stat label="Paid Users" value={data.paidUsers} />
        <Stat label="Total Products" value={data.totalProducts} />
        <Stat label="Total Orders" value={data.totalOrders} />
        <Stat label="Total Revenue" value={formatMoney(data.totalRevenue)} />
        <Stat label="Total Refunds" value={formatMoney(data.totalRefunds)} />
        <Stat label="Pending Payments" value={formatMoney(data.pendingPayments)} />
        <Stat label="Visitors" value={data.totalVisitors} />
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <div className="section-head">
          <h2 className="section-title" style={{ fontSize: '1.1rem' }}>Latest Orders</h2>
          <Link href="/admin/orders" className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
            View All
          </Link>
        </div>
        {latestOrders.length === 0 ? (
          <p className="empty-state">No orders yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {latestOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/orders/${o.order_number}`} style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>
                        {o.order_number}
                      </Link>
                    </td>
                    <td>{o.customer_name}</td>
                    <td>{formatMoney(o.grand_total)}</td>
                    <td>
                      <span className={`admin-tag ${statusBadge(o.order_status)}`}>{o.order_status}</span>{' '}
                      <span className={`admin-tag ${statusBadge(o.payment_status)}`}>{o.payment_status}</span>
                    </td>
                    <td>{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
