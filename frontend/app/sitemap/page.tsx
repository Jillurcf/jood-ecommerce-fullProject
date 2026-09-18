import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Sitemap' };

export default function SitemapPage() {
  return (
    <div className="container section">
      <h1 className="section-title" style={{ marginBottom: '1.25rem' }}>
        Sitemap
      </h1>
      <div className="card" style={{ padding: '1.5rem', maxWidth: '640px' }}>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/shop">Shop All</Link>
          </li>
          <li>
            <Link href="/cart">Cart</Link>
          </li>
          <li>
            <Link href="/wishlist">Wishlist</Link>
          </li>
          <li>
            <Link href="/search">Search</Link>
          </li>
          <li>
            <Link href="/about">About Us</Link>
          </li>
          <li>
            <Link href="/legal">Legal / Terms</Link>
          </li>
          <li>
            <Link href="/support">Contact / Support</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
