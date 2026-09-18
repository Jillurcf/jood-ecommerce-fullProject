'use client';

import { usePathname } from 'next/navigation';

export default function StoreChrome({
  children,
  header,
  footer,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) return <>{children}</>;

  return (
    <div className="store-chrome">
      {header}
      <main className="store-chrome__main">{children}</main>
      {footer}
    </div>
  );
}
