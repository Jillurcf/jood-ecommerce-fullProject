import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div>
          <Image
            src="/web-img-vid/logo.png"
            alt="Jood"
            width={140}
            height={50}
            style={{ display: 'block', objectFit: 'contain' }}
          />
          <p style={{ fontSize: '0.85rem', color: '#cfd3da', marginTop: '0.75rem' }}>
            Your one-stop online store for quality goods &amp; products.
          </p>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>
            <li>
              <Link href="/shop">Shop All</Link>
            </li>
            <li>
              <Link href="/cart">Cart</Link>
            </li>
            <li>
              <Link href="/wishlist">Wishlist</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Support</h4>
          <ul>
            <li>
              <Link href="/support">Contact / Support</Link>
            </li>
            <li>
              <Link href="/sitemap">Sitemap</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li>
              <Link href="/about">About Us</Link>
            </li>
            <li>
              <Link href="/legal">Legal / Terms</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer__bottom container">
        © {new Date().getFullYear()} Jood — Quality Goods &amp; Products. All rights reserved.
      </div>
    </footer>
  );
}
