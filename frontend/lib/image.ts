// Image URL helper — builds absolute /uploads URLs pointing at the backend.
// Catalog variant cards return a raw filename (or main_image); wishlist items are
// already normalized by the backend with a leading slash. This normalizes both.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
const APP_URL = API_BASE.replace(/\/api\/?$/, '');

export function normalizeImage(raw: unknown, defaultImg = '/uploads/products/default.jpg'): string {
  const value = raw == null ? '' : String(raw).replace(/\\/g, '/').trim();
  if (!value) return APP_URL + defaultImg;
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/')) {
    return value;
  }
  return `${APP_URL}/uploads/${value}`;
}

export function appBaseUrl(): string {
  return APP_URL;
}

/** Resolve /uploads paths to absolute URLs when rendering product images. */
export function uploadUrl(path: string | null | undefined): string {
  if (!path) return APP_URL + '/uploads/products/default.jpg';
  return normalizeImage(path);
}
