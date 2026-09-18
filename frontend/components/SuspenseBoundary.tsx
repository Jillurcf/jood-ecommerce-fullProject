'use client';

import { Suspense, type ReactNode } from 'react';

/**
 * Wraps a client component that calls useSearchParams() (or other CSR-only
 * hooks) in a Suspense boundary so Next.js can statically prerender the page.
 */
export default function SuspenseBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
