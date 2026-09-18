'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';

const PUBLIC_ADMIN_PATHS = ['/admin/sign-in', '/admin/sign-in/verify-otp', '/admin/sign-in/forgot-password'];

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { loading, type } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_ADMIN_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (isPublic) return;
    if (type !== 'admin') {
      router.replace('/admin/sign-in');
    }
  }, [loading, type, router, isPublic]);

  if (loading) {
    return (
      <div className="admin-loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (!isPublic && type !== 'admin') return null;

  return <>{children}</>;
}
