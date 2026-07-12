'use client';
import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Zap, ArrowLeft, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="sidebar-logo-icon"><Zap size={16} color="white" /></div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>AssetFlow</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)' }}>Enterprise Asset Management</p>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-xl)', background: 'rgba(20,184,166,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--color-primary-400)' }}>
              <Mail size={24} />
            </div>
            <h2 style={{ marginBottom: 8 }}>Check the server console</h2>
            <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              In this local setup, the reset link is printed to the API server console (no email service required).
            </p>
            <div style={{ marginTop: 24 }}>
              <Link href="/login" className="btn btn-secondary" style={{ display: 'inline-flex' }}>
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: 4 }}>Reset password</h1>
            <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 24 }}>
              Enter your email — we'll generate a reset link (shown in the server console).
            </p>

            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}><span>{error}</span></div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Email address" type="email" id="forgot-email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <Button type="submit" size="lg" loading={loading}>Send Reset Link</Button>
            </form>

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Link href="/login" style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
