import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getShopListing, toSearchParams } from '@/lib/api-server';
import ShopClient from '@/components/shop/ShopClient';
import type { ShopListing } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Browse all products at Jood.',
};

export const revalidate = 60;

export type ShopQuery = Record<string, string | string[]>;

function buildQuery(searchParams: Record<string, string | string[] | undefined>): ShopQuery {
  const q: ShopQuery = {};
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const vals = v.filter(Boolean) as string[];
      if (vals.length === 1) q[k] = vals[0];
      else if (vals.length > 1) q[k] = vals;
    } else if (v) q[k] = v;
  }
  if (!q['in_stock_only']) q['in_stock_only'] = 'true';
  return q;
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const baseQuery = buildQuery(sp || {});
  const qs = toSearchParams(baseQuery);

  const cookieHeader = (await cookies()).toString();
  const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;

  let data: ShopListing | null = null;
  try {
    data = await getShopListing(qs, headers);
  } catch {
    data = null;
  }

  const fallback: ShopListing = {
    success: false,
    scope: {
      scopeType: 'shop',
      parentCategoryId: null,
      parentCategoryName: null,
      parentCategorySlug: null,
      categoryId: null,
      categoryName: null,
      categorySlug: null,
      subgroupId: null,
      subgroupName: null,
      subgroupSlug: null,
      productId: null,
      productName: null,
      productSlug: null,
    },
    filters: {
      parent_categories: [],
      categories: [],
      brands: [],
      models: [],
      attributes: [],
      price_range: { min: null, max: null },
      base_price_range: { min: null, max: null },
      selected: baseQuery,
    },
    pagination: { page: 1, limit: 24, total: 0, total_pages: 1 },
    data: [],
    cards: [],
    flat: [],
  };

  return (
    <div className="container">
      <ShopClient
        initial={data || fallback}
        subPath="/shop"
        heading={
          <>
            <h1 className="shop__page-title">Shop All</h1>
            <p className="shop__intro">
              Browse all products at JOODwith fast filtering by department, category, brand, price, rating, and attributes.
            </p>
          </>
        }
      />
    </div>
  );
}
