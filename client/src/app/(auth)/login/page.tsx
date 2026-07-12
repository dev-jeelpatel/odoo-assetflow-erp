'use client';
import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Zap, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="sidebar-logo-icon">
            <Zap size={16} color="white" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>AssetFlow</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)' }}>Enterprise Asset Management</p>
          </div>
        </div>

        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: 4 }}>Welcome back</h1>
        <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 24 }}>
          Sign in to your account to continue
        </p>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 20 }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
          <Input
            label="Email address"
            type="email"
            id="login-email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type={showPass ? 'text' : 'password'}
            id="login-password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            rightIcon={
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ color: 'var(--color-text-3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
            <Link href="/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--color-primary-400)', textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" loading={loading} rightIcon={<ArrowRight size={16} />} style={{ marginTop: 4 }}>
            Sign In
          </Button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-2)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" style={{ color: 'var(--color-primary-400)', textDecoration: 'none', fontWeight: 500 }}>
            Create one
          </Link>
        </div>

        <div style={{ marginTop: 20, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.12)', fontSize: '0.75rem', color: 'var(--color-text-3)' }}>
          <strong style={{ color: 'var(--color-text-2)' }}>Demo credentials:</strong><br />
          admin@assetflow.local / Admin@1234
        </div>
      </div>
    </div>
  );
}
