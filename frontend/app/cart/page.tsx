import type { Metadata } from 'next';
import CartClient from '@/components/cart/CartClient';

export const metadata: Metadata = { title: 'Cart' };

export default function CartPage() {
  return <CartClient />;
}
