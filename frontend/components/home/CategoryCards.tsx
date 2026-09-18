import Link from 'next/link';
import { STATIC_CATEGORIES, type StaticCategory, type StaticSubcategory } from '@/lib/static-data';

function CategoryMenu({ cat }: { cat: StaticCategory }) {
  if (!cat.children || cat.children.length === 0) return null;
  return (
    <li className="category-menu__item">
      <Link href={`/shop/${cat.slug}`} className="category-menu__title">
        {cat.name}
      </Link>
      {cat.children.length > 0 && (
        <ul className="category-menu__list">
          {cat.children.map((sub) => (
            <SubcatItem key={sub.slug} sub={sub} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SubcatItem({ sub }: { sub: StaticSubcategory }) {
  const parentSlug = sub.slug.split('/')[0];
  return (
    <li>
      <Link href={`/shop/${parentSlug}`} className="category-menu__link category-menu__link--sub">
        {sub.name}
      </Link>
      {sub.children && sub.children.length > 0 && (
        <ul className="category-menu__nested">
          {sub.children.map((grand) => (
            <li key={grand.slug}>
              <Link href={`/shop/${parentSlug}`} className="category-menu__link">
                {grand.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CategoryCards() {
  const topLevel = STATIC_CATEGORIES;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Shop by Category</h2>
        <Link href="/shop" className="btn btn-ghost">
          View all →
        </Link>
      </div>

      {/* Image cards for top-level categories */}
      <div className="category-grid">
        {topLevel.map((cat) => (
          <Link key={cat.id} href={`/shop/${cat.slug}`} className="category-card">
            <div className="category-card__img-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cat.image} alt={cat.name} className="category-card__img" loading="lazy" />
              <div className="category-card__overlay" />
            </div>
            <span className="category-card__label">{cat.name}</span>
          </Link>
        ))}
      </div>

      {/* Detailed category tree */}
      <div className="category-menu">
        <h3 className="category-menu__heading">Browse all departments</h3>
        <ul className="category-menu__grid">
          {topLevel.map((cat) => (
            <CategoryMenu key={cat.id} cat={cat} />
          ))}
        </ul>
      </div>
    </section>
  );
}
