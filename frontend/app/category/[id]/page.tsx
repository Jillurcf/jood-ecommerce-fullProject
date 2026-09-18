import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getShopListingByPath, normalizeShopQuery, toSearchParams } from '@/lib/api-server';
import ShopClient from '@/components/shop/ShopClient';
import type { ShopListing } from '@/lib/types';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Category ${id}` };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const baseQuery = normalizeShopQuery(
    Object.fromEntries(
      Object.entries(sp || {}).map(([k, v]) => [k, v as string | string[] | undefined]),
    ),
  );
  if (!baseQuery['in_stock_only']) baseQuery['in_stock_only'] = 'true';
  const qs = toSearchParams(baseQuery);

  const cookieHeader = (await cookies()).toString();
  const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;

  let data: ShopListing | null = null;
  try {
    data = await getShopListingByPath(`/shop/subgroup/id/${id}`, qs, headers);
  } catch {
    data = null;
  }

  const fallback: ShopListing = {
    success: false,
    scope: {
      scopeType: 'subgroup',
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
      <h1 className="section-title" style={{ marginTop: '1.25rem' }}>
        {data?.scope?.subgroupName || data?.scope?.categoryName || `Category ${id}`}
      </h1>
      <ShopClient initial={data || fallback} subPath={`/shop/subgroup/id/${id}`} />
    </div>
  );
}
