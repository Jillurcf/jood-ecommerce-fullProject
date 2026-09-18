'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { WishlistItem } from '@/lib/types';
import { getWishlist, toggleWishlist, addToCart } from '@/lib/api';
import { refreshCart } from '@/lib/cart-events';
import { normalizeImage } from '@/lib/image';

export default function WishlistClient() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getWishlist();
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(
    async (variantId: number) => {
      setBusy(true);
      try {
        await toggleWishlist(variantId);
        setItems((prev) => prev.filter((i) => i.variant_id !== variantId));
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const addAndRemove = useCallback(
    async (item: WishlistItem) => {
      setBusy(true);
      try {
        await addToCart({ product_id: Number(item.product_id), variant_id: Number(item.variant_id), quantity: 1 });
        await toggleWishlist(item.variant_id);
        setItems((prev) => prev.filter((i) => i.variant_id !== item.variant_id));
        await refreshCart();
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (loading) return <div className="container section"><p className="empty-state">Loading your wishlist…</p></div>;

  if (!items.length) {
    return (
      <div className="container section">
        <div className="empty-state card" style={{ padding: '3rem' }}>
          <h2>Your wishlist is empty</h2>
          <p>Tap the heart on any product to save it here.</p>
          <Link href="/shop" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1.25rem' }}>
        Wishlist ({items.length})
      </h1>
      <div className="cart-list">
        {items.map((item) => (
          <div className="cart-row card" key={item.wishlist_id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cart-row__img" src={normalizeImage(item.variant_image)} alt={item.name || 'Product'} />
            <div className="cart-row__info">
              <Link href={`/product/${item.product_id}/${item.variant_id}`}>
                <div className="cart-row__title">{item.name}</div>
              </Link>
              <div className="cart-row__meta">
                {item.brand ? <span>{item.brand}</span> : null}
                {item.sku ? <span> · SKU: {item.sku}</span> : null}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => addAndRemove(item)}>
                  Add to Cart
                </button>
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => remove(item.variant_id)}>
                  ♡ Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
