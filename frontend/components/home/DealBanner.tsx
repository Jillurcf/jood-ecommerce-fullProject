'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { VariantCard } from '@/lib/types';
import { normalizeImage } from '@/lib/image';

interface Props {
  product: VariantCard;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function getTimeLeft(targetMs: number) {
  const diff = Math.max(0, targetMs - Date.now());
  return {
    hours: Math.floor(diff / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

export default function DealBanner({ product }: Props) {
  const [endTime] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  });

  const [time, setTime] = useState(() => getTimeLeft(endTime));

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft(endTime)), 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const imgSrc = normalizeImage(product.image || product.main_image);

  return (
    <section className="deal-banner">
      <div className="deal-banner__content">
        <span className="deal-banner__badge">Deal of the Day</span>
        <h2 className="deal-banner__title">{product.product_name}</h2>
        <p className="deal-banner__brand">{product.brand}</p>
        <div className="deal-banner__price-row">
          <span className="deal-banner__price">AED {product.final_price}</span>
          {Number(product.original_price) > Number(product.final_price) && (
            <span className="deal-banner__old-price">AED {product.original_price}</span>
          )}
          {product.discount_percent > 0 && (
            <span className="deal-banner__save">Save {Math.round(product.discount_percent)}%</span>
          )}
        </div>
        <div className="deal-banner__timer">
          <div className="deal-banner__timer-unit">
            <span className="deal-banner__timer-num">{pad(time.hours)}</span>
            <span className="deal-banner__timer-label">Hrs</span>
          </div>
          <span className="deal-banner__timer-sep">:</span>
          <div className="deal-banner__timer-unit">
            <span className="deal-banner__timer-num">{pad(time.minutes)}</span>
            <span className="deal-banner__timer-label">Min</span>
          </div>
          <span className="deal-banner__timer-sep">:</span>
          <div className="deal-banner__timer-unit">
            <span className="deal-banner__timer-num">{pad(time.seconds)}</span>
            <span className="deal-banner__timer-label">Sec</span>
          </div>
        </div>
        <Link href={`/product/${product.product_id}/${product.variant_id}`} className="btn btn-primary deal-banner__cta">
          Shop This Deal
        </Link>
      </div>
      <div className="deal-banner__image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={product.product_name} />
      </div>
    </section>
  );
}
