'use client';
import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';

export default function AppRootLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Middleware guarantees a token exists before we reach here.
  // Show a minimal loader while the AuthProvider hydrates user data.
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" style={{ color: 'var(--color-primary-500)' }} />
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
