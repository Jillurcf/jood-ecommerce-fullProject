import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication Callback',
};

export default function CallbackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
