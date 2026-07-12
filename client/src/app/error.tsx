'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[AssetFlow Error]', error); }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', textAlign: 'center', padding: 24 }}>
      <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-xl)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#f87171' }}>
        <AlertTriangle size={28} />
      </div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 10 }}>Something went wrong</h1>
      <p style={{ color: 'var(--color-text-2)', fontSize: '0.9rem', maxWidth: 400, margin: '0 auto 28px', lineHeight: 1.6 }}>
        An unexpected error occurred. The error has been logged. Please try refreshing or go back to the dashboard.
      </p>
      {error?.message && (
        <div style={{ marginBottom: 24, padding: '10px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 'var(--radius-md)', maxWidth: 480, fontSize: '0.8rem', color: '#f87171', fontFamily: 'var(--font-mono)' }}>
          {error.message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={reset} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: 'rgba(20,184,166,0.1)', color: 'var(--color-primary-400)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
          <RefreshCw size={15} /> Try again
        </button>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: 'var(--color-surface)', color: 'var(--color-text-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
          <ArrowLeft size={15} /> Dashboard
        </Link>
      </div>
    </div>
  );
}
