import Link from 'next/link';
import { Zap, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', textAlign: 'center', padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-xl)', background: 'linear-gradient(135deg,var(--color-primary-700),var(--color-primary-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: 'var(--shadow-glow)' }}>
          <Zap size={28} color="white" />
        </div>
        <div style={{ fontSize: '6rem', fontWeight: 800, letterSpacing: '-0.05em', background: 'linear-gradient(135deg,var(--color-primary-400),var(--color-primary-600))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1, marginBottom: 8 }}>
          404
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 10 }}>Page not found</h1>
        <p style={{ color: 'var(--color-text-2)', fontSize: '0.9375rem', maxWidth: 360, margin: '0 auto 28px' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: 'linear-gradient(135deg,var(--color-primary-600),var(--color-primary-500))', color: '#fff', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500, boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
          <ArrowLeft size={15} /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
