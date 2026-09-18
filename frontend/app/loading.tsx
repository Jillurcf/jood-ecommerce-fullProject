export default function Loading() {
  return (
    <div className="container section" style={{ textAlign: 'center', padding: '6rem 1rem' }}>
      <div
        style={{
          width: 40,
          height: 40,
          margin: '0 auto 1rem',
          border: '3px solid var(--line)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'jood-spin .8s linear infinite',
        }}
      />
      <p style={{ color: 'var(--muted)' }}>Loading…</p>
      <style>{`@keyframes jood-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
