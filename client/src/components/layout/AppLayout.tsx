'use client';
import React, { useState, useEffect, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/lib/auth';
import { useSSE } from '@/lib/sse';

interface AppLayoutProps { children: ReactNode; }

export function AppLayout({ children }: AppLayoutProps) {
  const { user, refresh } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(user?.unread_notifications ?? 0);

  // Keep unread count in sync with user object
  useEffect(() => { setUnread(user?.unread_notifications ?? 0); }, [user]);

  // Live unread updates via SSE
  useSSE('notification', () => {
    setUnread(prev => prev + 1);
  }, []);

  // When KPIs invalidated, optionally refresh user (unread might change)
  useSSE('kpi_invalidate', () => { refresh(); }, [refresh]);

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(v => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        unreadCount={unread}
      />
      <div className={`app-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <Topbar
          onMobileMenuOpen={() => setMobileOpen(true)}
          unreadCount={unread}
        />
        <main className="page-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
