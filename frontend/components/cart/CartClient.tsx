'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CartItem } from '@/lib/types';
import { getCart, updateCartQty, removeCartItem } from '@/lib/api';
import { refreshCart } from '@/lib/cart-events';
import { normalizeImage } from '@/lib/image';

export default function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await getCart();
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeQty = useCallback(
    async (item: CartItem, delta: number) => {
      const next = item.quantity + delta;
      if (next < 1) return;
      setBusy(true);
      try {
        const rows = next === 0 ? await removeCartItem(Number(item.variant_id)) : await updateCartQty(
          { product_id: Number(item.product_id), variant_id: Number(item.variant_id), quantity: next },
        );
        setItems(rows);
        await refreshCart();
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const remove = useCallback(
    async (item: CartItem) => {
      setBusy(true);
      try {
        const rows = await removeCartItem(Number(item.variant_id));
        setItems(rows);
        await refreshCart();
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const subtotal = items.reduce((s, i) => s + i.final_price * i.quantity, 0);

  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1.25rem' }}>
        Shopping Cart
      </h1>

      {loading ? (
        <p className="empty-state">Loading your cart…</p>
      ) : items.length === 0 ? (
        <div className="empty-state card" style={{ padding: '3rem' }}>
          <h2>Your cart is empty</h2>
          <p>Browse the store and add some products.</p>
          <Link href="/shop" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
          <div className="cart-list">
            {items.map((item) => (
              <div className="cart-row card" key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cart-row__img" src={normalizeImage(item.image)} alt={item.name || 'Product'} />
                <div className="cart-row__info">
                  <Link href={`/product/${item.product_id}/${item.variant_id}`}>
                    <div className="cart-row__title">{item.name}</div>
                  </Link>
                  <div className="cart-row__meta">
                    {item.brand ? <span>{item.brand} · </span> : null}
                    {item.sku ? <span>SKU: {item.sku}</span> : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                    <div className="qty-controls">
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={busy || item.quantity <= 1}
                        onClick={() => changeQty(item, -1)}
                      >
                        −
                      </button>
                      <span className="qty-count">{item.quantity}</span>
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={busy || (item.stock != null && item.quantity >= item.stock)}
                        onClick={() => changeQty(item, 1)}
                      >
                        +
                      </button>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => remove(item)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="cart-row__price">AED {(item.final_price * item.quantity).toFixed(2)}</div>
              </div>
            ))}
          </div>

          <aside className="cart-summary card">
            <h4 style={{ marginBottom: '1rem' }}>Order Summary</h4>
            <div className="summary-row">
              <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
              <span>AED {subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <div className="summary-row total">
              <span>Total</span>
              <span>AED {subtotal.toFixed(2)}</span>
            </div>
            <Link href="/checkout" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }}>
              Proceed to Checkout
            </Link>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.75rem', textAlign: 'center' }}>
              COD and card payment supported. Checkout requires sign-in.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
