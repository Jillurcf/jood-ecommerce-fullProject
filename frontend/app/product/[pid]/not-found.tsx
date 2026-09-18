import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="container section" style={{ textAlign: 'center', padding: '6rem 1rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
      <h1 className="admin-page-title" style={{ marginBottom: '0.5rem' }}>
        Product not found
      </h1>
      <p style={{ color: 'var(--muted)', maxWidth: 480, margin: '0 auto 1.5rem' }}>
        This product is unavailable or may no longer be in our catalog.
      </p>
      <Link href="/shop" className="btn btn-primary">
        Browse the shop
      </Link>
    </div>
  );
}
