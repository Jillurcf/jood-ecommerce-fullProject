'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ProductGrid from '@/components/product/ProductGrid';
import type { ShopListing } from '@/lib/types';
import { getShopListingClient } from '@/lib/api';
import { normalizeShopQuery, toSearchParams } from '@/lib/api-server';

interface ShopClientProps {
  initial: ShopListing;
  subPath?: string;
  heading?: React.ReactNode;
}

const RATING_OPTIONS = [4, 3, 2, 1];
const CONDITION_OPTIONS = ['new', 'used', 'refurbished'];

export default function ShopClient({ initial, subPath = '/shop', heading }: ShopClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Merged filter state derived from the URL (what the user sees is always in the URL).
  const query = useMemo(() => {
    const q: Record<string, string | string[]> = {};
    searchParams.forEach((value, key) => {
      if (q[key] === undefined) q[key] = value;
      else q[key] = Array.isArray(q[key]) ? [...(q[key] as string[]), value] : [q[key] as string, value];
    });
    // Ensure the scope page's base query is reflected even before first interaction.
    const merged = { ...q };
    if (!merged['in_stock_only']) merged['in_stock_only'] = 'true';
    return normalizeShopQuery(merged);
  }, [searchParams]);

  const [data, setData] = useState<ShopListing>(initial);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const firstRender = useRef(true);

  // When the URL changes (navigation from SSR or a pushed filter), refetch.
  const refetch = useCallback(
    async (params: URLSearchParams) => {
      setLoading(true);
      try {
        const next = await getShopListingClient(params, subPath);
        setData(next);
      } catch {
        /* ignore transient errors */
      } finally {
        setLoading(false);
      }
    },
    [subPath],
  );

  // Sync client state whenever the URL's query changes.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const params = toSearchParams(query);
    void refetch(params);
    setDrawerOpen(false);
  }, [query, refetch]);

  const commit = useCallback(
    (next: Record<string, string | string[]> | URLSearchParams) => {
      const params = next instanceof URLSearchParams ? next : toSearchParams(next);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [pathname, router],
  );

  const getSelected = (key: string): string[] => {
    const v = query[key];
    if (v === undefined) return [];
    return Array.isArray(v) ? v : [v];
  };

  const setArray = (key: string, value: string) => {
    const existing = getSelected(key);
    const next = existing.includes(value)
      ? existing.filter((x) => x !== value)
      : [...existing, value];
    const params = toSearchParams(query);
    params.delete(key);
    if (next.length) next.forEach((x) => params.append(key, x));
    if (!params.has('in_stock_only')) params.set('in_stock_only', 'true');
    commit(params);
  };

  const setScalar = (key: string, value: string) => {
    const params = toSearchParams(query);
    if (value) params.set(key, value);
    else params.delete(key);
    if (!params.has('in_stock_only')) params.set('in_stock_only', 'true');
    commit(params);
  };

  const setBoolean = (key: string, value: boolean) => {
    const params = toSearchParams(query);
    params.set(key, value ? 'true' : 'false');
    commit(params);
  };

  const clearAll = () => {
    const params = new URLSearchParams();
    params.set('in_stock_only', 'true');
    commit(params);
  };

  const priceMin = getSelected('price_min')[0] || '';
  const priceMax = getSelected('price_max')[0] || '';
  const inStockOnly = (query['in_stock_only'] ?? 'true') !== 'false';
  const activeFilterCount =
    getSelected('brand').length +
    getSelected('category_id').length +
    getSelected('model').length +
    getSelected('rating').length +
    getSelected('condition').length +
    (getSelected('price_min')[0] ? 1 : 0) +
    (getSelected('price_max')[0] ? 1 : 0);

  const hasResults = Array.isArray(data.data) && data.data.length > 0;

  const filterPanel = (
    <aside className={`shop__sidebar card ${drawerOpen ? 'is-open' : ''}`}>
      <div className="shop__sidebar-head">
        <h3 className="shop__sidebar-title">Filters</h3>
        {activeFilterCount > 0 && (
          <button type="button" className="shop__clear" onClick={clearAll}>
            Clear all{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
        )}
        <button
          type="button"
          className="shop__close"
          aria-label="Close filters"
          onClick={() => setDrawerOpen(false)}
        >
          &times;
        </button>
      </div>

      <div className="filter-group">
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setBoolean('in_stock_only', e.target.checked)}
          />
          <span>In stock only</span>
        </label>
      </div>

      {(data.filters?.parent_categories?.length ?? 0) > 0 && (
        <div className="filter-group">
          <h4>Department</h4>
          {data.filters.parent_categories.map((pc) => (
            <label key={pc.id ?? pc.name}>
              <input
                type="checkbox"
                checked={getSelected('parent_category_id').includes(String(pc.id ?? ''))}
                onChange={() => setArray('parent_category_id', String(pc.id ?? ''))}
              />
              <span>{pc.name}</span>
              <span className="filter-count">{pc.count}</span>
            </label>
          ))}
        </div>
      )}

      {data.filters?.categories && data.filters.categories.length > 0 && (
        <div className="filter-group">
          <h4>Category</h4>
          {data.filters.categories.map((c) => (
            <label key={c.id ?? c.name}>
              <input
                type="checkbox"
                checked={getSelected('category_id').includes(String(c.id ?? ''))}
                onChange={() => setArray('category_id', String(c.id ?? ''))}
              />
              <span>{c.name}</span>
              <span className="filter-count">{c.count}</span>
            </label>
          ))}
        </div>
      )}

      <div className="filter-group">
        <h4>Brand</h4>
        {(data.filters?.brands ?? []).map((b) => (
          <label key={b.value}>
            <input
              type="checkbox"
              checked={getSelected('brand').includes(b.value)}
              onChange={() => setArray('brand', b.value)}
            />
            <span>{b.value}</span>
            <span className="filter-count">{b.count}</span>
          </label>
        ))}
      </div>

      <div className="filter-group">
        <h4>Model</h4>
        {(data.filters?.models ?? []).map((m) => (
          <label key={m.value}>
            <input
              type="checkbox"
              checked={getSelected('model').includes(m.value)}
              onChange={() => setArray('model', m.value)}
            />
            <span>{m.value}</span>
            <span className="filter-count">{m.count}</span>
          </label>
        ))}
      </div>

      <div className="filter-group">
        <h4>Rating</h4>
        {RATING_OPTIONS.map((r) => (
          <label key={r}>
            <input
              type="checkbox"
              checked={getSelected('rating').includes(String(r))}
              onChange={() => setArray('rating', String(r))}
            />
            <span>{r}★ &amp; up</span>
            <span className="filter-count">
              {(data.filters?.ratings as { value: string; count: number }[] | undefined)
                ?.find((x) => x.value === String(r))?.count ?? ''}
            </span>
          </label>
        ))}
      </div>

      <div className="filter-group">
        <h4>Condition</h4>
        {CONDITION_OPTIONS.map((c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={getSelected('condition').includes(c)}
              onChange={() => setArray('condition', c)}
            />
            <span className="condition-label">{c}</span>
            <span className="filter-count">
              {(data.filters?.conditions as { value: string; count: number }[] | undefined)
                ?.find((x) => x.value === c)?.count ?? ''}
            </span>
          </label>
        ))}
      </div>

      <div className="filter-group">
        <h4>Price (AED)</h4>
        <div className="filter-price">
          <input
            type="number"
            placeholder="Min"
            defaultValue={priceMin}
            onBlur={(e) => setScalar('price_min', e.target.value)}
          />
          <span className="filter-price__sep">–</span>
          <input
            type="number"
            placeholder="Max"
            defaultValue={priceMax}
            onBlur={(e) => setScalar('price_max', e.target.value)}
          />
        </div>
      </div>

      {(data.filters?.attributes ?? []).map((attr) => (
        <div className="filter-group" key={attr.key}>
          <h4>{attr.heading}</h4>
          {attr.values.map((v) => (
            <label key={v.value}>
              <input
                type="checkbox"
                checked={getSelected(`attr_${attr.key}`).includes(v.value)}
                onChange={() => setArray(`attr_${attr.key}`, v.value)}
              />
              <span>{v.value}</span>
              <span className="filter-count">{v.count}</span>
            </label>
          ))}
        </div>
      ))}
    </aside>
  );

  const sortValue = String(query['sort'] || 'latest');

  return (
    <div className="shop">
      <button
        type="button"
        className="btn btn-outline shop__mobile-filters"
        onClick={() => setDrawerOpen(true)}
      >
        Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
      </button>

      {drawerOpen && <div className="shop__overlay" onClick={() => setDrawerOpen(false)} />}
      {filterPanel}

      <div className="shop__main">
        {heading}

        <div className="shop__toolbar">
          <span className="shop__result-count">
            {data.pagination?.total ?? 0} {data.pagination?.total === 1 ? 'product' : 'products'}
          </span>
          <label className="shop__sort">
            <span>Sort</span>
            <select
              value={sortValue}
              onChange={(e) => {
                setScalar('sort', e.target.value);
                setScalar('page', '1');
              }}
            >
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name_asc">Name: A to Z</option>
              <option value="name_desc">Name: Z to A</option>
              <option value="rating_asc">Rating: Low to High</option>
              <option value="rating_desc">Rating: High to Low</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="shop__skeleton" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 12 }).map((_, i) => (
              <div className="product-card product-card--skeleton" key={i}>
                <div className="skeleton skeleton--media" />
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--line skeleton--short" />
                <div className="skeleton skeleton--btn" />
              </div>
            ))}
          </div>
        ) : hasResults ? (
          data.data.map((group) => (
            <section
              className="shop__results"
              key={`${group.parent_category_id}-${group.heading}`}
            >
              <h3 className="shop__heading">{group.heading}</h3>
              <ProductGrid cards={group.items} />
            </section>
          ))
        ) : (
          <div className="empty-state">
            <h2>No products found</h2>
            <p>Try adjusting your filters.</p>
            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-primary" onClick={clearAll}>
                Clear all filters
              </button>
            )}
          </div>
        )}

        {data.pagination && data.pagination.total_pages > 1 && (
          <div className="pagination">
            <button
              type="button"
              className="btn btn-outline"
              disabled={data.pagination.page <= 1}
              onClick={() => setScalar('page', String(data.pagination.page - 1))}
            >
              Prev
            </button>
            {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`btn ${p === data.pagination.page ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setScalar('page', String(p))}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-outline"
              disabled={data.pagination.page >= data.pagination.total_pages}
              onClick={() => setScalar('page', String(data.pagination.page + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
