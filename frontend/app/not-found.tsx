import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container section" style={{ textAlign: 'center', padding: '6rem 1rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
      <h1 className="admin-page-title" style={{ marginBottom: '0.5rem' }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--muted)', maxWidth: 480, margin: '0 auto 1.5rem' }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" className="btn btn-primary">
        Back to home
      </Link>
    </div>
  );
}
