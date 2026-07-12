'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, Users, Wrench, CalendarDays, ArrowLeftRight,
  Clock, AlertTriangle, TrendingUp, TrendingDown, Minus, Zap,
  RefreshCw, ChevronRight, ChevronLeft, Calendar as CalendarIcon,
  UserPlus, Wrench as WrenchIcon, BookOpen, ShieldAlert, LogIn, ClipboardCheck, IndianRupee,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import { timeAgo, fmtCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

interface Kpi {
  available: number;
  allocated: number;
  under_maintenance: number;
  active_bookings: number;
  pending_transfers: number;
  upcoming_returns: number;
  overdue_returns: number;
  pending_maintenance: number;
  total_book_value: number;
}

interface Trend { direction: 'up' | 'down' | 'flat'; pct: number; }

interface OverdueItem { id: number; asset_tag: string; asset_name: string; holder_name: string | null; days_overdue: number; }
interface PendingMaintenanceItem { id: number; asset_tag: string; asset_name: string; priority: string; }
interface BookingSoonItem { id: number; asset_tag: string; asset_name: string; starts_at: string; }

interface ActivityItem {
  id: number;
  action: string;
  summary: string;
  created_at: string;
  actor_name: string | null;
}

interface DashboardData {
  as_of_date: string;
  is_today: boolean;
  kpis: Kpi;
  trends: Record<string, Trend>;
  overdue: OverdueItem[];
  pending_maintenance: PendingMaintenanceItem[];
  bookings_soon: BookingSoonItem[];
  recent_activity: ActivityItem[];
}

const KPI_CARDS = [
  { key: 'available', label: 'Available Assets', icon: <Package size={20} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { key: 'allocated', label: 'Allocated', icon: <Users size={20} />, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  { key: 'under_maintenance', label: 'In Maintenance', icon: <Wrench size={20} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { key: 'active_bookings', label: 'Active Bookings', icon: <CalendarDays size={20} />, color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  { key: 'pending_transfers', label: 'Pending Transfers', icon: <ArrowLeftRight size={20} />, color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  { key: 'upcoming_returns', label: 'Upcoming Returns', icon: <Clock size={20} />, color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  { key: 'total_book_value', label: 'Total Book Value', icon: <IndianRupee size={20} />, color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
] as const;

const QUICK_ACTIONS = [
  { href: '/assets', label: 'Browse Assets', icon: <Package size={16} />, color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)' },
  { href: '/allocations', label: 'Manage Allocations', icon: <ArrowLeftRight size={16} />, color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.30)' },
  { href: '/bookings', label: 'Book a Resource', icon: <CalendarDays size={16} />, color: '#a855f7', bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.30)' },
  { href: '/maintenance', label: 'Maintenance Requests', icon: <Wrench size={16} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)' },
  { href: '/reports', label: 'View Reports', icon: <TrendingUp size={16} />, color: '#14b8a6', bg: 'rgba(20,184,166,0.10)', border: 'rgba(20,184,166,0.30)' },
];

const ACTION_ICON: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  ASSET_ALLOCATED: { icon: <UserPlus size={14} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  ASSET_RETURNED: { icon: <ArrowLeftRight size={14} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  MAINTENANCE_APPROVED: { icon: <WrenchIcon size={14} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  MAINTENANCE_RAISED: { icon: <WrenchIcon size={14} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  MAINTENANCE_RESOLVED: { icon: <WrenchIcon size={14} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  BOOKING_CREATED: { icon: <BookOpen size={14} />, color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  BOOKING_CANCELLED: { icon: <BookOpen size={14} />, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  AUDIT_ITEM_MARKED: { icon: <ShieldAlert size={14} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  AUDIT_CLOSED: { icon: <ClipboardCheck size={14} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  AUDIT_CREATED: { icon: <ClipboardCheck size={14} />, color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  USER_LOGIN: { icon: <LogIn size={14} />, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
};

const TIMELINE_DOT_DEFAULT = '#94a3b8';

function TrendBadge({ trend }: { trend?: Trend }) {
  if (!trend || trend.direction === 'flat') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-3)' }}>
        <Minus size={12} /> No change
      </span>
    );
  }
  const up = trend.direction === 'up';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: up ? 'var(--color-success)' : 'var(--color-danger)' }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {trend.pct}% from last week
    </span>
  );
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Compact popover calendar card used to pick which date the dashboard reflects. */
function DateCalendarPicker({ value, onChange }: { value: string; onChange: (dateKey: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = new Date(value + 'T00:00:00');
  const [viewMonth, setViewMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const wrapperRef = useRef<HTMLDivElement>(null);
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)', border: '1px solid var(--color-border-2)',
          fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)',
          cursor: 'pointer',
        }}
      >
        <CalendarIcon size={14} color="var(--color-text-3)" />
        {selected.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 20,
            width: 260, padding: 14, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <ChevronRight size={14} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '0.6875rem', color: 'var(--color-text-3)', fontWeight: 600, padding: '4px 0' }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const key = toDateKey(day);
              const isSelected = key === value;
              const isToday = key === todayKey;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(key); setOpen(false); }}
                  style={{
                    aspectRatio: '1', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: isSelected ? 700 : 500,
                    background: isSelected ? 'var(--color-primary-500)' : 'transparent',
                    color: isSelected ? '#fff' : isToday ? 'var(--color-primary-600)' : 'var(--color-text)',
                    outline: isToday && !isSelected ? '1px solid var(--color-primary-300)' : 'none',
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {value !== todayKey && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => { onChange(todayKey); setViewMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setOpen(false); }}
            >
              Jump to Today
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async (dateKey: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get<DashboardData>('/dashboard/kpis', { date: dateKey });
      if (res.data) setData(res.data);
    } catch { /* handled gracefully */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(asOfDate); }, [asOfDate, load]);

  // Live refresh when server sends kpi_invalidate via SSE — only meaningful
  // while looking at today; a past date's data doesn't change under you.
  useSSE('kpi_invalidate', () => { if (data?.is_today !== false) load(asOfDate, true); }, [load, asOfDate, data?.is_today]);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const kpis = data?.kpis;
  const trends = data?.trends ?? {};

  const alerts = [
    data && data.kpis.overdue_returns > 0 && {
      key: 'overdue',
      icon: <AlertTriangle size={16} />,
      iconBg: '#fee2e2', iconColor: '#dc2626',
      title: `${data.kpis.overdue_returns} asset${data.kpis.overdue_returns !== 1 ? 's' : ''} overdue for return`,
      subtitle: `Overdue by more than ${Math.max(...data.overdue.map(o => o.days_overdue), 0)} days`,
      badge: 'High Priority', badgeBg: '#fee2e2', badgeColor: '#b91c1c',
      href: '/allocations?tab=overdue',
    },
    data && data.kpis.pending_maintenance > 0 && {
      key: 'maintenance',
      icon: <Wrench size={16} />,
      iconBg: '#fef3c7', iconColor: '#b45309',
      title: `${data.kpis.pending_maintenance} maintenance request${data.kpis.pending_maintenance !== 1 ? 's' : ''} pending approval`,
      subtitle: 'Require your action',
      badge: 'Action Required', badgeBg: '#fef3c7', badgeColor: '#92400e',
      href: '/maintenance',
    },
    data && data.bookings_soon.length > 0 && {
      key: 'bookings',
      icon: <CalendarDays size={16} />,
      iconBg: '#f3e8ff', iconColor: '#7e22ce',
      title: `${data.bookings_soon.length} booking${data.bookings_soon.length !== 1 ? 's' : ''} starting in next 30 minutes`,
      subtitle: data.bookings_soon[0].asset_name,
      badge: 'Upcoming', badgeBg: '#f3e8ff', badgeColor: '#7e22ce',
      href: '/bookings',
    },
  ].filter(Boolean) as {
    key: string; icon: React.ReactNode; iconBg: string; iconColor: string;
    title: string; subtitle: string; badge: string; badgeBg: string; badgeColor: string; href: string;
  }[];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, {firstName || 'there'} 👋
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DateCalendarPicker value={asOfDate} onChange={setAsOfDate} />
          <Button
            variant="primary"
            size="sm"
            leftIcon={<RefreshCw size={14} className={refreshing ? 'animate-pulse' : ''} />}
            onClick={() => load(asOfDate, true)}
            loading={refreshing}
          >
            Refresh
          </Button>
        </div>
      </div>

      {data && !data.is_today && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <CalendarIcon size={16} style={{ flexShrink: 0 }} />
          <span>
            Showing dashboard state as of <strong>{new Date(asOfDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> — not live data.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 20 }}>
        {KPI_CARDS.map(card => (
          <div
            key={card.key}
            className="card"
            style={{ padding: '20px 20px 18px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div className="kpi-icon" style={{ background: card.bg, color: card.color }}>
                {card.icon}
              </div>
              <p className="kpi-label" style={{ margin: 0 }}>{card.label}</p>
            </div>
            {loading || !kpis ? (
              <Skeleton width={60} height={34} />
            ) : (
              <div className="kpi-value" style={{ color: 'var(--color-text)', marginBottom: 8 }}>
                {card.key === 'total_book_value' ? fmtCurrency(kpis[card.key]) : kpis[card.key as keyof Kpi]}
              </div>
            )}
            {!loading && kpis && <TrendBadge trend={trends[card.key]} />}
          </div>
        ))}
      </div>

      {/* Quick actions — horizontal row */}
      <div className="card" style={{ padding: '18px 22px', borderRadius: 'var(--radius-xl)', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Zap size={16} color="var(--color-primary-500)" fill="var(--color-primary-500)" />
          Quick Actions
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map(action => (
            <Link
              key={action.href}
              href={action.href}
              className="quick-action-chip"
              style={{ borderColor: action.border }}
            >
              <span style={{ color: action.color, background: action.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 'var(--radius-sm)' }}>
                {action.icon}
              </span>
              {action.label}
              <ChevronRight size={14} color="var(--color-text-3)" style={{ marginLeft: 2 }} />
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom section: Alerts (left) + Activity timeline (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Overdue & Alerts */}
        <div className="card" style={{ padding: '20px 22px', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="var(--color-danger)" />
              Overdue &amp; Alerts
            </h3>
            <Link href="/notifications" style={{ fontSize: '0.8rem', color: 'var(--color-primary-600)', textDecoration: 'none', fontWeight: 500 }}>
              View all
            </Link>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} width="100%" height={52} />)}
            </div>
          ) : alerts.length === 0 ? (
            <p style={{ color: 'var(--color-text-3)', fontSize: '0.875rem', padding: '20px 0', textAlign: 'center' }}>
              All caught up — no pending alerts.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {alerts.map(a => (
                <Link key={a.key} href={a.href} className="alert-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: a.iconBg, color: a.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {a.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8375rem', fontWeight: 600, margin: 0 }}>{a.title}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', margin: '2px 0 0' }}>{a.subtitle}</p>
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)', background: a.badgeBg, color: a.badgeColor, whiteSpace: 'nowrap' }}>
                    {a.badge}
                  </span>
                  <ChevronRight size={14} color="var(--color-text-3)" style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}

          {!loading && alerts.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <Link href="/notifications" style={{ fontSize: '0.8125rem', color: 'var(--color-primary-600)', textDecoration: 'none', fontWeight: 600 }}>
                View all alerts
              </Link>
            </div>
          )}
        </div>

        {/* Recent Activity — timeline */}
        <div className="card" style={{ padding: '20px 22px', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <h3 style={{ fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} color="var(--color-primary-500)" fill="var(--color-primary-500)" />
              Recent Activity
            </h3>
            <Link href="/activity" style={{ fontSize: '0.8rem', color: 'var(--color-primary-600)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              View all <ChevronRight size={13} />
            </Link>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 12 }}>
                  <Skeleton width={32} height={32} rounded />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="80%" height={12} />
                    <Skeleton width="40%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          ) : !data || data.recent_activity.length === 0 ? (
            <p style={{ color: 'var(--color-text-3)', fontSize: '0.875rem' }}>No activity yet.</p>
          ) : (
            <div>
              {data.recent_activity.map((item, i) => {
                const meta = ACTION_ICON[item.action] ?? { icon: <Clock size={14} />, color: TIMELINE_DOT_DEFAULT, bg: 'rgba(148,163,184,0.12)' };
                const isLast = i === data.recent_activity.length - 1;
                return (
                  <div key={item.id} className="timeline-item">
                    {/* Chronology dot + connector */}
                    <div style={{ position: 'relative', width: 10, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, marginTop: 9, flexShrink: 0, zIndex: 1 }} />
                      {!isLast && (
                        <div style={{ position: 'absolute', top: 21, bottom: -22, width: 2, background: 'var(--color-border)' }} />
                      )}
                    </div>
                    {/* Icon badge */}
                    <div style={{
                      width: 30, height: 30, borderRadius: 'var(--radius-md)',
                      background: meta.bg, color: meta.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                      <p style={{ fontSize: '0.8125rem', lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
                        {item.summary}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-text-3)', margin: '3px 0 0' }}>
                        {item.actor_name ?? 'System'} · {timeAgo(item.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
