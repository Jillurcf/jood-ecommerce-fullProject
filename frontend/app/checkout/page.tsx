'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCheckoutData, placeCodOrder, createStripeSession } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import type { CheckoutData, CheckoutAddress } from '@/lib/types';

const emptyAddr: CheckoutAddress = {
  country: 'UAE',
  emirate: '',
  city: '',
  address_line1: '',
  landmark: '',
  postal_code: '',
};

export default function CheckoutPage() {
  const router = useRouter();
  const { type } = useAuth();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<CheckoutAddress>({ ...emptyAddr });
  const [shipping, setShipping] = useState<CheckoutAddress>({ ...emptyAddr });
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'card'>('cod');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await getCheckoutData();
      setData(d);
      if (d.saved_addresses.length > 0) {
        const def = d.saved_addresses.find((a) => a.is_default) || d.saved_addresses[0];
        const addr: CheckoutAddress = {
          country: def.country || 'UAE',
          emirate: def.emirate || '',
          city: def.city || '',
          address_line1: def.address_line1 || def.address || '',
          landmark: def.landmark || '',
          postal_code: def.postal_code || '',
        };
        setBilling(addr);
        setShipping(addr);
      }
    } catch {
      // redirect to cart if no items
      router.replace('/cart');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (type !== 'customer') {
      router.replace('/auth/sign-in');
      return;
    }
    load();
  }, [type, router, load]);

  const setAddr = (
    setter: React.Dispatch<React.SetStateAction<CheckoutAddress>>,
    key: keyof CheckoutAddress,
    val: string,
  ) => setter((prev) => ({ ...prev, [key]: val }));

  const handleCOD = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await placeCodOrder({
        payment_method: 'cod',
        billing_address: billing,
        shipping_address: sameAsShipping ? billing : shipping,
        notes: notes || undefined,
      });
      router.push(`/checkout/success/${res.order_number}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStripe = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await createStripeSession({
        payment_method: 'card',
        gateway_provider: 'stripe',
        billing_address: billing,
        shipping_address: sameAsShipping ? billing : shipping,
        notes: notes || undefined,
      });
      // Redirect to Stripe hosted checkout
      window.location.href = res.checkout_url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment session failed');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container section">
        <p className="empty-state">Loading checkout…</p>
      </div>
    );
  }

  if (!data || data.cart.length === 0) {
    return (
      <div className="container section">
        <div className="empty-state card" style={{ padding: '3rem' }}>
          <h2>Your cart is empty</h2>
          <p>Add some products before checking out.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1.25rem' }}>Checkout</h1>

      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="checkout-layout">
        <form onSubmit={handleCOD} className="checkout-form">
          {/* ── Billing Address ─────────────────────────────── */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Billing Address</h3>
            <div className="auth-form">
              <label className="form-field">
                <span>Address Line 1 *</span>
                <input
                  required
                  value={billing.address_line1}
                  onChange={(e) => setAddr(setBilling, 'address_line1', e.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Landmark</span>
                <input
                  value={billing.landmark || ''}
                  onChange={(e) => setAddr(setBilling, 'landmark', e.target.value)}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label className="form-field">
                  <span>City *</span>
                  <input
                    required
                    value={billing.city}
                    onChange={(e) => setAddr(setBilling, 'city', e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Emirate *</span>
                  <input
                    required
                    value={billing.emirate}
                    onChange={(e) => setAddr(setBilling, 'emirate', e.target.value)}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label className="form-field">
                  <span>Country *</span>
                  <input
                    required
                    value={billing.country}
                    onChange={(e) => setAddr(setBilling, 'country', e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Postal Code</span>
                  <input
                    value={billing.postal_code || ''}
                    onChange={(e) => setAddr(setBilling, 'postal_code', e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* ── Shipping Address ────────────────────────────── */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem' }}>Shipping Address</h3>
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={sameAsShipping}
                  onChange={(e) => setSameAsShipping(e.target.checked)}
                />
                Same as billing
              </label>
            </div>
            {!sameAsShipping && (
              <div className="auth-form">
                <label className="form-field">
                  <span>Address Line 1 *</span>
                  <input
                    required
                    value={shipping.address_line1}
                    onChange={(e) => setAddr(setShipping, 'address_line1', e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Landmark</span>
                  <input
                    value={shipping.landmark || ''}
                    onChange={(e) => setAddr(setShipping, 'landmark', e.target.value)}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label className="form-field">
                    <span>City *</span>
                    <input required value={shipping.city} onChange={(e) => setAddr(setShipping, 'city', e.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Emirate *</span>
                    <input required value={shipping.emirate} onChange={(e) => setAddr(setShipping, 'emirate', e.target.value)} />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label className="form-field">
                    <span>Country *</span>
                    <input required value={shipping.country} onChange={(e) => setAddr(setShipping, 'country', e.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Postal Code</span>
                    <input value={shipping.postal_code || ''} onChange={(e) => setAddr(setShipping, 'postal_code', e.target.value)} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* ── Notes ───────────────────────────────────────── */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <label className="form-field">
              <span>Order Notes (optional)</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions for your order…"
              />
            </label>
          </div>

          {/* ── Payment ─────────────────────────────────────── */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Payment Method</h3>
            <div className="payment-options">
              <label className={`payment-option ${paymentMethod === 'cod' ? 'is-active' : ''}`}>
                <input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />
                <div>
                  <strong>Cash on Delivery</strong>
                  <span>Pay when your order arrives</span>
                </div>
              </label>
              <label className={`payment-option ${paymentMethod === 'card' ? 'is-active' : ''}`}>
                <input type="radio" name="payment" value="card" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} />
                <div>
                  <strong>Credit/Debit Card</strong>
                  <span>Pay securely via Stripe</span>
                </div>
              </label>
            </div>
          </div>

          {/* ── Submit ──────────────────────────────────────── */}
          {paymentMethod === 'cod' ? (
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }} disabled={busy}>
              {busy ? 'Placing Order…' : `Place Order — AED ${Number(data.subtotal).toFixed(2)}`}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }} disabled={busy} onClick={handleStripe}>
              {busy ? 'Redirecting…' : `Pay with Card — AED ${Number(data.subtotal).toFixed(2)}`}
            </button>
          )}
        </form>

        {/* ── Order Summary Sidebar ────────────────────────── */}
        <aside className="checkout-summary card">
          <h4 style={{ marginBottom: '1rem' }}>Order Summary</h4>
          <div className="checkout-items">
            {data.cart.map((item) => (
              <div className="checkout-item" key={item.id}>
                <div className="checkout-item__info">
                  <div className="checkout-item__name">{item.name}</div>
                  <div className="checkout-item__meta">Qty: {item.quantity}</div>
                </div>
                <div className="checkout-item__price">
                  AED {(item.final_price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
            <div className="summary-row">
              <span>Items</span>
              <span>{data.total_items}</span>
            </div>
            <div className="summary-row total">
              <span>Total</span>
              <span>AED {Number(data.subtotal).toFixed(2)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
