'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getOrderSuccess } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import type { OrderSuccessData } from '@/lib/types';

export default function CheckoutSuccessPage() {
  const params = useParams();
  const orderNumber = params.orderNumber as string;
  const { type } = useAuth();
  const [order, setOrder] = useState<OrderSuccessData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getOrderSuccess(orderNumber);
      setOrder(data);
    } catch {
      setOrder(null);
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
        <p className="empty-state">Loading order details…</p>
      </div>
    );
  }

  if (!order) {
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
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✓</div>
        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>Order Placed!</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
          Thank you for your order. We&apos;ll send you updates as your order is processed.
        </p>

        <div className="order-success-details" style={{ textAlign: 'left' }}>
          <div className="detail-row"><span>Order Number</span><strong>{order.order_number}</strong></div>
          <div className="detail-row"><span>Tracking ID</span><span style={{ fontSize: '0.88rem' }}>{order.tracking_id}</span></div>
          <div className="detail-row"><span>Payment Method</span><span>{order.payment_method}</span></div>
          <div className="detail-row"><span>Payment Status</span><span>{order.payment_status}</span></div>
          <div className="detail-row" style={{ fontWeight: 700 }}><span>Total</span><span>AED {Number(order.grand_total).toFixed(2)}</span></div>
        </div>

        {order.items && order.items.length > 0 && (
          <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Items</h4>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--line)', fontSize: '0.9rem' }}>
                <span>{item.product_name} × {item.quantity}</span>
                <span>AED {Number(item.line_total).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '2rem' }}>
          <Link href={`/checkout/track/${order.order_number}`} className="btn btn-outline">
            Track Order
          </Link>
          <Link href="/account/orders" className="btn btn-outline">
            My Orders
          </Link>
          <Link href="/shop" className="btn btn-primary">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
