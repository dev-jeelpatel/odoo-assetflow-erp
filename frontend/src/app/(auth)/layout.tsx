import { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AssetFlow — Sign In',
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
