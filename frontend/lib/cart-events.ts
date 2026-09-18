import { getCart } from '@/lib/api';

/** Re-fetch cart and notify header badge after any cart mutation. */
export async function refreshCart() {
  try {
    await getCart();
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jood:cart-updated'));
  }
}
