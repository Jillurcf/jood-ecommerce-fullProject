'use client';

import { useEffect } from 'react';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled page error:', error);
  }, [error]);

  return (
    <div className="container section" style={{ textAlign: 'center', padding: '6rem 1rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😕</div>
      <h1 className="admin-page-title" style={{ marginBottom: '0.5rem' }}>
        Something went wrong
      </h1>
      <p style={{ color: 'var(--muted)', maxWidth: 480, margin: '0 auto 1.5rem' }}>
        An unexpected error occurred while loading this page. Please try again.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
