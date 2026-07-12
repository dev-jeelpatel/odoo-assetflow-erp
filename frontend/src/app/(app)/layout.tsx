'use client';
import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';

export default function AppRootLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Middleware only checks that an af_token cookie exists, not that it's still
  // valid — if /auth/me rejects a stale/invalid token, user stays null after
  // loading finishes, so we must redirect instead of spinning forever.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" style={{ color: 'var(--color-primary-500)' }} />
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
