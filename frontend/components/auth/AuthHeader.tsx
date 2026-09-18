'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';

export default function AuthHeader() {
  const { loading, type, user, admin } = useAuth();

  if (loading) return null;

  if (type === 'customer' && user) {
    return (
      <div className="header__auth-menu">
        <Link href="/account" className="header__action">
          <span aria-hidden>👤</span> {user.full_name.split(' ')[0]}
        </Link>
      </div>
    );
  }

  if (type === 'admin' && admin) {
    return (
      <div className="header__auth-menu">
        <Link href="/admin" className="header__action">
          <span aria-hidden>🛡</span> Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="header__auth-menu">
      <Link href="/auth/sign-in" className="header__action">
        <span aria-hidden>👤</span> Sign In
      </Link>
    </div>
  );
}
