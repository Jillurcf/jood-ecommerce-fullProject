import AuthGuard from '@/components/auth/AuthGuard';
import AccountSidebar from '@/components/account/AccountSidebar';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="container section">
        <div className="account-layout">
          <AccountSidebar />
          <div className="account-main">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
