'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrders } from '@/lib/api';
import type { OrderSummary, OrdersListResponse } from '@/lib/types';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (['paid', 'completed', 'confirmed', 'captured', 'success', 'successful'].includes(s)) return 'badge-green';
  if (['failed', 'cancelled', 'canceled', 'refunded', 'partially_refunded'].includes(s)) return 'badge-red';
  return 'badge-vat';
}

export default function OrdersPage() {
  const [data, setData] = useState<OrdersListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrders(page, 10);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="empty-state">Loading orders…</p>;
  if (!data || data.orders.length === 0) {
    return (
      <div>
        <h2 className="section-title" style={{ marginBottom: '1rem' }}>My Orders</h2>
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No orders yet.</p>
          <Link href="/shop" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1rem' }}>My Orders</h2>
      <div className="orders-list">
        {data.orders.map((o: OrderSummary) => (
          <Link
            key={o.id}
            href={`/account/orders/${o.order_number}`}
            className="order-card card"
          >
            <div className="order-card__row">
              <div>
                <div className="order-card__number">{o.order_number}</div>
                <div className="order-card__date">
                  {new Date(o.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="order-card__total">
                AED {Number(o.grand_total).toFixed(2)}
              </div>
              <div>
                <span className={`badge ${statusBadge(o.order_status)}`}>
                  {o.order_status}
                </span>
              </div>
              <div>
                <span className={`badge ${statusBadge(o.payment_status)}`}>
                  {o.payment_status}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {data.pagination.total_pages > 1 && (
        <div className="pagination" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            className="btn btn-outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span style={{ lineHeight: '2.2rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
            Page {data.pagination.page} of {data.pagination.total_pages}
          </span>
          <button
            className="btn btn-outline"
            disabled={page >= data.pagination.total_pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
