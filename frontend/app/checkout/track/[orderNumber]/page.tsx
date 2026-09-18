'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getOrderTracking } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import type { OrderTrackingData } from '@/lib/types';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['paid', 'completed', 'confirmed', 'captured', 'success', 'successful'].includes(s)) return 'badge-green';
  if (['failed', 'cancelled', 'canceled', 'refunded', 'partially_refunded'].includes(s)) return 'badge-red';
  return 'badge-vat';
}

export default function TrackingPage() {
  const params = useParams();
  const orderNumber = params.orderNumber as string;
  const { type } = useAuth();
  const [data, setData] = useState<OrderTrackingData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await getOrderTracking(orderNumber);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    if (type === 'customer') load();
  }, [type, load]);

  if (loading) {
    return (
      <div className="container section">
        <p className="empty-state">Loading tracking…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container section">
        <div className="empty-state card" style={{ padding: '3rem' }}>
          <h2>Order not found</h2>
          <Link href="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section" style={{ maxWidth: 700, margin: '0 auto' }}>
      <h1 className="section-title" style={{ marginBottom: '1rem' }}>Order Tracking</h1>

      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="detail-row"><span>Order Number</span><strong>{data.order_number}</strong></div>
        <div className="detail-row"><span>Tracking ID</span><span style={{ fontSize: '0.88rem' }}>{data.tracking_id}</span></div>
        <div className="detail-row">
          <span>Order Status</span>
          <span className={`badge ${statusBadge(data.order_status)}`}>{data.order_status}</span>
        </div>
        <div className="detail-row">
          <span>Payment Status</span>
          <span className={`badge ${statusBadge(data.payment_status)}`}>{data.payment_status}</span>
        </div>
        <div className="detail-row"><span>Payment Method</span><span>{data.payment_method}</span></div>
        <div className="detail-row" style={{ fontWeight: 700 }}><span>Total</span><span>AED {Number(data.grand_total).toFixed(2)}</span></div>
        <div className="detail-row"><span>Placed On</span><span>{new Date(data.created_at).toLocaleString()}</span></div>
        <div className="detail-row"><span>Last Updated</span><span>{new Date(data.updated_at).toLocaleString()}</span></div>
      </div>

      {data.items && data.items.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Items</h3>
          <div className="order-items-table card">
            <div className="order-items-header">
              <span>Product</span>
              <span>Qty</span>
              <span>Total</span>
            </div>
            {data.items.map((item) => (
              <div className="order-items-row" key={item.id}>
                <span>
                  <strong>{item.product_name}</strong>
                  {item.variant_name && <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}> — {item.variant_name}</span>}
                </span>
                <span>{item.quantity}</span>
                <span>AED {Number(item.line_total).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
        <Link href="/account/orders" className="btn btn-outline">All Orders</Link>
        <Link href="/shop" className="btn btn-primary">Continue Shopping</Link>
      </div>
    </div>
  );
}
