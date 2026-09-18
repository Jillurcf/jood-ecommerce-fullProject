'use client';

import { useEffect, useState } from 'react';
import { getCart } from '@/lib/api';

export default function CartCountBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    getCart()
      .then((rows) => {
        if (!active) return;
        setCount(rows.reduce((sum, r) => sum + r.quantity, 0));
      })
      .catch(() => {
        /* guest token not yet issued — fine */
      });

    const handler = () =>
      getCart()
        .then((rows) => active && setCount(rows.reduce((sum, r) => sum + r.quantity, 0)))
        .catch(() => {});
    window.addEventListener('jood:cart-updated', handler as EventListener);
    return () => {
      active = false;
      window.removeEventListener('jood:cart-updated', handler as EventListener);
    };
  }, []);

  if (count === 0) return null;
  return <span className="cart-count">{count > 99 ? '99+' : count}</span>;
}
