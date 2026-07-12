'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Table, Column } from '@/components/ui/Table';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { timeAgo, fmtDateTime } from '@/lib/utils';

interface ActivityLog {
  id: number; action: string; summary: string; entity_type: string;
  entity_id: number; actor_name: string; created_at: string; metadata: any;
}

const ACTION_COLOR: Record<string, string> = {
  ASSET_REGISTERED: 'var(--color-success)', ASSET_UPDATED: '#60a5fa', ASSET_STATUS_CHANGED: '#fbbf24',
  ALLOCATION_CREATED: 'var(--color-primary-400)', ALLOCATION_RETURNED: '#34d399',
  MAINTENANCE_RAISED: '#fbbf24', MAINTENANCE_APPROVED: 'var(--color-success)', MAINTENANCE_RESOLVED: '#34d399',
  BOOKING_CREATED: '#c084fc', TRANSFER_REQUESTED: '#f97316', TRANSFER_APPROVED: 'var(--color-success)',
  USER_SIGNUP: '#60a5fa', USER_LOGIN: 'var(--color-text-3)', ROLE_CHANGED: '#fbbf24',
  AUDIT_CLOSED: 'var(--color-danger)', AUDIT_ITEM_VERIFIED: 'var(--color-success)',
};

export default function ActivityPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ActivityLog[]>('/activity-logs', {
        page, limit: 25, search: search || undefined, entity_type: entityFilter || undefined,
      });
      setLogs(r.data ?? []); setTotal(r.meta?.total ?? 0);
    } finally { setLoading(false); }
  }, [page, search, entityFilter]);

  useEffect(() => { load(); }, [load]);

  const cols: Column<ActivityLog>[] = [
    { key: 'actor_name', header: 'Actor', render: l => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--color-primary-700),var(--color-primary-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {l.actor_name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{l.actor_name}</span>
      </div>
    )},
    { key: 'action', header: 'Action', render: l => (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, background: `${ACTION_COLOR[l.action] ?? '#60a5fa'}15`, color: ACTION_COLOR[l.action] ?? '#60a5fa', border: `1px solid ${ACTION_COLOR[l.action] ?? '#60a5fa'}30`, whiteSpace: 'nowrap' }}>
        {l.action}
      </span>
    )},
    { key: 'summary', header: 'Summary', render: l => <span style={{ color: 'var(--color-text-2)', fontSize: '0.85rem' }}>{l.summary}</span> },
    { key: 'entity_type', header: 'Entity', render: l => <span style={{ color: 'var(--color-text-3)', fontSize: '0.8rem', textTransform: 'capitalize' }}>{l.entity_type} #{l.entity_id}</span> },
    { key: 'created_at', header: 'When', render: l => (
      <span style={{ color: 'var(--color-text-3)', fontSize: '0.8rem', whiteSpace: 'nowrap' }} title={fmtDateTime(l.created_at)}>
        {timeAgo(l.created_at)}
      </span>
    )},
  ];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Activity Log</h1><p className="page-subtitle">Full audit trail of all system actions</p></div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input placeholder="Search actions or summaries…" id="activity-search" leftIcon={<Search size={14} />}
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(1); }} placeholder="All entities" style={{ width: 160 }}>
          {['asset', 'user', 'allocation', 'booking', 'maintenance', 'transfer', 'audit'].map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
          ))}
        </Select>
      </div>

      {logs.length === 0 && !loading ? (
        <EmptyState icon={<ScrollText size={28} />} title="No activity yet" description="Actions will appear here as the system is used." />
      ) : (
        <Table
          columns={cols} data={logs} loading={loading} rowKey={l => l.id}
          page={page} total={total} limit={25} totalPages={Math.ceil(total / 25)}
          onPageChange={p => setPage(p)}
          emptyMessage="No activity logs found."
        />
      )}
    </div>
  );
}
