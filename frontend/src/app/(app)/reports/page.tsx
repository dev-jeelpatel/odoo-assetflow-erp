'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, Clock, Download, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface UtilRow { department_name: string; total: number; allocated: number; utilization: number; }
interface MaintRow { month: string; count: number; }
interface DueSoon { id: number; asset_tag: string; asset_name: string; holder_name: string; expected_return_date: string; }
interface BookingHeat { day: number; hour: number; count: number; }

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function BarChart({ data, labelKey, valueKey, color = 'var(--color-primary-500)' }: { data: any[]; labelKey: string; valueKey: string; color?: string }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-3)', fontWeight: 600 }}>{d[valueKey]}</span>
          <div style={{ width: '100%', background: `${color}20`, borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'flex-end', height: 130 }}>
            <div style={{ width: '100%', background: color, borderRadius: '4px 4px 0 0', height: `${Math.max((d[valueKey] / max) * 100, 4)}%`, transition: 'height 600ms ease', opacity: 0.85 }} />
          </div>
          <span style={{ fontSize: '0.6rem', color: 'var(--color-text-3)', textAlign: 'center', lineHeight: 1.2, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d[labelKey]}
          </span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, labelKey, valueKey, color = 'var(--color-primary-500)' }: { data: any[]; labelKey: string; valueKey: string; color?: string }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const W = 500, H = 140;
  const pts = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * (W - 40) + 20,
    y: H - 20 - ((d[valueKey] / max) * (H - 40)),
    val: d[valueKey], label: d[labelKey],
  }));
  const path = pts.length > 1 ? `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}` : '';
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 300, height: H }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(r => (
          <line key={r} x1={20} y1={H - 20 - r * (H - 40)} x2={W - 20} y2={H - 20 - r * (H - 40)} stroke="var(--color-border)" strokeWidth={1} />
        ))}
        {path && <>
          <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
          <path d={`${path} L ${pts[pts.length - 1].x},${H - 20} L ${pts[0].x},${H - 20} Z`} fill={`${color}15`} />
        </>}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill={color} />
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--color-text-3)">{p.label}</text>
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill={color}>{p.val}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BookingHeatmap({ data }: { data: BookingHeat[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const grid: Record<string, number> = {};
  data.forEach(d => { grid[`${d.day}-${d.hour}`] = d.count; });

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, 1fr)`, gap: 2, minWidth: 600 }}>
        <div /> {/* empty corner */}
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} style={{ fontSize: '0.6rem', color: 'var(--color-text-3)', textAlign: 'center', paddingBottom: 4 }}>
            {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
          </div>
        ))}
        {Array.from({ length: 7 }, (_, d) => (
          <React.Fragment key={d}>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-3)', display: 'flex', alignItems: 'center' }}>{DAYS_SHORT[d]}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const count = grid[`${d}-${h}`] ?? 0;
              const intensity = count / max;
              return (
                <div key={h} title={`${DAYS_SHORT[d]} ${h}:00 — ${count} booking${count !== 1 ? 's' : ''}`}
                  style={{ height: 18, borderRadius: 2, background: count === 0 ? 'var(--color-surface-2)' : `rgba(20,184,166,${0.15 + intensity * 0.8})`, transition: 'background 300ms', cursor: 'default' }} />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.72rem', color: 'var(--color-text-3)' }}>
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map(i => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 2, background: i === 0 ? 'var(--color-surface-2)' : `rgba(20,184,166,${0.15 + i * 0.8})` }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'utilization', label: 'Utilization', icon: <BarChart3 size={14} /> },
  { id: 'maintenance', label: 'Maintenance Frequency', icon: <TrendingUp size={14} /> },
  { id: 'due-soon', label: 'Due Soon', icon: <Clock size={14} /> },
  { id: 'heatmap', label: 'Booking Heatmap', icon: <Calendar size={14} /> },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('utilization');
  const [utilData, setUtilData] = useState<UtilRow[]>([]);
  const [maintData, setMaintData] = useState<MaintRow[]>([]);
  const [dueSoon, setDueSoon] = useState<DueSoon[]>([]);
  const [heatmap, setHeatmap] = useState<BookingHeat[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      if (t === 'utilization') { const r = await api.get<UtilRow[]>('/reports/utilization'); setUtilData(r.data ?? []); }
      if (t === 'maintenance') { const r = await api.get<MaintRow[]>('/reports/maintenance-frequency'); setMaintData(r.data ?? []); }
      if (t === 'due-soon') { const r = await api.get<DueSoon[]>('/reports/due-soon'); setDueSoon(r.data ?? []); }
      if (t === 'heatmap') { const r = await api.get<BookingHeat[]>('/reports/booking-heatmap'); setHeatmap(r.data ?? []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const exportCsv = (name: string) => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/reports/${name}/export?format=csv`, '_blank');
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Reports & Analytics</h1><p className="page-subtitle">Asset utilization, maintenance trends, and booking patterns</p></div>
        <Button variant="secondary" leftIcon={<Download size={14} />} onClick={() => exportCsv(tab === 'due-soon' ? 'due-soon' : tab === 'heatmap' ? 'booking-heatmap' : tab)}>
          Export CSV
        </Button>
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} id={`report-tab-${t.id}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{t.icon}{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner-center"><div className="spinner spinner-lg" style={{ color: 'var(--color-primary-400)' }} /></div>
      ) : tab === 'utilization' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <h3 style={{ marginBottom: 20 }}>Asset Utilization by Department</h3>
            {utilData.length === 0 ? <p style={{ color: 'var(--color-text-3)' }}>No data available.</p> : <BarChart data={utilData} labelKey="department_name" valueKey="allocated" />}
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <h3>Department Summary</h3>
            </div>
            <table className="af-table">
              <thead><tr><th>Department</th><th>Total Assets</th><th>Allocated</th><th>Utilization %</th></tr></thead>
              <tbody>
                {utilData.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{r.department_name}</td>
                    <td>{r.total}</td>
                    <td>{r.allocated}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${r.utilization}%`, background: r.utilization > 70 ? 'var(--color-success)' : r.utilization > 40 ? 'var(--color-warning)' : 'var(--color-danger)', borderRadius: 3, transition: 'width 600ms ease' }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{r.utilization}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'maintenance' && (
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>Maintenance Requests per Month</h3>
          {maintData.length === 0 ? <p style={{ color: 'var(--color-text-3)' }}>No data available.</p> : <LineChart data={maintData} labelKey="month" valueKey="count" color="#60a5fa" />}
        </div>
      )}

      {!loading && tab === 'due-soon' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <h3>Assets Due for Return Soon</h3>
          </div>
          {dueSoon.length === 0 ? <p style={{ color: 'var(--color-text-3)', padding: '40px', textAlign: 'center' }}>No assets due soon.</p> : (
            <table className="af-table">
              <thead><tr><th>Tag</th><th>Asset Name</th><th>Holder</th><th>Due Date</th></tr></thead>
              <tbody>
                {dueSoon.map(d => (
                  <tr key={d.id}>
                    <td><span className="tag-label">{d.asset_tag}</span></td>
                    <td style={{ fontWeight: 500 }}>{d.asset_name}</td>
                    <td>{d.holder_name}</td>
                    <td style={{ color: 'var(--color-warning)', fontWeight: 500 }}>{fmtDate(d.expected_return_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'heatmap' && (
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Booking Heatmap</h3>
          <p style={{ color: 'var(--color-text-2)', fontSize: '0.8rem', marginBottom: 20 }}>Booking frequency by day of week and hour of day</p>
          {heatmap.length === 0 ? <p style={{ color: 'var(--color-text-3)' }}>No booking data yet.</p> : <BookingHeatmap data={heatmap} />}
        </div>
      )}
    </div>
  );
}
