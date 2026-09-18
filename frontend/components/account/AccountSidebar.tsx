'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';

const links = [
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/payment-methods', label: 'Payment Methods' },
  { href: '/account/billing', label: 'Billing' },
  { href: '/account/transaction-history', label: 'Transaction History' },
  { href: '/account/security', label: 'Security' },
];

export default function AccountSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="account-sidebar card">
      <div className="account-sidebar__header">
        <div className="account-avatar">
          {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div>
          <div className="account-sidebar__name">{user?.full_name || 'User'}</div>
          <div className="account-sidebar__email">{user?.email || ''}</div>
        </div>
      </div>
      <nav className="account-nav">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`account-nav__link ${pathname === link.href ? 'is-active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        className="btn btn-ghost account-nav__logout"
        onClick={() => signOut()}
      >
        Sign Out
      </button>
    </aside>
  );
}
