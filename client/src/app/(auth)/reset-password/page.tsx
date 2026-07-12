'use client';
import React, { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, CheckCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) { setError('Invalid reset link. Request a new one.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return done ? (
    <div style={{ textAlign: 'center' }}>
      <CheckCircle size={48} color="var(--color-success)" style={{ margin: '0 auto 16px' }} />
      <h2>Password updated!</h2>
      <p style={{ color: 'var(--color-text-2)', marginTop: 8 }}>Redirecting to sign in…</p>
    </div>
  ) : (
    <>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: 4 }}>Set new password</h1>
      <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 24 }}>Choose a strong password for your account.</p>
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}><span>{error}</span></div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="New password" type="password" id="new-password" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required />
        <Input label="Confirm password" type="password" id="confirm-password" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        <Button type="submit" size="lg" loading={loading} style={{ marginTop: 4 }}>Update Password</Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
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
        <Suspense fallback={<div className="spinner-center"><div className="spinner spinner-lg" /></div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
