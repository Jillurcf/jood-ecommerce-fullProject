'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getOrderDetail } from '@/lib/api';
import type { OrderSummary } from '@/lib/types';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['paid', 'completed', 'confirmed', 'captured', 'success', 'successful'].includes(s)) return 'badge-green';
  if (['failed', 'cancelled', 'canceled', 'refunded', 'partially_refunded'].includes(s)) return 'badge-red';
  return 'badge-vat';
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderNumber = params.orderNumber as string;
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getOrderDetail(orderNumber);
      setOrder(data);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="empty-state">Loading order…</p>;
  if (!order) return <p className="empty-state">Order not found.</p>;

  return (
    <div>
      <Link href="/account/orders" className="auth-link" style={{ fontSize: '0.88rem' }}>
        ← Back to Orders
      </Link>
      <h2 className="section-title" style={{ margin: '0.75rem 0' }}>{order.order_number}</h2>

      <div className="order-detail-grid">
        <div className="card" style={{ padding: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Order Info</h4>
          <div className="detail-row"><span>Status</span><span className={`badge ${statusBadge(order.order_status)}`}>{order.order_status}</span></div>
          <div className="detail-row"><span>Payment</span><span className={`badge ${statusBadge(order.payment_status)}`}>{order.payment_status}</span></div>
          <div className="detail-row"><span>Method</span><span>{order.payment_method}</span></div>
          <div className="detail-row"><span>Date</span><span>{new Date(order.created_at).toLocaleString()}</span></div>
          <div className="detail-row"><span>Tracking</span><span style={{ fontSize: '0.82rem' }}>{order.tracking_id}</span></div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Customer</h4>
          <div className="detail-row"><span>Name</span><span>{order.customer_name}</span></div>
          <div className="detail-row"><span>Email</span><span>{order.email}</span></div>
          {order.phone && <div className="detail-row"><span>Phone</span><span>{order.phone}</span></div>}
          <div className="detail-row" style={{ fontWeight: 700 }}><span>Total</span><span>AED {Number(order.grand_total).toFixed(2)}</span></div>
        </div>
      </div>

      {order.items && order.items.length > 0 && (
        <>
          <h4 style={{ margin: '1.5rem 0 0.75rem' }}>Items</h4>
          <div className="order-items-table card">
            <div className="order-items-header">
              <span>Product</span>
              <span>Qty</span>
              <span>Unit Price</span>
              <span>Total</span>
            </div>
            {order.items.map((item) => (
              <div className="order-items-row" key={item.id}>
                <span>
                  <strong>{item.product_name}</strong>
                  {item.variant_name && <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}> — {item.variant_name}</span>}
                  {item.sku && <span style={{ color: 'var(--muted)', fontSize: '0.78rem', display: 'block' }}>SKU: {item.sku}</span>}
                </span>
                <span>{item.quantity}</span>
                <span>AED {Number(item.unit_price).toFixed(2)}</span>
                <span>AED {Number(item.line_total).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {order.payments && order.payments.length > 0 && (
        <>
          <h4 style={{ margin: '1.5rem 0 0.75rem' }}>Payments</h4>
          <div className="order-items-table card">
            <div className="order-items-header">
              <span>Provider</span>
              <span>Method</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {order.payments.map((p) => (
              <div className="order-items-row" key={p.id}>
                <span>{p.provider || '—'}</span>
                <span>{p.payment_method}</span>
                <span>AED {Number(p.amount).toFixed(2)}</span>
                <span><span className={`badge ${statusBadge(p.status)}`}>{p.status}</span></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
