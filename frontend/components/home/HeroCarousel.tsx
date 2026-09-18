'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { STATIC_BANNERS } from '@/lib/static-data';

export default function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = STATIC_BANNERS.length;

  const next = useCallback(() => setActive((i) => (i + 1) % total), [total]);
  const prev = useCallback(() => setActive((i) => (i - 1 + total) % total), [total]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 5000);
    return () => clearInterval(id);
  }, [paused, next]);

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="hero-carousel__track">
        {STATIC_BANNERS.map((b, i) => {
          console.log('STATIC_BANNERS', b.image);
          return (
          <div
            key={b.id}
            className={`hero-carousel__slide ${i === active ? 'is-active' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.image} alt={b.title} className="hero-carousel__img" />
            <div className="hero-carousel__overlay">
              <h2 className="hero-carousel__title">{b.title}</h2>
              <p className="hero-carousel__subtitle">{b.subtitle}</p>
              <Link href={b.href} className="btn btn-primary hero-carousel__cta">
                {b.cta}
              </Link>
            </div>
          </div>
        )
        })}
      </div>

      <button type="button" className="hero-carousel__arrow hero-carousel__arrow--left" onClick={prev} aria-label="Previous">
        ‹
      </button>
      <button type="button" className="hero-carousel__arrow hero-carousel__arrow--right" onClick={next} aria-label="Next">
        ›
      </button>

      <div className="hero-carousel__dots">
        {STATIC_BANNERS.map((b, i) => (
          <button
            key={b.id}
            type="button"
            className={`hero-carousel__dot ${i === active ? 'is-active' : ''}`}
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
