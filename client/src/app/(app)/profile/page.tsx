'use client';
import React, { useState, useEffect, FormEvent } from 'react';
import { User, Lock, Bell, Shield, Save, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { initials, prettyStatus } from '@/lib/utils';

const TABS = [
  { id: 'profile', label: 'My Profile', icon: <User size={15} /> },
  { id: 'password', label: 'Change Password', icon: <Lock size={15} /> },
  { id: 'notifications', label: 'Preferences', icon: <Bell size={15} /> },
];

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('profile');

  // Profile form
  const [name, setName] = useState(user?.name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false });
  const [savingPw, setSavingPw] = useState(false);

  // Notification prefs
  const [prefs, setPrefs] = useState({ overdue_email: true, booking_reminder: true, transfer_email: true });
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => { if (user) setName(user.name); }, [user]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast('Name cannot be empty.', 'warning'); return; }
    setSavingProfile(true);
    try {
      await api.patch('/auth/me', { name });
      await refresh();
      toast('Profile updated.', 'success');
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to update profile.', 'error'); }
    finally { setSavingProfile(false); }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) { toast('New password must be at least 8 characters.', 'warning'); return; }
    if (pw.next !== pw.confirm) { toast('Passwords do not match.', 'warning'); return; }
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', { current_password: pw.current, new_password: pw.next });
      toast('Password changed successfully.', 'success');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to change password.', 'error'); }
    finally { setSavingPw(false); }
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      await api.patch('/auth/notification-prefs', prefs);
      toast('Preferences saved.', 'success');
    } catch { toast('Failed to save.', 'error'); }
    finally { setSavingPrefs(false); }
  };

  const ROLE_COLORS: Record<string, string> = {
    ADMIN: '#0f766e', ASSET_MANAGER: '#1d4ed8', DEPT_HEAD: '#7e22ce', EMPLOYEE: '#475569',
  };
  const ROLE_BG: Record<string, string> = {
    ADMIN: '#ccfbf1', ASSET_MANAGER: '#dbeafe', DEPT_HEAD: '#f3e8ff', EMPLOYEE: '#f1f5f9',
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Profile header card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, padding: '24px 28px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem', fontWeight: 700, color: '#fff', flexShrink: 0,
          boxShadow: '0 4px 12px rgba(20,184,166,0.25)',
        }}>
          {user ? initials(user.name) : '?'}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
            {user?.name}
          </h1>
          <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 8 }}>{user?.email}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600,
              background: ROLE_BG[user?.role ?? 'EMPLOYEE'], color: ROLE_COLORS[user?.role ?? 'EMPLOYEE'],
              border: `1px solid ${ROLE_COLORS[user?.role ?? 'EMPLOYEE']}30`,
            }}>
              <Shield size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              {prettyStatus(user?.role ?? '')}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600,
              background: user?.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
              color: user?.status === 'ACTIVE' ? '#15803d' : '#b91c1c',
              border: `1px solid ${user?.status === 'ACTIVE' ? '#86efac' : '#fca5a5'}`,
            }}>
              <CheckCircle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              {prettyStatus(user?.status ?? '')}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} id={`profile-tab-${t.id}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t.icon}{t.label}</span>
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>Personal Information</h3>
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input label="Full name" id="profile-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required />
            <div className="input-wrapper">
              <label className="input-label">Email address</label>
              <input className="input" value={user?.email ?? ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <p className="input-helper">Email cannot be changed. Contact your admin if needed.</p>
            </div>
            <div className="form-grid">
              <div className="input-wrapper">
                <label className="input-label">Role</label>
                <input className="input" value={prettyStatus(user?.role ?? '')} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              </div>
              <div className="input-wrapper">
                <label className="input-label">Department</label>
                <input className="input" value={user?.department_id ? `Dept #${user.department_id}` : 'No department'} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <Button type="submit" loading={savingProfile} leftIcon={<Save size={15} />}>Save Changes</Button>
            </div>
          </form>
        </div>
      )}

      {/* Password tab */}
      {tab === 'password' && (
        <div className="card">
          <h3 style={{ marginBottom: 4 }}>Change Password</h3>
          <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 20 }}>
            Use a strong password with at least 8 characters, uppercase, and a number.
          </p>
          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-wrapper">
              <label className="input-label">Current password</label>
              <div style={{ position: 'relative' }}>
                <input id="pw-current" className="input" type={showPw.current ? 'text' : 'password'} value={pw.current}
                  onChange={e => setPw(p => ({ ...p, current: e.target.value }))} placeholder="Your current password" required
                  style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)' }}>
                  {showPw.current ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="input-wrapper">
              <label className="input-label">New password</label>
              <div style={{ position: 'relative' }}>
                <input id="pw-new" className="input" type={showPw.next ? 'text' : 'password'} value={pw.next}
                  onChange={e => setPw(p => ({ ...p, next: e.target.value }))} placeholder="Min. 8 characters" required
                  style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(s => ({ ...s, next: !s.next }))}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)' }}>
                  {showPw.next ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <Input label="Confirm new password" id="pw-confirm" type="password" value={pw.confirm}
              onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" required />

            {/* Strength hint */}
            {pw.next && (
              <div style={{ display: 'flex', gap: 4 }}>
                {[8, 12, 16].map(n => (
                  <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: pw.next.length >= n ? (n === 16 ? '#16a34a' : n === 12 ? '#d97706' : '#dc2626') : 'var(--color-surface-3)' }} />
                ))}
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-3)', alignSelf: 'center', marginLeft: 6 }}>
                  {pw.next.length < 8 ? 'Too short' : pw.next.length < 12 ? 'Weak' : pw.next.length < 16 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <Button type="submit" loading={savingPw} leftIcon={<Lock size={15} />}>Update Password</Button>
            </div>
          </form>
        </div>
      )}

      {/* Preferences tab */}
      {tab === 'notifications' && (
        <div className="card">
          <h3 style={{ marginBottom: 4 }}>Notification Preferences</h3>
          <p style={{ color: 'var(--color-text-2)', fontSize: '0.875rem', marginBottom: 20 }}>
            Choose which notifications you receive.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { key: 'overdue_email', label: 'Overdue allocation alerts', desc: 'Get notified when an asset is overdue for return' },
              { key: 'booking_reminder', label: 'Booking reminders', desc: 'Remind me 30 minutes before a booking starts' },
              { key: 'transfer_email', label: 'Transfer request updates', desc: 'Notify me when a transfer I requested is approved or rejected' },
            ].map((item, i) => (
              <label key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}>
                <div>
                  <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.label}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)', marginTop: 2 }}>{item.desc}</p>
                </div>
                {/* Toggle switch */}
                <div style={{ position: 'relative', flexShrink: 0, marginLeft: 16 }}>
                  <input type="checkbox" checked={prefs[item.key as keyof typeof prefs]}
                    onChange={e => setPrefs(p => ({ ...p, [item.key]: e.target.checked }))}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                  <div onClick={() => setPrefs(p => ({ ...p, [item.key]: !p[item.key as keyof typeof prefs] }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'background 200ms',
                      background: prefs[item.key as keyof typeof prefs] ? 'var(--color-primary-500)' : 'var(--color-surface-3)',
                      border: `2px solid ${prefs[item.key as keyof typeof prefs] ? 'var(--color-primary-400)' : 'var(--color-border-2)'}`,
                      position: 'relative',
                    }}>
                    <div style={{
                      position: 'absolute', top: 2, left: prefs[item.key as keyof typeof prefs] ? 22 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
            <Button loading={savingPrefs} leftIcon={<Save size={15} />} onClick={savePrefs}>Save Preferences</Button>
          </div>
        </div>
      )}
    </div>
  );
}
