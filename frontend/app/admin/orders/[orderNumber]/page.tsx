'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getAdminOrderDetail, cancelAdminOrder } from '@/lib/api';
import { ApiError } from '@/lib/api';
import type { AdminOrderDetail } from '@/lib/types';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['paid', 'completed', 'confirmed', 'captured', 'success', 'successful'].includes(s)) return 'admin-tag-green';
  if (['failed', 'cancelled', 'canceled', 'refunded', 'partially_refunded'].includes(s)) return 'admin-tag-red';
  return 'admin-tag-amber';
}

function formatMoney(n: number) {
  return `AED ${Number(n || 0).toFixed(2)}`;
}

function fmtAddr(addr: Record<string, unknown> | null) {
  if (!addr) return '—';
  const parts = [
    addr.address_line1, addr.address_line2, addr.city, addr.emirate, addr.country, addr.postal_code,
  ].filter(Boolean);
  return parts.join(', ') || JSON.stringify(addr);
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderNumber = params.orderNumber as string;
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminOrderDetail(orderNumber);
      setOrder(res);
      setError('');
    } catch {
      setError('Failed to load order.');
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async () => {
    if (!order) return;
    if (!confirm('Cancel this order?')) return;
    setCancelling(true);
    try {
      await cancelAdminOrder(order.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cancel failed.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <p className="empty-state">Loading order…</p>;
  if (error) return <p className="empty-state">{error}</p>;
  if (!order) return null;

  const canCancel = !['cancelled', 'canceled', 'refunded', 'completed'].includes(order.order_status.toLowerCase());

  return (
    <div>
      <div className="admin-page-head">
        <h1 className="admin-page-title">{order.order_number}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link href="/admin/orders" className="btn btn-outline">← Back</Link>
          {canCancel && (
            <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat__label">Order Status</div>
          <div className="admin-stat__value"><span className={`admin-tag ${statusBadge(order.order_status)}`}>{order.order_status}</span></div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__label">Payment Status</div>
          <div className="admin-stat__value"><span className={`admin-tag ${statusBadge(order.payment_status)}`}>{order.payment_status}</span></div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__label">Grand Total</div>
          <div className="admin-stat__value">{formatMoney(order.grand_total)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat__label">Date</div>
          <div className="admin-stat__value" style={{ fontSize: '1rem' }}>{new Date(order.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="order-detail-grid" style={{ marginBottom: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Customer</h3>
          <div className="detail-row"><span>Name</span><strong>{order.customer_name}</strong></div>
          <div className="detail-row"><span>Email</span><strong>{order.email}</strong></div>
          <div className="detail-row"><span>Phone</span><strong>{order.phone || '—'}</strong></div>
          <div className="detail-row"><span>Payment Method</span><strong>{order.payment_method}</strong></div>
          <div className="detail-row"><span>Gateway</span><strong>{order.gateway_provider || '—'}</strong></div>
          <div className="detail-row"><span>Tracking ID</span><strong>{order.tracking_id}</strong></div>
          <div className="detail-row"><span>Payment Ref</span><strong>{order.payment_reference || '—'}</strong></div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Addresses</h3>
          <div className="detail-row"><span>Shipping</span><strong style={{ textAlign: 'right', fontSize: '0.82rem' }}>{fmtAddr(order.shipping_address as Record<string, unknown> | null)}</strong></div>
          <div className="detail-row"><span>Billing</span><strong style={{ textAlign: 'right', fontSize: '0.82rem' }}>{fmtAddr(order.billing_address as Record<string, unknown> | null)}</strong></div>
        </div>
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Items</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product_name}</td>
                  <td style={{ color: 'var(--muted)' }}>{item.variant_name || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{item.sku || '—'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unit_price)}</td>
                  <td style={{ fontWeight: 600 }}>{formatMoney(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
          <div className="detail-row" style={{ width: 260 }}><span>Subtotal</span><span>{formatMoney(order.subtotal_amount)}</span></div>
          <div className="detail-row" style={{ width: 260 }}><span>Discount</span><span>-{formatMoney(order.discount_amount)}</span></div>
          <div className="detail-row" style={{ width: 260 }}><span>VAT</span><span>{formatMoney(order.vat_amount)}</span></div>
          <div className="detail-row" style={{ width: 260, fontWeight: 700, fontSize: '1rem' }}><span>Grand Total</span><span>{formatMoney(order.grand_total)}</span></div>
        </div>
      </div>

      {order.payments.length > 0 && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Payments</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.transaction_reference || '—'}</td>
                  <td>{p.payment_method}</td>
                  <td>{formatMoney(p.amount)}</td>
                  <td><span className={`admin-tag ${statusBadge(p.status)}`}>{p.status}</span></td>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
