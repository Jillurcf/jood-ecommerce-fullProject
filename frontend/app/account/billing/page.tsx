'use client';

import { useEffect, useState } from 'react';
import { getBilling } from '@/lib/api';
import type { BillingSummary } from '@/lib/types';

export default function BillingPage() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBilling()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="empty-state">Loading billing…</p>;
  if (!data) return <p className="empty-state">Could not load billing data.</p>;

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1rem' }}>Billing Overview</h2>

      <div className="billing-cards">
        <div className="billing-stat card">
          <div className="billing-stat__label">Total Spent</div>
          <div className="billing-stat__value">AED {Number(data.total_spent).toFixed(2)}</div>
        </div>
        <div className="billing-stat card">
          <div className="billing-stat__label">Paid Orders</div>
          <div className="billing-stat__value">{data.paid_orders}</div>
        </div>
        <div className="billing-stat card">
          <div className="billing-stat__label">Pending Payments</div>
          <div className="billing-stat__value">AED {Number(data.pending_payments).toFixed(2)}</div>
        </div>
        <div className="billing-stat card">
          <div className="billing-stat__label">Refunds</div>
          <div className="billing-stat__value">AED {Number(data.refund_total).toFixed(2)}</div>
        </div>
        <div className="billing-stat card">
          <div className="billing-stat__label">This Month</div>
          <div className="billing-stat__value">AED {Number(data.this_month_spent).toFixed(2)}</div>
        </div>
        <div className="billing-stat card">
          <div className="billing-stat__label">First Order</div>
          <div className="billing-stat__value">
            {data.first_order_at ? new Date(data.first_order_at).toLocaleDateString() : '—'}
          </div>
        </div>
        <div className="billing-stat card">
          <div className="billing-stat__label">Last Paid</div>
          <div className="billing-stat__value">
            {data.last_paid_at ? new Date(data.last_paid_at).toLocaleDateString() : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
