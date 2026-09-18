import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getShopListingByPath, getMenu, normalizeShopQuery, toSearchParams } from '@/lib/api-server';
import ShopClient from '@/components/shop/ShopClient';
import type { ShopListing } from '@/lib/types';

export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const menu = await getMenu();
    return menu.parents.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: decodeURIComponent(slug) };
}

export default async function ShopGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
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
    data = await getShopListingByPath(`/shop/group/${slug}`, qs, headers);
  } catch {
    data = null;
  }

  const fallback: ShopListing = {
    success: false,
    scope: {
      scopeType: 'group',
      parentCategoryId: null,
      parentCategoryName: null,
      parentCategorySlug: slug,
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
        subPath={`/shop/group/${slug}`}
        heading={
          <>
            <h1 className="shop__page-title">
              {data?.scope?.parentCategoryName || decodeURIComponent(slug)}
            </h1>
            <p className="shop__intro">
              Browse products with fast filtering by category, brand, price, rating, and attributes.
            </p>
          </>
        }
      />
    </div>
  );
}
