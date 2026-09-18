import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthContext';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import StoreChrome from '@/components/layout/StoreChrome';

export const metadata: Metadata = {
  title: {
    default: 'JOOD | Quality Goods & Products',
    template: '%s | JOOD',
  },
  description: 'Your one-stop online store for quality goods & products.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <StoreChrome header={<Header />} footer={<Footer />}>
            {children}
          </StoreChrome>
        </AuthProvider>
      </body>
    </html>
  );
}
