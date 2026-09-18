'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/products', label: 'Products', icon: '📦' },
  { href: '/admin/categories', label: 'Categories', icon: '🏷' },
  { href: '/admin/orders', label: 'Orders', icon: '🧾' },
  { href: '/admin/customers', label: 'Customers', icon: '👤' },
  { href: '/admin/admins', label: 'Admins', icon: '🛡' },
  { href: '/admin/billing', label: 'Billing', icon: '💰' },
  { href: '/admin/transactions', label: 'Transactions', icon: '📋' },
  { href: '/admin/visitors', label: 'Visitors', icon: '👁' },
  { href: '/admin/support', label: 'Support', icon: '💬' },
  { href: '/admin/profile', label: 'Profile', icon: '⚙' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, signOut } = useAuth();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try { await signOut(); } catch {}
    router.replace('/admin/sign-in');
  };

  return (
    <aside className="admin-sidebar card">
      <div className="admin-sidebar__header">
        <div className="admin-avatar">
          {admin?.full_name?.charAt(0)?.toUpperCase() || 'A'}
        </div>
        <div>
          <div className="admin-sidebar__name">{admin?.full_name || 'Admin'}</div>
          <div className="admin-sidebar__role">{admin?.role?.replace('_', ' ') || 'admin'}</div>
        </div>
      </div>
      <nav className="admin-nav">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-nav__link${isActive(item.href) ? ' is-active' : ''}`}
          >
            <span className="admin-nav__icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <button className="admin-nav__link admin-nav__logout" onClick={handleLogout}>
          <span className="admin-nav__icon">🚪</span>
          Sign Out
        </button>
      </nav>
    </aside>
  );
}
