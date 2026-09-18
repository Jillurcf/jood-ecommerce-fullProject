// Server-side API helpers for SSR data fetching.
//
// The backend uses two response shapes:
//  - envelope  { success, data, message?, error_code? }  (menu, search, recent, frequent, cart, wishlist)
//  - raw JSON  { success, ... }  (shop listing, product detail)
//
// Guest-cookie-dependent endpoints (cart/wishlist) are NOT used from the server;
// they are handled client-side so the browser can send the HttpOnly guest cookie.

import { ApiClient } from './api';
import {
  MenuData,
  ParentCategory,
  Category,
  ShopListing,
  ProductDetail,
  SearchItem,
  VariantCard,
} from './types';

const publicClient = new ApiClient();

export type ShopQuery = Record<string, string | string[]>;

/** Build a URLSearchParams from a possibly-array-valued query map (ShopQuery). */
export function toSearchParams(q: ShopQuery): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.filter(Boolean).forEach((x) => sp.append(k, x));
    else if (v !== '') sp.set(k, v);
  }
  return sp;
}

/** Normalize a ShopQuery (or searchParams map) to a string|string[] map suitable for filters.selected. */
export function normalizeShopQuery(q: Record<string, string | string[] | undefined>): ShopQuery {
  const out: ShopQuery = {};
  for (const [k, v] of Object.entries(q || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const vals = v.filter(Boolean) as string[];
      if (vals.length) out[k] = vals.length === 1 ? vals[0] : vals;
    } else if (v !== '') out[k] = v;
  }
  return out;
}

export async function getMenu(): Promise<MenuData> {
  const data = await publicClient.get<MenuData>('/catalog/menu');
  return data;
}

export async function getParentCategories(): Promise<ParentCategory[]> {
  const data = await publicClient.get<ParentCategory[]>('/catalog/parent-categories');
  return data;
}

export async function getCategories(parentId?: number): Promise<Category[]> {
  const q = parentId != null ? `?parent_id=${parentId}` : '';
  return publicClient.get<Category[]>(`/catalog/categories${q}`);
}

/**
 * Fetch a shop listing. Accepts a raw query string (already URLSearchParams-built)
 * and forwards request headers (cookies) so per-card is_fav/in_cart_qty enrichment
 * happens when available. Returns the raw JSON.
 */
export async function getShopListing(
  query: URLSearchParams,
  headers?: HeadersInit,
): Promise<ShopListing> {
  const url = `/shop?${query.toString()}`;
  const res = await fetch(`${publicBaseUrl()}${url}`, {
    cache: 'no-store',
    headers: headers
      ? (headers as Record<string, string>)
      : { 'Content-Type': 'application/json' },
  });
  return (await res.json()) as ShopListing;
}

export async function getShopListingByPath(
  subPath: string,
  query: URLSearchParams,
  headers?: HeadersInit,
): Promise<ShopListing> {
  const url = `${subPath}${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(`${publicBaseUrl()}${url}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...((headers || {}) as Record<string, string>) },
  });
  return (await res.json()) as ShopListing;
}

export async function getProductDetail(
  pid: string | number,
  vid?: string | number,
  headers?: HeadersInit,
): Promise<ProductDetail> {
  const v = vid != null ? `/${vid}` : '';
  const url = `/catalog/product-detail/${pid}${v}`;
  const res = await fetch(`${publicBaseUrl()}${url}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...((headers || {}) as Record<string, string>) },
  });
  return (await res.json()) as ProductDetail;
}

export async function getUniversalSearch(q: string): Promise<SearchItem[]> {
  const data = await publicClient.get<{ items: SearchItem[] }>(`/search/universal?q=${encodeURIComponent(q)}`);
  return data.items;
}

export async function getRecentProducts(limit = 30, inStockOnly = true): Promise<VariantCard[]> {
  const data = await publicClient.get<{ data: VariantCard[] }>(
    `/catalog/recent?limit=${limit}&in_stock_only=${inStockOnly}`,
  );
  return data.data;
}

export async function getFrequentProducts(limit = 30): Promise<VariantCard[]> {
  const data = await publicClient.get<{ data: VariantCard[] }>(`/catalog/frequent?limit=${limit}`);
  return data.data;
}

function publicBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
}
