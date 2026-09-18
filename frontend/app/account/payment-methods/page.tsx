'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPaymentMethods, deletePaymentMethod } from '@/lib/api';
import type { SavedPaymentMethod } from '@/lib/types';

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getPaymentMethods();
      setMethods(data);
    } catch {
      setMethods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(id: number) {
    if (!confirm('Remove this payment method?')) return;
    try {
      await deletePaymentMethod(id);
      await load();
    } catch {
      /* ignore */
    }
  }

  if (loading) return <p className="empty-state">Loading payment methods…</p>;

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1rem' }}>Payment Methods</h2>

      {methods.length === 0 ? (
        <div className="empty-state card" style={{ padding: '2rem' }}>
          <p>No saved payment methods.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
            Payment methods are saved during checkout when you choose to save your card.
          </p>
        </div>
      ) : (
        <div className="payment-methods-list">
          {methods.map((m) => (
            <div className="payment-method-card card" key={m.id}>
              <div className="payment-method-card__info">
                <div className="payment-method-card__brand">
                  {m.card_brand || m.method_type}
                </div>
                <div className="payment-method-card__number">
                  {m.card_last4 ? `**** **** **** ${m.card_last4}` : m.display_name}
                </div>
                {m.expiry_month && m.expiry_year && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Expires {m.expiry_month}/{m.expiry_year}
                  </div>
                )}
                {m.is_default && <span className="badge badge-green">Default</span>}
              </div>
              <button
                className="btn btn-ghost"
                style={{ color: 'var(--danger)' }}
                onClick={() => handleRemove(m.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
