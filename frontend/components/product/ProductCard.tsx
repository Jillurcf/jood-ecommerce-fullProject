'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { VariantCard } from '@/lib/types';
import { addToCart, toggleWishlist } from '@/lib/api';
import { refreshCart } from '@/lib/cart-events';
import { normalizeImage } from '@/lib/image';

export function ProductLink({ card, children }: { card: VariantCard; children: React.ReactNode }) {
  return (
    <Link href={`/product/${card.product_id}/${card.variant_id}`} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}

export default function ProductCard({ card, showBrand = true }: { card: VariantCard; showBrand?: boolean }) {
  const [quantity, setQuantity] = useState(card.in_cart_qty || 0);
  const [added, setAdded] = useState(false);
  const [fav, setFav] = useState(card.is_fav);
  const [busy, setBusy] = useState(false);

  const outOfStock = card.stock <= 0;

  const handleAdd = useCallback(async () => {
    if (busy || outOfStock) return;
    setBusy(true);
    try {
      await addToCart({ product_id: Number(card.product_id), variant_id: Number(card.variant_id), quantity: 1 });
      setQuantity((q) => q + 1);
      setAdded(true);
      await refreshCart();
    } catch {
      /* stock or identity error — leave as is */
    } finally {
      setBusy(false);
    }
  }, [busy, outOfStock, card.product_id, card.variant_id]);

  const handleToggleFav = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await toggleWishlist(Number(card.variant_id));
      setFav(res.is_fav);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [busy, card.variant_id]);

  const handleSetQty = useCallback(
    async (delta: number) => {
      const next = quantity + delta;
      if (next <= 0) return;
      setBusy(true);
      try {
        const rows = await (
          await import('@/lib/api')
        ).updateCartQty({ product_id: Number(card.product_id), variant_id: Number(card.variant_id), quantity: next });
        const row = rows.find((r) => r.variant_id === Number(card.variant_id));
        setQuantity(row ? row.quantity : next);
        await refreshCart();
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [quantity, card.product_id, card.variant_id],
  );

  const imageSrc = normalizeImage(card.image || card.main_image);
  const discountPct = card.discount_percent;

  return (
    <article className="product-card">
      <div className="product-card__media">
        <ProductLink card={card}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt={card.product_name || 'Product'} loading="lazy" />
        </ProductLink>
        <div className="product-card__badges">
          {added && <span className="badge badge-green">Added</span>}
          {discountPct > 0 && <span className="badge badge-red">-{Math.round(discountPct)}%</span>}
          {card.stock > 0 && <span className="badge badge-vat">VAT incl.</span>}
        </div>
        <button
          type="button"
          className={`product-card__fav ${fav ? 'is-fav' : ''}`}
          onClick={handleToggleFav}
          disabled={busy}
          aria-label={fav ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          {fav ? '♥' : '♡'}
        </button>
      </div>

      <div className="product-card__body">
        {showBrand && card.brand && <div className="product-card__brand">{card.brand}</div>}
        <ProductLink card={card}>
          <h3 className="product-card__title">{card.product_name}</h3>
        </ProductLink>
        <div className="product-card__price">
          <span className="price-current">AED {card.final_price}</span>
          {Number(card.original_price) > Number(card.final_price) && (
            <span className="price-old">AED {card.original_price}</span>
          )}
          {discountPct > 0 && <span className="saved-small">Save {Math.round(discountPct)}%</span>}
        </div>
        <div
          className={`stock-line ${
            card.stock <= 0 ? 'stock-out' : card.stock <= (card.low_stock_threshold || 5) ? 'stock-limited' : 'stock-available'
          }`}
        >
          {card.stock_status}
        </div>
        <div className="product-card__actions">
          {quantity > 0 && !outOfStock ? (
            <div className="qty-controls">
              <button type="button" className="qty-btn" disabled={busy || quantity <= 1} onClick={() => handleSetQty(-1)}>
                −
              </button>
              <span className="qty-count">{quantity}</span>
              <button
                type="button"
                className="qty-btn"
                disabled={busy || quantity >= (card.stock || 0)}
                onClick={() => handleSetQty(1)}
              >
                +
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy || outOfStock} onClick={handleAdd}>
              {outOfStock ? 'Out of Stock' : 'Add to Cart'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
