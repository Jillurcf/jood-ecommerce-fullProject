'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafaf9', color: '#1f2937' }}>
        <div style={{ textAlign: 'center', padding: '6rem 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😵</div>
          <h1 style={{ margin: '0 0 0.5rem' }}>Critical error</h1>
          <p style={{ color: '#6b7280', margin: '0 0 1.5rem' }}>
            Something went badly wrong. Please reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: 8,
              border: 'none',
              background: '#1c953f',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
