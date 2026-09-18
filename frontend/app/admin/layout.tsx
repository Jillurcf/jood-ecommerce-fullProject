'use client';

import { usePathname } from 'next/navigation';
import AdminGuard from '@/components/auth/AdminGuard';
import AdminSidebar from '@/components/admin/AdminSidebar';

const PUBLIC_ADMIN_PATHS = ['/admin/sign-in', '/admin/sign-in/verify-otp', '/admin/sign-in/forgot-password'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ADMIN_PATHS.includes(pathname);

  return (
    <AdminGuard>
      {isPublic ? (
        <div className="admin-auth-page">{children}</div>
      ) : (
        <div className="admin-layout">
          <AdminSidebar />
          <div className="admin-main">
            <div className="admin-main__inner">{children}</div>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
