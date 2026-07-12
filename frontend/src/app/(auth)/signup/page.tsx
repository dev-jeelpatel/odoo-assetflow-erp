'use client';
import React, { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Zap, ArrowRight, Info } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useEffect } from 'react';

interface Dept { id: number; name: string; }

export default function SignupPage() {
  const { refresh, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deptId, setDeptId] = useState('');
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // See src/proxy.ts — an already-authenticated visit to /signup is detected
  // and redirected here instead of in middleware, since a token cookie alone
  // doesn't confirm the session is still valid.
  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  useEffect(() => {
    api.get<Dept[]>('/departments?limit=100').then(r => setDepts(r.data)).catch(() => {});
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) errs.name = 'Name must be at least 2 characters.';
    if (!email.includes('@')) errs.email = 'Enter a valid email address.';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    return errs;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await api.post('/auth/signup', {
        name: name.trim(), email: email.trim().toLowerCase(),
        password, department_id: deptId ? Number(deptId) : null,
      });
      await refresh();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const fe: Record<string, string> = {};
          err.details.forEach(d => { fe[d.field] = d.message; });
          setFieldErrors(fe);
        } else {
          setError(err.message);
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="sidebar-logo-icon">
            <Zap size={16} color="white" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>AssetFlow</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)' }}>Enterprise Asset Management</p>
          </div>
        </div>

        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: 4 }}>Create account</h1>
        <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 16 }}>
          Join your organization on AssetFlow
        </p>

        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: '0.8rem' }}>
            Signing up creates an <strong>Employee</strong> account. An Admin assigns roles from the Employee Directory.
          </span>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
          <Input
            label="Full name"
            type="text"
            id="signup-name"
            placeholder="Priya Shah"
            value={name}
            onChange={e => setName(e.target.value)}
            error={fieldErrors.name}
            autoComplete="name"
            required
          />
          <Input
            label="Work email"
            type="email"
            id="signup-email"
            placeholder="priya@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            error={fieldErrors.email}
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            id="signup-password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            error={fieldErrors.password}
            autoComplete="new-password"
            required
          />
          <Select
            label="Department (optional)"
            id="signup-dept"
            value={deptId}
            onChange={e => setDeptId(e.target.value)}
            placeholder="Select department"
          >
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>

          <Button type="submit" size="lg" loading={loading} rightIcon={<ArrowRight size={16} />} style={{ marginTop: 4 }}>
            Create Account
          </Button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-2)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--color-primary-400)', textDecoration: 'none', fontWeight: 500 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
