'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Package, ArrowLeftRight, CalendarDays,
  Wrench, ClipboardCheck, BarChart3, Bell, ScrollText, ChevronLeft,
  ChevronRight, Zap, LogOut, Settings, User, Shield, ScanLine
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { prettyStatus } from '@/lib/utils';

type Role = 'ADMIN' | 'ASSET_MANAGER' | 'DEPT_HEAD' | 'EMPLOYEE';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
  badge?: number;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Core',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    section: 'Setup',
    items: [
      { href: '/organization', label: 'Organization', icon: <Building2 size={18} />, roles: ['ADMIN'] },
    ],
  },
  {
    section: 'Operations',
    items: [
      { href: '/assets', label: 'Assets', icon: <Package size={18} /> },
      { href: '/assets/scan', label: 'Scan Asset', icon: <ScanLine size={18} /> },
      { href: '/allocations', label: 'Allocation & Transfer', icon: <ArrowLeftRight size={18} /> },
      { href: '/bookings', label: 'Resource Booking', icon: <CalendarDays size={18} /> },
      { href: '/maintenance', label: 'Maintenance', icon: <Wrench size={18} /> },
      { href: '/audits', label: 'Audit Cycles', icon: <ClipboardCheck size={18} />, roles: ['ADMIN', 'ASSET_MANAGER'] },
    ],
  },
  {
    section: 'Insights',
    items: [
      { href: '/reports', label: 'Reports', icon: <BarChart3 size={18} />, roles: ['ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD'] },
      { href: '/notifications', label: 'Notifications', icon: <Bell size={18} /> },
      { href: '/activity', label: 'Activity Log', icon: <ScrollText size={18} />, roles: ['ADMIN', 'ASSET_MANAGER'] },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  unreadCount: number;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, unreadCount }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const canSee = (roles?: Role[]) => {
    if (!roles || !user) return true;
    return roles.includes(user.role as Role);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 150 }}
        />
      )}

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Zap size={16} color="white" />
          </div>
          {!collapsed && (
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.1, letterSpacing: '-0.01em' }}>AssetFlow</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-text-3)', marginTop: 1 }}>ERP System</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV.map(group => {
            const visibleItems = group.items.filter(item => canSee(item.roles));
            if (!visibleItems.length) return null;
            return (
              <div key={group.section}>
                {!collapsed && <div className="sidebar-section">{group.section}</div>}
                {collapsed && <div style={{ height: 8 }} />}
                {visibleItems.map(item => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const badge = item.href === '/notifications' ? unreadCount : item.badge;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      title={collapsed ? item.label : undefined}
                      onClick={onMobileClose}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                      {!collapsed && badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
                      {collapsed && badge ? (
                        <span style={{
                          position: 'absolute', top: 4, right: 4,
                          width: 8, height: 8, borderRadius: '50%',
                          background: 'var(--color-danger)',
                        }} />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer: user info + collapse toggle */}
        <div className="sidebar-footer">
          {!collapsed && user && (
          <Link href="/profile" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', marginBottom: 6,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-2)',
              textDecoration: 'none',
              transition: 'background var(--transition)',
            }}
            onClick={onMobileClose}
          >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>
                  {user.name}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)', marginTop: 2 }}>
                  {prettyStatus(user.role)}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={e => { e.preventDefault(); logout(); }}
                title="Sign out"
                style={{ flexShrink: 0 }}
              >
                <LogOut size={14} />
              </button>
          </Link>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ width: '100%' }}
          >
            {collapsed ? <ChevronRight size={16} /> : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-3)', fontSize: '0.8rem' }}>
                <ChevronLeft size={14} /> <span>Collapse</span>
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
