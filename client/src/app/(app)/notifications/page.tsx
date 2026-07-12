'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, CheckCheck, Info, AlertTriangle, Calendar, ArrowLeftRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { useSSE } from '@/lib/sse';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { timeAgo, fmtDateTime } from '@/lib/utils';

interface Notification {
  id: number; type: string; title: string; body: string;
  entity_type: string; entity_id: number; read_at: string | null; created_at: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  OVERDUE: <AlertTriangle size={15} />,
  BOOKING_REMINDER: <Calendar size={15} />,
  TRANSFER: <ArrowLeftRight size={15} />,
  MAINTENANCE: <AlertTriangle size={15} />,
  DEFAULT: <Info size={15} />,
};

const TYPE_COLORS: Record<string, string> = {
  OVERDUE: '#f87171', BOOKING_REMINDER: '#60a5fa', TRANSFER: '#c084fc', MAINTENANCE: '#fbbf24', DEFAULT: 'var(--color-text-3)',
};

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'OVERDUE', label: 'Alerts' },
  { key: 'TRANSFER', label: 'Approvals' },
  { key: 'BOOKING', label: 'Bookings' },
  { key: 'MAINTENANCE', label: 'Maintenance' },
];

export default function NotificationsPage() {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (p = 1, append = false) => {
    if (p === 1) setLoading(true);
    try {
      const r = await api.get<Notification[]>('/notifications', { page: p, limit: 20, type: filter || undefined });
      const items = r.data ?? [];
      setNotifications(prev => append ? [...prev, ...items] : items);
      setHasMore(items.length === 20);
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { setPage(1); setNotifications([]); load(1, false); }, [filter, load]);

  // SSE: new notification arrives
  useSSE('notification', () => {
    load(1, false);
    refresh();
  }, [load, refresh]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        const next = page + 1;
        setPage(next);
        load(next, true);
      }
    }, { threshold: 0.5 });
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, page, load]);

  const markRead = async (id: number) => {
    await api.patch(`/notifications/${id}/read`).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    refresh();
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
      refresh();
      toast('All notifications marked as read.', 'success');
    } catch { toast('Failed.', 'error'); } finally { setMarkingAll(false); }
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          {unreadCount > 0 && <p className="page-subtitle">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" leftIcon={<CheckCheck size={14} />} loading={markingAll} onClick={markAllRead} id="mark-all-read-btn">
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: '5px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, transition: 'all var(--transition)', borderColor: filter === f.key ? 'rgba(20,184,166,0.4)' : 'var(--color-border)', background: filter === f.key ? 'rgba(20,184,166,0.1)' : 'transparent', color: filter === f.key ? 'var(--color-primary-400)' : 'var(--color-text-2)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && notifications.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)', alignItems: 'flex-start' }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ height: 13, width: '60%' }} />
                <div className="skeleton" style={{ height: 11, width: '80%' }} />
                <div className="skeleton" style={{ height: 10, width: '30%' }} />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell size={28} />} title="All caught up!" description="No notifications to show." />
        ) : (
          notifications.map((n, i) => {
            const iconKey = Object.keys(TYPE_ICONS).find(k => n.type?.includes(k)) ?? 'DEFAULT';
            const color = TYPE_COLORS[iconKey];
            const isUnread = !n.read_at;
            return (
              <div key={n.id} onClick={() => isUnread && markRead(n.id)}
                style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: i < notifications.length - 1 ? '1px solid var(--color-border)' : undefined, alignItems: 'flex-start', background: isUnread ? 'rgba(20,184,166,0.03)' : undefined, cursor: isUnread ? 'pointer' : undefined, transition: 'background var(--transition)' }}>
                {/* Icon */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                  {TYPE_ICONS[iconKey]}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ fontWeight: isUnread ? 600 : 400, fontSize: '0.875rem', lineHeight: 1.3 }}>{n.title}</p>
                    {isUnread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary-400)', flexShrink: 0, marginTop: 4 }} />}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)', marginTop: 3, lineHeight: 1.5 }}>{n.body}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-text-3)', marginTop: 5 }} title={fmtDateTime(n.created_at)}>
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {!loading && hasMore && notifications.length > 0 && (
          <div style={{ padding: '12px', textAlign: 'center' }}>
            <div className="spinner" style={{ color: 'var(--color-primary-400)', margin: '0 auto' }} />
          </div>
        )}
      </div>
    </div>
  );
}
