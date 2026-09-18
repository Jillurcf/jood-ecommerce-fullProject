'use client';

import { useRef } from 'react';
import ProductCard from '@/components/product/ProductCard';
import type { VariantCard } from '@/lib/types';

interface Props {
  title: string;
  cards: VariantCard[];
  viewAllHref?: string;
  viewAllLabel?: string;
}

export default function ProductCarousel({ title, cards, viewAllHref, viewAllLabel = 'View all →' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (!cards.length) return null;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {viewAllHref && (
          <a href={viewAllHref} className="btn btn-ghost">
            {viewAllLabel}
          </a>
        )}
      </div>
      <div className="product-carousel">
        <button
          type="button"
          className="product-carousel__arrow product-carousel__arrow--left"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          ‹
        </button>
        <div className="product-carousel__track" ref={trackRef}>
          {cards.map((card) => (
            <div key={card.cart_key || card.id} className="product-carousel__item">
              <ProductCard card={card} />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="product-carousel__arrow product-carousel__arrow--right"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </section>
  );
}
