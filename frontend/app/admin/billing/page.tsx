'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminBilling } from '@/lib/api';
import type { AdminBillingData } from '@/lib/types';

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

export default function AdminBillingPage() {
  const [data, setData] = useState<AdminBillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminBilling();
      setData(res);
      setError('');
    } catch {
      setError('Failed to load billing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="empty-state">Loading billing…</p>;
  if (error) return <p className="empty-state">{error}</p>;
  if (!data) return null;

  const maxRevenue = Math.max(...data.monthlyRevenue.map((m) => m.revenue), 0);

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">Billing</h1>
        <button className="btn btn-outline" onClick={load}>Refresh</button>
      </div>

      <div className="admin-stats">
        <Stat label="Total Users" value={data.totalUsers} />
        <Stat label="Users w/ Orders" value={data.usersWithOrders} />
        <Stat label="Paid Users" value={data.paidUsers} />
        <Stat label="Total Revenue" value={formatMoney(data.totalRevenue)} />
        <Stat label="Total Refunds" value={formatMoney(data.totalRefunds)} />
        <Stat label="Pending Payments" value={formatMoney(data.pendingPayments)} />
        <Stat label="Total Orders" value={data.totalOrders} />
        <Stat label="Total Addresses" value={data.totalAddresses} />
        <Stat label="This Month" value={formatMoney(data.thisMonthRevenue)} />
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Monthly Revenue</h2>
        {data.monthlyRevenue.length === 0 ? (
          <p className="empty-state">No revenue data.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 180, overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {data.monthlyRevenue.map((m) => (
              <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minWidth: 48 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {formatMoney(m.revenue)}
                </div>
                <div
                  style={{
                    width: 36,
                    height: maxRevenue ? Math.max((m.revenue / maxRevenue) * 120, 4) : 4,
                    background: 'var(--primary)',
                    borderRadius: '4px 4px 0 0',
                  }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{m.month}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Per-User Summary</h2>
        {data.users.length === 0 ? (
          <p className="empty-state">No users found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Total Spent</th>
                  <th>Paid Orders</th>
                  <th>Pending</th>
                  <th>Refund Total</th>
                  <th>This Month</th>
                  <th>Last Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{u.email}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(u.total_spent)}</td>
                    <td>{u.total_orders_paid}</td>
                    <td>{formatMoney(u.pending_payments)}</td>
                    <td>{formatMoney(u.refund_total)}</td>
                    <td>{formatMoney(u.this_month_spent)}</td>
                    <td>{u.last_paid_at ? new Date(u.last_paid_at).toLocaleDateString() : '—'}</td>
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
