'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, Users, Wrench, CalendarDays, ArrowLeftRight,
  Clock, AlertTriangle, TrendingUp, Activity, RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';
import { useSSE } from '@/lib/sse';
import { fmtDate, timeAgo, prettyStatus, statusPill } from '@/lib/utils';
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
  overdue_count: number;
  overdue_items: { id: number; asset_tag: string; holder_name: string; expected_return_date: string }[];
}

interface ActivityItem {
  id: number;
  action: string;
  summary: string;
  created_at: string;
  actor_name: string;
}

const KPI_CARDS = [
  { key: 'available', label: 'Available Assets', icon: <Package size={20} />, color: '#34d399', bg: 'rgba(16,185,129,0.1)' },
  { key: 'allocated', label: 'Allocated', icon: <Users size={20} />, color: '#60a5fa', bg: 'rgba(59,130,246,0.1)' },
  { key: 'under_maintenance', label: 'In Maintenance', icon: <Wrench size={20} />, color: '#fbbf24', bg: 'rgba(245,158,11,0.1)' },
  { key: 'active_bookings', label: 'Active Bookings', icon: <CalendarDays size={20} />, color: '#c084fc', bg: 'rgba(168,85,247,0.1)' },
  { key: 'pending_transfers', label: 'Pending Transfers', icon: <ArrowLeftRight size={20} />, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  { key: 'upcoming_returns', label: 'Upcoming Returns', icon: <Clock size={20} />, color: '#2dd4bf', bg: 'rgba(45,212,191,0.1)' },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadKpi = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [kpiRes, actRes] = await Promise.all([
        api.get<Kpi>('/dashboard/kpis'),
        api.get<ActivityItem[]>('/activity-logs?limit=12'),
      ]);
      setKpi(kpiRes.data);
      setActivity(actRes.data ?? []);
    } catch { /* handled gracefully */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadKpi(); }, [loadKpi]);

  // Live refresh when server sends kpi_invalidate via SSE
  useSSE('kpi_invalidate', () => loadKpi(true), [loadKpi]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw size={14} className={refreshing ? 'animate-pulse' : ''} />}
          onClick={() => loadKpi(true)}
          loading={refreshing}
        >
          Refresh
        </Button>
      </div>

      {/* Overdue banner */}
      {!loading && kpi && kpi.overdue_count > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: 24, alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <strong>{kpi.overdue_count} overdue return{kpi.overdue_count !== 1 ? 's' : ''}</strong>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kpi.overdue_items.slice(0, 3).map(item => (
                <div key={item.id} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="tag-label">{item.asset_tag}</span>
                  <span>{item.holder_name}</span>
                  <span style={{ color: 'rgba(252,165,165,0.7)' }}>— due {fmtDate(item.expected_return_date)}</span>
                </div>
              ))}
              {kpi.overdue_count > 3 && (
                <div style={{ fontSize: '0.8rem', color: 'rgba(252,165,165,0.7)' }}>
                  +{kpi.overdue_count - 3} more
                </div>
              )}
            </div>
          </div>
          <Link href="/allocations?tab=overdue" className="btn btn-sm btn-danger" style={{ flexShrink: 0, marginLeft: 8 }}>
            View All
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {KPI_CARDS.map(card => (
          <div key={card.key} className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="kpi-icon" style={{ background: card.bg, color: card.color }}>
                {card.icon}
              </div>
              {loading && <div className="skeleton" style={{ width: 40, height: 32, borderRadius: 6 }} />}
              {!loading && kpi && (
                <span className="kpi-value" style={{ color: card.color }}>
                  {kpi[card.key as keyof Kpi] as number}
                </span>
              )}
            </div>
            <p className="kpi-label">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Bottom section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Quick actions */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.9375rem' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/assets', label: 'Browse Assets', icon: <Package size={15} />, color: 'var(--color-primary-400)' },
              { href: '/allocations', label: 'Manage Allocations', icon: <ArrowLeftRight size={15} />, color: '#60a5fa' },
              { href: '/bookings', label: 'Book a Resource', icon: <CalendarDays size={15} />, color: '#c084fc' },
              { href: '/maintenance', label: 'Maintenance Requests', icon: <Wrench size={15} />, color: '#fbbf24' },
              { href: '/reports', label: 'View Reports', icon: <TrendingUp size={15} />, color: '#34d399' },
            ].map(action => (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  textDecoration: 'none', color: 'var(--color-text)',
                  fontSize: '0.875rem', fontWeight: 500,
                  transition: 'all var(--transition)',
                }}
                className="quick-action-link"
              >
                <span style={{ color: action.color }}>{action.icon}</span>
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.9375rem' }}>Recent Activity</h3>
            <Link href="/activity" style={{ fontSize: '0.8rem', color: 'var(--color-primary-400)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <Skeleton width={32} height={32} rounded />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Skeleton width="70%" height={12} />
                    <Skeleton width="40%" height={10} />
                  </div>
                </div>
              ))
            ) : activity.length === 0 ? (
              <p style={{ color: 'var(--color-text-3)', fontSize: '0.875rem' }}>No activity yet.</p>
            ) : activity.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--color-border)' : undefined }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Activity size={13} color="var(--color-text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.8125rem', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.summary}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-text-3)', marginTop: 2 }}>
                    {item.actor_name} · {timeAgo(item.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
