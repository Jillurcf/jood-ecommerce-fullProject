'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';

/**
 * Client-side auth guard. Renders children only when authenticated as a customer.
 * Redirects to /auth/sign-in when not authenticated.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, type } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && type !== 'customer') {
      router.replace('/auth/sign-in');
    }
  }, [loading, type, router]);

  if (loading) {
    return (
      <div className="container section" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  if (type !== 'customer') return null;

  return <>{children}</>;
}
