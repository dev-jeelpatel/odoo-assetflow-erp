'use client';
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ClipboardCheck, AlertTriangle, Lock, CheckCircle, ChevronRight, FileText } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDate, timeAgo } from '@/lib/utils';

interface AuditCycle {
  id: number; name: string; scope_department_id: number | null; scope_location: string | null;
  starts_on: string; ends_on: string; status: 'OPEN' | 'CLOSED'; created_by_name: string;
  closed_at: string | null; created_at: string;
  dept_name?: string;
}

interface AuditItem {
  id: number; asset_tag: string; asset_name: string; expected_location: string;
  verification: 'PENDING' | 'VERIFIED' | 'MISSING' | 'DAMAGED';
  notes: string; verified_by_name: string; verified_at: string;
}

interface Discrepancy { missing: AuditItem[]; damaged: AuditItem[]; pending: AuditItem[]; }

interface Dept { id: number; name: string; }
interface User { id: number; name: string; }

export default function AuditsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canManage = user?.role === 'ADMIN' || user?.role === 'ASSET_MANAGER';

  const [cycles, setCycles] = useState<AuditCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditCycle | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [discrepancy, setDiscrepancy] = useState<Discrepancy | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [auditors, setAuditors] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', scope_department_id: '', scope_location: '', starts_on: '', ends_on: '', auditor_ids: [] as number[] });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get<AuditCycle[]>('/audits?limit=50'); setCycles(r.data ?? []); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([api.get<Dept[]>('/departments?limit=100'), api.get<User[]>('/users?limit=200')]).then(([dr, ur]) => { setDepts(dr.data ?? []); setAuditors(ur.data ?? []); });
  }, []);

  const openCycle = async (cycle: AuditCycle) => {
    setSelected(cycle); setLoadingItems(true); setDiscrepancy(null);
    try {
      const [ir, dr] = await Promise.all([
        api.get<AuditItem[]>(`/audits/${cycle.id}/items`),
        api.get<Discrepancy>(`/audits/${cycle.id}/discrepancy-report`).catch(() => null),
      ]);
      setItems(ir.data ?? []); setDiscrepancy(dr?.data ?? null);
    } finally { setLoadingItems(false); }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.starts_on || !form.ends_on) { toast('Name and dates are required.', 'warning'); return; }
    setSaving(true);
    try {
      const r = await api.post<{ id: number }>('/audits', {
        name: form.name, starts_on: form.starts_on, ends_on: form.ends_on,
        scope_department_id: form.scope_department_id ? Number(form.scope_department_id) : null,
        scope_location: form.scope_location || null,
      });
      if (form.auditor_ids.length) {
        await api.post(`/audits/${r.data.id}/assign-auditors`, { auditor_ids: form.auditor_ids });
      }
      toast('Audit cycle created.', 'success');
      setCreateModal(false); load();
      const newCycle = await api.get<AuditCycle>(`/audits/${r.data.id}`);
      openCycle(newCycle.data);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed.', 'error'); } finally { setSaving(false); }
  };

  const handleVerification = async (item: AuditItem, verification: AuditItem['verification'], notes = '') => {
    try {
      await api.patch(`/audits/${selected!.id}/items/${item.id}`, { verification, notes });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, verification, notes } : i));
      // Refresh discrepancy
      const dr = await api.get<Discrepancy>(`/audits/${selected!.id}/discrepancy-report`).catch(() => null);
      setDiscrepancy(dr?.data ?? null);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed.', 'error'); }
  };

  const handleClose = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/audits/${selected.id}/close`);
      toast('Audit cycle closed. Status updates applied.', 'success');
      setCloseConfirm(false); load();
      setSelected(prev => prev ? { ...prev, status: 'CLOSED' } : null);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed.', 'error'); } finally { setSaving(false); }
  };

  const verificationColors: Record<string, string> = {
    PENDING: 'var(--color-text-3)', VERIFIED: 'var(--color-success)', MISSING: 'var(--color-danger)', DAMAGED: 'var(--color-warning)'
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Audit Cycles</h1><p className="page-subtitle">Create and manage asset audit cycles</p></div>
        {canManage && <Button leftIcon={<Plus size={15} />} onClick={() => setCreateModal(true)}>New Audit Cycle</Button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : '1fr', gap: 20 }}>
        {/* Cycle list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="card" style={{ height: 80 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><div className="skeleton" style={{ height: 14, width: '70%' }} /><div className="skeleton" style={{ height: 11, width: '40%' }} /></div></div>) :
            cycles.length === 0 ? <EmptyState icon={<ClipboardCheck size={28} />} title="No audit cycles" description="Create your first audit cycle to start verifying assets." /> :
            cycles.map(cycle => (
              <div key={cycle.id} className={`card-sm`} onClick={() => openCycle(cycle)}
                style={{ cursor: 'pointer', border: selected?.id === cycle.id ? '1px solid rgba(20,184,166,0.4)' : undefined, background: selected?.id === cycle.id ? 'rgba(20,184,166,0.05)' : undefined, transition: 'all var(--transition)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{cycle.name}</p>
                  <StatusPill status={cycle.status} />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)' }}>{fmtDate(cycle.starts_on)} – {fmtDate(cycle.ends_on)}</p>
                {cycle.dept_name && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-2)', marginTop: 2 }}>Dept: {cycle.dept_name}</p>}
              </div>
            ))
          }
        </div>

        {/* Cycle detail */}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{selected.name}</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)', marginTop: 2 }}>{fmtDate(selected.starts_on)} – {fmtDate(selected.ends_on)} · <StatusPill status={selected.status} /></p>
              </div>
              {selected.status === 'OPEN' && canManage && (
                <Button variant="danger" leftIcon={<Lock size={14} />} onClick={() => setCloseConfirm(true)}>Close Cycle</Button>
              )}
              {selected.status === 'CLOSED' && (
                <span className="pill pill-closed" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Lock size={11} /> Locked</span>
              )}
            </div>

            {/* Discrepancy banner */}
            {discrepancy && (discrepancy.missing.length > 0 || discrepancy.damaged.length > 0) && (
              <div className="alert alert-warning">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <div>
                  <strong>{discrepancy.missing.length} missing, {discrepancy.damaged.length} damaged</strong>
                  <p style={{ fontSize: '0.8rem', marginTop: 3 }}>Discrepancy report auto-generated. {selected.status === 'OPEN' ? 'Close the cycle to apply status updates (missing → LOST).' : 'Missing assets have been marked LOST.'}</p>
                </div>
              </div>
            )}

            {/* Items table */}
            <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', background: 'var(--color-surface)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 160px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                {['Asset', 'Expected Location', 'Status', selected.status === 'OPEN' ? 'Mark As' : 'Verified By'].map(h => (
                  <div key={h} style={{ padding: '9px 14px', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-3)' }}>{h}</div>
                ))}
              </div>
              {loadingItems ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 160px', borderBottom: '1px solid var(--color-border)', padding: '10px 14px', gap: 14 }}>
                  {Array.from({ length: 4 }).map((_, j) => <div key={j} className="skeleton" style={{ height: 14 }} />)}
                </div>
              )) : items.length === 0 ? (
                <p style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-3)' }}>No items in this cycle.</p>
              ) : items.map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 160px', borderBottom: '1px solid var(--color-border)', padding: '10px 14px', alignItems: 'center', gap: 6 }}>
                  <div>
                    <span className="tag-label">{item.asset_tag}</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)', marginTop: 3 }}>{item.asset_name}</p>
                  </div>
                  <p style={{ fontSize: '0.85rem' }}>{item.expected_location ?? '—'}</p>
                  <StatusPill status={item.verification} />
                  {selected.status === 'OPEN' ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['VERIFIED', 'MISSING', 'DAMAGED'] as const).map(v => (
                        <button key={v} onClick={() => handleVerification(item, v)}
                          style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${item.verification === v ? verificationColors[v] : 'var(--color-border)'}`, background: item.verification === v ? `${verificationColors[v]}20` : 'transparent', color: item.verification === v ? verificationColors[v] : 'var(--color-text-3)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600, transition: 'all var(--transition)' }}>
                          {v === 'VERIFIED' ? '✓' : v === 'MISSING' ? '!' : '~'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)' }}>{item.verified_by_name ?? '—'}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="New Audit Cycle" size="lg"
        footer={<><Button variant="ghost" onClick={() => setCreateModal(false)}>Cancel</Button><Button loading={saving} onClick={handleCreate as any}>Create Cycle</Button></>}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Cycle name *" id="audit-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Q3 2026 Asset Audit" required />
          <div className="form-grid">
            <Input label="Start date *" id="audit-start" type="date" value={form.starts_on} onChange={e => setForm(f => ({ ...f, starts_on: e.target.value }))} required />
            <Input label="End date *" id="audit-end" type="date" value={form.ends_on} onChange={e => setForm(f => ({ ...f, ends_on: e.target.value }))} required />
          </div>
          <Select label="Scope by department (optional)" id="audit-dept" value={form.scope_department_id} onChange={e => setForm(f => ({ ...f, scope_department_id: e.target.value }))} placeholder="All departments">
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Input label="Scope by location (optional)" id="audit-loc" value={form.scope_location} onChange={e => setForm(f => ({ ...f, scope_location: e.target.value }))} placeholder="e.g. Floor 3" />
          <div className="input-wrapper">
            <label className="input-label">Assign auditors</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-2)', borderRadius: 'var(--radius-md)' }}>
              {auditors.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 'var(--radius-full)', border: '1px solid', cursor: 'pointer', fontSize: '0.8rem', transition: 'all var(--transition)', borderColor: form.auditor_ids.includes(u.id) ? 'rgba(20,184,166,0.4)' : 'var(--color-border)', background: form.auditor_ids.includes(u.id) ? 'rgba(20,184,166,0.1)' : 'transparent', color: form.auditor_ids.includes(u.id) ? 'var(--color-primary-400)' : 'var(--color-text-2)' }}>
                  <input type="checkbox" style={{ display: 'none' }} checked={form.auditor_ids.includes(u.id)} onChange={e => setForm(f => ({ ...f, auditor_ids: e.target.checked ? [...f.auditor_ids, u.id] : f.auditor_ids.filter(id => id !== u.id) }))} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Close Cycle Confirm */}
      <ConfirmDialog open={closeConfirm} onClose={() => setCloseConfirm(false)} onConfirm={handleClose} danger loading={saving}
        title="Close Audit Cycle"
        message={<>Closing this cycle will: <strong>lock</strong> further edits, and mark all confirmed-MISSING assets as <strong>LOST</strong>. This cannot be undone.</>}
        confirmLabel="Close Cycle"
      />
    </div>
  );
}
