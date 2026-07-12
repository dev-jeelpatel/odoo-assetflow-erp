'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell, Menu, LogOut, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { prettyStatus } from '@/lib/utils';

interface TopbarProps {
  onMobileMenuOpen: () => void;
  unreadCount: number;
}

export function Topbar({ onMobileMenuOpen, unreadCount }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) router.push(`/assets?search=${encodeURIComponent(search.trim())}`);
  };

  return (
    <header className="topbar">
      {/* Mobile menu toggle */}
      <button
        className="btn btn-ghost btn-icon"
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
        style={{ display: 'none' }}
        id="mobile-menu-btn"
      >
        <Menu size={20} />
      </button>

      {/* Search */}
      <form className="topbar-search" onSubmit={handleSearch}>
        <Search size={15} color="var(--color-text-3)" />
        <input
          type="search"
          placeholder="Search assets by tag, name, serial…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Global search"
          id="global-search"
        />
      </form>

      <div style={{ flex: 1 }} />

      {/* Notifications bell */}
      <button
        className="btn btn-ghost btn-icon"
        onClick={() => router.push('/notifications')}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        style={{ position: 'relative' }}
        id="notification-bell"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-danger)',
            color: '#fff',
            fontSize: '0.65rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--color-bg)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* User menu */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          className="btn btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}
          onClick={() => setUserMenuOpen(v => !v)}
          id="user-menu-btn"
          aria-expanded={userMenuOpen}
        >
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ textAlign: 'left', display: 'none' }} className="topbar-user-info">
            <p style={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1 }}>{user?.name}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)', marginTop: 1 }}>{prettyStatus(user?.role ?? '')}</p>
          </div>
        </button>

        {userMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-2)',
            borderRadius: 'var(--radius-md)',
            padding: 6,
            minWidth: 180,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 200,
            animation: 'slideUp 150ms ease',
          }}>
            <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--color-border)', marginBottom: 4 }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{user?.name}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', marginTop: 1 }}>{user?.email}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--color-primary-400)', marginTop: 3 }}>{prettyStatus(user?.role ?? '')}</p>
            </div>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}
              onClick={() => { logout(); setUserMenuOpen(false); }}
            >
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
