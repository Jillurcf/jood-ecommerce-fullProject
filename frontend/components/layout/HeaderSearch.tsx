'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUniversalSearch } from '@/lib/api-server';
import type { SearchItem } from '@/lib/types';

export default function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const items = await getUniversalSearch(q);
        setResults(items);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim() && results.length && setOpen(true)}
        placeholder="Search products, brands, categories…"
        aria-label="Search"
      />
      <button type="submit" className="btn btn-primary">
        Search
      </button>
      {open && results.length > 0 && (
        <div
          ref={boxRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow)',
            zIndex: 60,
            marginTop: '0.25rem',
            maxHeight: '360px',
            overflow: 'auto',
          }}
        >
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}-${i}`}
              type="button"
              onClick={() =>
                go(
                  r.type === 'parent'
                    ? `/shop/${r.slug}`
                    : r.type === 'category'
                      ? `/shop/${r.slug}`
                      : `/product/${r.id}`,
                )
              }
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.55rem 0.85rem',
                border: 'none',
                background: 'transparent',
                fontSize: '0.9rem',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--primary-dark)',
                  textTransform: 'uppercase',
                  marginRight: '0.5rem',
                }}
              >
                {r.type}
              </span>
              {r.name}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
