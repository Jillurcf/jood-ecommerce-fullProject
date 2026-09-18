import type { Metadata } from 'next';
import Link from 'next/link';
import { getUniversalSearch } from '@/lib/api-server';
import type { SearchItem } from '@/lib/types';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp?.q || '').trim();
  let items: SearchItem[] = [];
  if (q) {
    try {
      items = await getUniversalSearch(q);
    } catch {
      items = [];
    }
  }

  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1rem' }}>
        {q ? `Results for “${q}”` : 'Search'}
      </h1>

      {!q ? (
        <p className="empty-state">Type a search term above to find products.</p>
      ) : items.length === 0 ? (
        <p className="empty-state">
          <h2>No results</h2>
          Try a different keyword.
        </p>
      ) : (
        <div className="card" style={{ padding: '1rem' }}>
          {items.map((r, i) => (
            <Link
              key={`${r.type}-${r.id}-${i}`}
              href={
                r.type === 'product'
                  ? `/product/${r.id}`
                  : r.type === 'category'
                    ? `/category/${r.id}`
                    : `/shop/${r.slug}`
              }
              className="filter-link"
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
              {r.brand ? <span style={{ color: 'var(--muted)', marginLeft: '0.5rem', fontSize: '0.85rem' }}>· {r.brand}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
