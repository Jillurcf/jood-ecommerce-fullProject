import Link from 'next/link';
import type { Metadata } from 'next';
import { getRecentProducts, getFrequentProducts, getMenu } from '@/lib/api-server';
import ProductCarousel from '@/components/home/ProductCarousel';
import HeroCarousel from '@/components/home/HeroCarousel';
import CategoryCards from '@/components/home/CategoryCards';
import DealBanner from '@/components/home/DealBanner';
import { DEAL_PRODUCTS, PRODUCTS_BY_CATEGORY, STATIC_PRODUCTS } from '@/lib/static-data';
import type { VariantCard } from '@/lib/types';

export const metadata: Metadata = {
  title: 'JOOD | Quality Goods & Products',
};

export const revalidate = 60;

export default async function HomePage() {
  let recent: VariantCard[] = [];
  let frequent: VariantCard[] = [];
  let cats: { name: string; slug: string }[] = [];

  try {
    [recent, frequent] = await Promise.all([
      getRecentProducts(12, true),
      getFrequentProducts(8),
    ]);
  } catch {
    // non-fatal — fall back to static data
  }

  try {
    const menu = await getMenu();
    cats = menu.parents.map((p) => ({ name: p.name, slug: p.slug }));
  } catch {
    cats = [];
  }

  const recentCards = recent.length ? recent : STATIC_PRODUCTS.slice(0, 12);
  const frequentCards = frequent.length ? frequent : STATIC_PRODUCTS.slice(8, 16);
  const deals = DEAL_PRODUCTS.length ? DEAL_PRODUCTS : STATIC_PRODUCTS.slice(0, 8);
  const dealOfTheDay = deals[0] ?? STATIC_PRODUCTS[0];

  const fashion = PRODUCTS_BY_CATEGORY('fashion-garments');
  const homeDecor = PRODUCTS_BY_CATEGORY('home-decor');
  const appliances = PRODUCTS_BY_CATEGORY('home-appliances');

  return (
    <div className="container">
      <HeroCarousel />

      {cats.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Browse Categories</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {cats.map((c) => (
              <Link key={c.slug} href={`/shop/${c.slug}`} className="btn btn-outline">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <CategoryCards />

      {/* Full-width promotional banner */}
      <section className="section">
        <Link href="/shop" className="promo-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/banner/featured-banner.jpg" alt="Featured promotion" />
        </Link>
      </section>

      <ProductCarousel
        title="Top Deals"
        cards={deals}
        viewAllHref="/shop"
        viewAllLabel="See all deals →"
      />

      <DealBanner product={dealOfTheDay} />

      <ProductCarousel title="Recently Added" cards={recentCards} viewAllHref="/shop" />

      {fashion.length > 0 && (
        <ProductCarousel
          title="Fashion & Garments"
          cards={fashion}
          viewAllHref="/shop/fashion-garments"
        />
      )}

      <ProductCarousel title="Frequently Ordered" cards={frequentCards} viewAllHref="/shop" />

      {homeDecor.length > 0 && (
        <ProductCarousel
          title="Home Décor"
          cards={homeDecor}
          viewAllHref="/shop/home-decor"
        />
      )}

      {appliances.length > 0 && (
        <ProductCarousel
          title="Home Appliances"
          cards={appliances}
          viewAllHref="/shop/home-appliances"
        />
      )}

      {/* Secondary banner strip */}
      <section className="section">
        <Link href="/shop" className="promo-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/banner/2_1.jpg" alt="Weekly promotion" />
        </Link>
      </section>

      <ProductCarousel title="Recommended for You" cards={STATIC_PRODUCTS.slice(0, 10)} viewAllHref="/shop" />
    </div>
  );
}
