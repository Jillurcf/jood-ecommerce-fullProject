'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { ProductDetail } from '@/lib/types';
import ProductGrid from '@/components/product/ProductGrid';
import { addToCart, toggleWishlist } from '@/lib/api';
import { refreshCart } from '@/lib/cart-events';
import { normalizeImage } from '@/lib/image';

interface Props {
  initial: ProductDetail;
}

export default function ProductDetailClient({ initial }: Props) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selected_variant_id);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [fav, setFav] = useState(initial.selectedVariant?.is_fav ?? false);

  const selectedVariant =
    data.variants.find((v) => v.id === selectedId) || data.selectedVariant || data.variants[0] || null;

  const product = data.product as (Record<string, unknown> & { name?: string; brand?: string; min_price?: number }) | null;
  const minPrice = product?.min_price != null ? String(product.min_price) : undefined;
  const galleryImg = selectedVariant?.image || product?.main_image ? String(product?.main_image) : '';

  const imageSrc = normalizeImage(selectedVariant?.image || galleryImg || '');

  const changeVariant = useCallback(
    async (variantId: number) => {
      if (!data.product) return;
      setBusy(true);
      try {
        const mod = await import('@/lib/api-server');
        const d = await mod.getProductDetail(
          String((data.product as { id?: unknown }).id),
          variantId,
        );
        setData(d);
        setSelectedId(d.selected_variant_id);
        setFav(d.selectedVariant?.is_fav ?? false);
        setQty(1);
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [data.product],
  );

  const handleAdd = useCallback(async () => {
    if (busy || !selectedVariant || selectedVariant.stock <= 0) return;
    setBusy(true);
    try {
      await addToCart({
        product_id: Number(selectedVariant.product_id),
        variant_id: Number(selectedVariant.variant_id),
        quantity: qty,
      });
      await refreshCart();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [busy, selectedVariant, qty]);

  const handleFav = useCallback(async () => {
    if (!selectedVariant || busy) return;
    setBusy(true);
    try {
      const r = await toggleWishlist(Number(selectedVariant.variant_id));
      setFav(r.is_fav);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [selectedVariant, busy]);

  const crumbs = data.breadcrumbs || [];

  return (
    <div className="container">
      <nav className="breadcrumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {c.href && i < crumbs.length - 1 ? (
              <Link href={c.href}>{c.label}</Link>
            ) : (
              <span>{c.label}</span>
            )}
            {i < crumbs.length - 1 && <span style={{ margin: '0 0.3rem' }}>/</span>}
          </span>
        ))}
      </nav>

      <div className="pdp">
        <div className="pdp__gallery">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="main" src={imageSrc} alt={selectedVariant?.product_name || 'Product'} />
        </div>

        <div className="pdp__info">
          <div className="pdp__brand">{product?.brand || selectedVariant?.brand}</div>
          <h1>{selectedVariant?.product_name || product?.name || 'Product'}</h1>

          <div className="pdp__price">
            <span className="price-current">AED {selectedVariant?.final_price || minPrice}</span>
            {Number(selectedVariant?.original_price) > Number(selectedVariant?.final_price) && (
              <span className="price-old">AED {selectedVariant?.original_price}</span>
            )}
            {selectedVariant && selectedVariant.discount_percent > 0 && (
              <span className="saved-small">Save {Math.round(selectedVariant.discount_percent)}%</span>
            )}
          </div>

          {selectedVariant && (
            <div
              className={`stock-line ${
                selectedVariant.stock <= 0
                  ? 'stock-out'
                  : selectedVariant.stock <= (selectedVariant.low_stock_threshold || 5)
                    ? 'stock-limited'
                    : 'stock-available'
              }`}
            >
              {selectedVariant.stock_status}
            </div>
          )}

          {data.variants.length > 1 && (
            <div className="variant-picker">
              {Object.entries(selectedVariant?.attribute_groups || {}).map(([key, group]) => (
                <div className="variant-picker__group" key={key}>
                  <span>{group.heading}:</span>
                  <div className="variant-options">
                    {group.values.map((value) => {
                      const match = data.variants.find((v) =>
                        (v.attribute_groups?.[key]?.values || []).includes(value),
                      );
                      const isActive = selectedVariant?.attributes?.some(
                        (a) => a.key === key && a.attribute_value === value,
                      );
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`variant-option ${isActive ? 'is-active' : ''}`}
                          disabled={busy || !match}
                          onClick={() => match && changeVariant(Number(match.variant_id))}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="variant-picker__group">
                <span>Variant:</span>
                <select
                  value={selectedId ?? ''}
                  onChange={(e) => changeVariant(Number(e.target.value))}
                  style={{ padding: '0.45rem', border: '1px solid var(--line)', borderRadius: '8px' }}
                >
                  {data.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="add-line">
            <div className="qty-controls">
              <button type="button" className="qty-btn" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
                −
              </button>
              <span className="qty-count">{qty}</span>
              <button
                type="button"
                className="qty-btn"
                disabled={selectedVariant ? qty >= selectedVariant.stock : false}
                onClick={() => setQty((q) => q + 1)}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !selectedVariant || selectedVariant.stock <= 0}
              onClick={handleAdd}
            >
              {selectedVariant?.stock != null && selectedVariant.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
            <button
              type="button"
              className={`btn ${fav ? 'btn-danger' : 'btn-outline'}`}
              disabled={busy || !selectedVariant}
              onClick={handleFav}
            >
              {fav ? '♥ In Wishlist' : '♡ Add to Wishlist'}
            </button>
          </div>

          {product?.short_description ? (
            <p className="pdp__desc">{String(product.short_description)}</p>
          ) : null}
          {product?.description ? (
            <div className="pdp__desc">
              <strong>Description</strong>
              <p>{String(product.description)}</p>
            </div>
          ) : null}
        </div>
      </div>

      {data.relatedProducts?.length ? (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Related Products</h2>
          </div>
          <ProductGrid cards={data.relatedProducts} />
        </section>
      ) : null}

      {data.frequentlyBoughtTogether?.length ? (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Frequently Bought Together</h2>
          </div>
          <ProductGrid cards={data.frequentlyBoughtTogether} />
        </section>
      ) : null}

      {data.customersAlsoViewed?.length ? (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Customers Also Viewed</h2>
          </div>
          <ProductGrid cards={data.customersAlsoViewed} />
        </section>
      ) : null}
    </div>
  );
}
