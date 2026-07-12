'use client';
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Plus, Wrench, UserCheck, Play, CheckCircle, X, AlertTriangle, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { StatusPill, PriorityBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/EmptyState';
import { fmtDate, timeAgo } from '@/lib/utils';

interface MaintenanceRequest {
  id: number; asset_tag: string; asset_name?: string; issue_description: string;
  priority: string; status: string; technician_name: string; raised_by_name: string;
  decided_by_name: string; resolution_notes: string; created_at: string; resolved_at: string;
}
interface Asset { id: number; asset_tag: string; name: string; }

const KANBAN_COLS = [
  { key: 'PENDING', label: 'Pending', color: 'var(--color-warning)' },
  { key: 'APPROVED', label: 'Approved', color: 'var(--color-success)' },
  { key: 'TECHNICIAN_ASSIGNED', label: 'Tech Assigned', color: '#c084fc' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: '#60a5fa' },
  { key: 'RESOLVED', label: 'Resolved', color: '#34d399' },
];

export default function MaintenancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canManage = user?.role === 'ADMIN' || user?.role === 'ASSET_MANAGER';

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [raiseModal, setRaiseModal] = useState(false);
  const [detailModal, setDetailModal] = useState<MaintenanceRequest | null>(null);
  const [actionModal, setActionModal] = useState<{ req: MaintenanceRequest; action: string } | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [saving, setSaving] = useState(false);

  const [raiseForm, setRaiseForm] = useState({ asset_id: '', issue_description: '', priority: 'MEDIUM', photo: null as File | null });
  const [actionForm, setActionForm] = useState({ technician_name: '', resolution_notes: '', reject_notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<MaintenanceRequest[]>('/maintenance?limit=200');
      setRequests(r.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<Asset[]>('/assets?limit=200').then(r => setAssets(r.data ?? [])); }, []);

  const handleRaise = async (e: FormEvent) => {
    e.preventDefault();
    if (!raiseForm.asset_id || !raiseForm.issue_description) { toast('Asset and description are required.', 'warning'); return; }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('asset_id', raiseForm.asset_id);
      form.append('issue_description', raiseForm.issue_description);
      form.append('priority', raiseForm.priority);
      if (raiseForm.photo) form.append('photo', raiseForm.photo);
      await api.postForm('/maintenance', form);
      toast('Maintenance request raised.', 'success');
      setRaiseModal(false); setRaiseForm({ asset_id: '', issue_description: '', priority: 'MEDIUM', photo: null }); load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to raise request.', 'error'); } finally { setSaving(false); }
  };

  const handleAction = async (req: MaintenanceRequest, action: string, extra?: Record<string, string>) => {
    setSaving(true);
    try {
      await api.post(`/maintenance/${req.id}/${action}`, extra ?? {});
      const msgs: Record<string, string> = {
        approve: 'Request approved. Asset flipped to Under Maintenance.',
        reject: 'Request rejected.',
        'assign-technician': 'Technician assigned.',
        start: 'Work started.',
        resolve: 'Maintenance resolved. Asset returned to service.',
      };
      toast(msgs[action] ?? 'Done.', 'success');
      setActionModal(null); setDetailModal(null); load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Action failed.', 'error'); } finally { setSaving(false); }
  };

  const grouped = KANBAN_COLS.reduce<Record<string, MaintenanceRequest[]>>((acc, col) => {
    acc[col.key] = requests.filter(r => r.status === col.key);
    return acc;
  }, {});

  const cardActions = (req: MaintenanceRequest) => {
    if (!canManage && req.status !== 'PENDING') return null;
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
        {req.status === 'PENDING' && canManage && (<>
          <Button size="sm" variant="primary" leftIcon={<CheckCircle size={12} />} onClick={e => { e.stopPropagation(); handleAction(req, 'approve'); }}>Approve</Button>
          <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); setActionForm(f => ({ ...f, reject_notes: '' })); setActionModal({ req, action: 'reject' }); }}>Reject</Button>
        </>)}
        {req.status === 'APPROVED' && canManage && (
          <Button size="sm" variant="secondary" leftIcon={<UserCheck size={12} />} onClick={e => { e.stopPropagation(); setActionForm({ technician_name: '', resolution_notes: '' }); setActionModal({ req, action: 'assign-technician' }); }}>Assign Tech</Button>
        )}
        {req.status === 'TECHNICIAN_ASSIGNED' && canManage && (
          <Button size="sm" variant="secondary" leftIcon={<Play size={12} />} onClick={e => { e.stopPropagation(); handleAction(req, 'start'); }}>Start Work</Button>
        )}
        {req.status === 'IN_PROGRESS' && canManage && (
          <Button size="sm" variant="primary" leftIcon={<CheckCircle size={12} />} onClick={e => { e.stopPropagation(); setActionForm({ technician_name: '', resolution_notes: '' }); setActionModal({ req, action: 'resolve' }); }}>Resolve</Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Maintenance</h1><p className="page-subtitle">Track and manage maintenance requests</p></div>
        <Button leftIcon={<Plus size={15} />} onClick={() => setRaiseModal(true)} id="raise-maintenance-btn">Raise Request</Button>
      </div>

      {/* Kanban board */}
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12 }}>
        {KANBAN_COLS.map(col => {
          const items = grouped[col.key] ?? [];
          return (
            <div key={col.key} className="kanban-col">
              <div className="kanban-col-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{col.label}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>
                  {loading ? '…' : items.length}
                </span>
              </div>
              <div className="kanban-cards">
                {loading ? Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton height={14} width="80%" />
                    <Skeleton height={11} width="50%" />
                  </div>
                )) : items.length === 0 ? (
                  <p style={{ color: 'var(--color-text-3)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>No requests</p>
                ) : items.map(req => (
                  <div key={req.id} className="kanban-card" onClick={() => setDetailModal(req)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <span className="tag-label" style={{ fontSize: '0.7rem' }}>{req.asset_tag}</span>
                      <PriorityBadge priority={req.priority} />
                    </div>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.4 }}>{req.issue_description}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-3)' }}>By {req.raised_by_name} · {timeAgo(req.created_at)}</p>
                    {req.technician_name && <p style={{ fontSize: '0.72rem', color: 'var(--color-text-2)' }}>🔧 {req.technician_name}</p>}
                    {cardActions(req)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* REJECTED column */}
        <div className="kanban-col">
          <div className="kanban-col-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger)' }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Rejected</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>
              {requests.filter(r => r.status === 'REJECTED').length}
            </span>
          </div>
          <div className="kanban-cards">
            {requests.filter(r => r.status === 'REJECTED').map(req => (
              <div key={req.id} className="kanban-card" onClick={() => setDetailModal(req)}>
                <span className="tag-label" style={{ fontSize: '0.7rem' }}>{req.asset_tag}</span>
                <p style={{ fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.4, color: 'var(--color-text-2)' }}>{req.issue_description}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-3)' }}>Rejected · {timeAgo(req.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Raise Request Modal */}
      <Modal open={raiseModal} onClose={() => setRaiseModal(false)} title="Raise Maintenance Request"
        footer={<><Button variant="ghost" onClick={() => setRaiseModal(false)}>Cancel</Button><Button loading={saving} onClick={handleRaise as any}>Submit Request</Button></>}>
        <form onSubmit={handleRaise} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
            <AlertTriangle size={14} /><span>Raising a request does <strong>not</strong> change asset status. Only Asset Manager approval triggers the status change.</span>
          </div>
          <Select label="Asset *" id="maint-asset" value={raiseForm.asset_id} onChange={e => setRaiseForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Select asset" required>
            {assets.map(a => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
          </Select>
          <Select label="Priority" id="maint-priority" value={raiseForm.priority} onChange={e => setRaiseForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
          </Select>
          <Textarea label="Issue description *" value={raiseForm.issue_description} onChange={(e: any) => setRaiseForm(f => ({ ...f, issue_description: e.target.value }))} placeholder="Describe the issue in detail…" required />
          <div className="input-wrapper">
            <label className="input-label">Photo (optional)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--color-surface-2)', border: '1px dashed var(--color-border-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--color-text-2)' }}>
              <Upload size={15} />{raiseForm.photo ? raiseForm.photo.name : 'Upload photo of the issue'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setRaiseForm(f => ({ ...f, photo: e.target.files?.[0] ?? null }))} />
            </label>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      {detailModal && (
        <Modal open={true} onClose={() => setDetailModal(null)} title="Maintenance Request" size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tag-label">{detailModal.asset_tag}</span>
              <StatusPill status={detailModal.status} type="maintenance" />
              <PriorityBadge priority={detailModal.priority} />
            </div>
            <p style={{ fontSize: '0.9375rem' }}>{detailModal.issue_description}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['Raised By', detailModal.raised_by_name], ['Raised', fmtDate(detailModal.created_at)], ['Decided By', detailModal.decided_by_name ?? '—'], ['Technician', detailModal.technician_name ?? '—'], ['Resolved', detailModal.resolved_at ? fmtDate(detailModal.resolved_at) : '—'], ['Resolution', detailModal.resolution_notes ?? '—']].map(([k, v]) => (
                <div key={k}><p style={{ fontSize: '0.72rem', color: 'var(--color-text-3)', fontWeight: 500 }}>{k}</p><p style={{ fontSize: '0.875rem' }}>{v}</p></div>
              ))}
            </div>
            {canManage && cardActions(detailModal)}
          </div>
        </Modal>
      )}

      {/* Action Modal (assign tech / resolve / reject) */}
      {actionModal && (
        <Modal open={true} onClose={() => setActionModal(null)}
          title={actionModal.action === 'assign-technician' ? 'Assign Technician' : actionModal.action === 'reject' ? 'Reject Request' : 'Resolve Request'}
          footer={<><Button variant="ghost" onClick={() => setActionModal(null)}>Cancel</Button><Button
            variant={actionModal.action === 'reject' ? 'danger' : 'primary'}
            loading={saving}
            disabled={actionModal.action === 'reject' && actionForm.reject_notes.trim().length < 3}
            onClick={() => handleAction(
              actionModal.req,
              actionModal.action,
              actionModal.action === 'assign-technician' ? { technician_name: actionForm.technician_name }
                : actionModal.action === 'reject' ? { notes: actionForm.reject_notes }
                : { resolution_notes: actionForm.resolution_notes }
            )}
          >Confirm</Button></>}>
          {actionModal.action === 'assign-technician' ? (
            <Input label="Technician name *" id="tech-name" value={actionForm.technician_name} onChange={e => setActionForm(f => ({ ...f, technician_name: e.target.value }))} placeholder="e.g. Ravi Kumar" required />
          ) : actionModal.action === 'reject' ? (
            <Textarea label="Rejection reason *" value={actionForm.reject_notes} onChange={(e: any) => setActionForm(f => ({ ...f, reject_notes: e.target.value }))} placeholder="Explain why this request is being rejected (min 3 characters)…" required />
          ) : (
            <Textarea label="Resolution notes *" value={actionForm.resolution_notes} onChange={(e: any) => setActionForm(f => ({ ...f, resolution_notes: e.target.value }))} placeholder="Describe what was done to fix the issue…" required />
          )}
        </Modal>
      )}
    </div>
  );
}
