'use client';

import { useCallback, useEffect, useState } from 'react';
import { getTransactionHistory } from '@/lib/api';
import type { TransactionHistoryItem } from '@/lib/types';

export default function TransactionHistoryPage() {
  const [items, setItems] = useState<TransactionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getTransactionHistory();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function statusBadge(status: string) {
    const s = status.toLowerCase();
    if (['paid', 'completed', 'confirmed'].includes(s)) return 'badge-green';
    if (['failed', 'cancelled', 'canceled', 'refunded'].includes(s)) return 'badge-red';
    return 'badge-vat';
  }

  if (loading) return <p className="empty-state">Loading transactions…</p>;

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1rem' }}>Transaction History</h2>

      {items.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No transactions yet.</p>
        </div>
      ) : (
        <div className="order-items-table card">
          <div className="order-items-header">
            <span>Order</span>
            <span>Product</span>
            <span>Qty</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Date</span>
          </div>
          {items.map((t) => (
            <div className="order-items-row" key={`${t.order_id}-${t.id}`}>
              <span style={{ fontSize: '0.82rem' }}>{t.order_number}</span>
              <span>
                <strong>{t.product_name}</strong>
                {t.variant_name && (
                  <span style={{ color: 'var(--muted)', fontSize: '0.82rem', display: 'block' }}>
                    {t.variant_name}
                  </span>
                )}
              </span>
              <span>{t.quantity}</span>
              <span>AED {Number(t.line_total).toFixed(2)}</span>
              <span><span className={`badge ${statusBadge(t.payment_status)}`}>{t.payment_status}</span></span>
              <span style={{ fontSize: '0.82rem' }}>{new Date(t.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
