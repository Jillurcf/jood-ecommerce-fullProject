import Link from 'next/link';
import Image from 'next/image';
import { getMenu } from '@/lib/api-server';
import HeaderSearch from './HeaderSearch';
import CartCountBadge from './CartCount';
import AuthHeader from '@/components/auth/AuthHeader';

export default async function Header() {
  let parents: { id: number; name: string; slug: string }[] = [];
  try {
    const menu = await getMenu();
    parents = menu.parents;
  } catch {
    parents = [];
  }

  return (
    <>
      <div className="topbar">
        <div className="container topbar__inner">
          <span>Quality Goods &amp; Products</span>
          <span>Free shipping on qualifying orders</span>
        </div>
      </div>

      <header className="header">
        <div className="container header__inner">
          <Link href="/" className="logo">
            <Image
              src="/isa_good_life_logo.jpeg"
              alt="JOOD"
              width={140}
              height={44}
              style={{ display: 'block', objectFit: 'contain' }}
            />
          </Link>
          <div className="header__search">
            <HeaderSearch />
          </div>
          <div className="header__actions">
            <Link href="/wishlist" className="header__action" aria-label="Wishlist">
              <span aria-hidden>♡</span> Wishlist
            </Link>
            <Link href="/cart" className="header__action" aria-label="Cart">
              <span aria-hidden>🛒</span> Cart
              <CartCountBadge />
            </Link>
            <AuthHeader />
          </div>
        </div>
      </header>

      <nav className="nav">
        <div className="container nav__inner">
          <Link href="/" className="nav__link">
            Home
          </Link>
          <Link href="/shop" className="nav__link">
            Shop All
          </Link>
          {parents.map((p) => (
            <Link key={p.id} href={`/shop/${p.slug}`} className="nav__link">
              {p.name}
            </Link>
          ))}
        </div>
      </nav>

      <div className="promo-strip">Free delivery on orders over AED 200 · 30-day returns</div>
    </>
  );
}
