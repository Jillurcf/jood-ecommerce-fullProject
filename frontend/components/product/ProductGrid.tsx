import ProductCard from './ProductCard';
import type { VariantCard } from '@/lib/types';

export default function ProductGrid({ cards }: { cards: VariantCard[] }) {
  if (!cards.length) return null;
  return (
    <div className="product-grid">
      {cards.map((card) => (
        <ProductCard key={card.cart_key || card.id} card={card} />
      ))}
    </div>
  );
}
