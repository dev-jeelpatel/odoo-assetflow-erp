'use client';
import React, { useState, useEffect, useCallback, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, ArrowLeftRight, AlertTriangle, CheckCircle, Clock, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { fmtDate, timeAgo } from '@/lib/utils';

interface Allocation { id: number; asset_tag: string; asset_name: string; holder_name: string; holder_department: string; allocated_by_name: string; allocated_at: string; expected_return_date: string; returned_at: string | null; is_overdue_flagged: boolean; }
interface Transfer { id: number; asset_tag: string; asset_name: string; from_user_name: string; to_user_name: string; to_dept_name: string; reason: string; status: string; requested_by_name: string; decided_by_name: string; created_at: string; }
interface Asset { id: number; asset_tag: string; name: string; status: string; }
interface User { id: number; name: string; email: string; }

function AllocationsContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') ?? 'active');
  const canManage = user?.role === 'ADMIN' || user?.role === 'ASSET_MANAGER';

  // Active allocations
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [loadingAllocs, setLoadingAllocs] = useState(true);
  const [allocPage, setAllocPage] = useState(1);
  const [allocTotal, setAllocTotal] = useState(0);

  // Transfers
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);

  // Modals
  const [allocModal, setAllocModal] = useState(false);
  const [returnModal, setReturnModal] = useState<Allocation | null>(null);
  const [transferModal, setTransferModal] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{ message: string; asset: Asset; currentHolder: string } | null>(null);

  // Form state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [allocForm, setAllocForm] = useState({ asset_id: '', user_id: '', expected_return_date: '' });
  const [returnForm, setReturnForm] = useState({ notes: '' });
  const [transferForm, setTransferForm] = useState({ asset_id: '', to_user_id: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const loadAllocs = useCallback(async () => {
    setLoadingAllocs(true);
    try {
      const overdue = tab === 'overdue';
      const r = await api.get<Allocation[]>('/allocations', { page: allocPage, limit: 20, overdue: overdue || undefined });
      setAllocs(r.data ?? []); setAllocTotal(r.meta?.total ?? 0);
    } finally { setLoadingAllocs(false); }
  }, [tab, allocPage]);

  const loadTransfers = useCallback(async () => {
    setLoadingTransfers(true);
    try { const r = await api.get<Transfer[]>('/transfers?limit=50'); setTransfers(r.data ?? []); } finally { setLoadingTransfers(false); }
  }, []);

  useEffect(() => { if (tab === 'transfers') loadTransfers(); else loadAllocs(); }, [tab, loadAllocs, loadTransfers]);

  useEffect(() => {
    Promise.all([
      api.get<Asset[]>('/assets?status=AVAILABLE&limit=200'),
      api.get<User[]>('/users?limit=200'),
    ]).then(([ar, ur]) => { setAssets(ar.data ?? []); setUsers(ur.data ?? []); });
  }, []);

  const handleAllocate = async (e: FormEvent) => {
    e.preventDefault();
    if (!allocForm.asset_id || !allocForm.user_id) { toast('Select asset and employee.', 'warning'); return; }
    setSaving(true);
    try {
      await api.post('/allocations', { asset_id: Number(allocForm.asset_id), allocated_to_user_id: Number(allocForm.user_id), expected_return_date: allocForm.expected_return_date || null });
      toast('Asset allocated successfully.', 'success');
      setAllocModal(false); setConflictInfo(null); loadAllocs();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictInfo({ message: err.message, asset: assets.find(a => a.id === Number(allocForm.asset_id))!, currentHolder: err.message });
      } else { toast(err instanceof ApiError ? err.message : 'Allocation failed.', 'error'); }
    } finally { setSaving(false); }
  };

  const handleReturn = async (e: FormEvent) => {
    e.preventDefault();
    if (!returnModal) return;
    setSaving(true);
    try {
      await api.post(`/allocations/${returnModal.id}/return`, { return_condition_notes: returnForm.notes || null });
      toast('Asset returned successfully.', 'success');
      setReturnModal(null); loadAllocs();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Return failed.', 'error'); } finally { setSaving(false); }
  };

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!transferForm.asset_id || !transferForm.to_user_id) { toast('Select asset and recipient.', 'warning'); return; }
    setSaving(true);
    try {
      await api.post('/transfers', { asset_id: Number(transferForm.asset_id), to_user_id: Number(transferForm.to_user_id), reason: transferForm.reason });
      toast('Transfer request submitted.', 'success');
      setTransferModal(false); setConflictInfo(null); loadTransfers();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Transfer failed.', 'error'); } finally { setSaving(false); }
  };

  const handleTransferAction = async (id: number, action: 'approve' | 'reject') => {
    try {
      await api.post(`/transfers/${id}/${action}`);
      toast(`Transfer ${action}d.`, 'success'); loadTransfers();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Action failed.', 'error'); }
  };

  const allocCols: Column<Allocation>[] = [
    { key: 'asset_tag', header: 'Asset', render: a => <span className="tag-label">{a.asset_tag}</span> },
    { key: 'asset_name', header: 'Name', render: a => <span style={{ fontWeight: 500 }}>{a.asset_name}</span> },
    { key: 'holder_name', header: 'Holder', render: a => <span>{a.holder_name ?? a.holder_department}</span> },
    { key: 'allocated_at', header: 'Since', render: a => fmtDate(a.allocated_at) },
    { key: 'expected_return_date', header: 'Due', render: a => a.expected_return_date ? <span style={{ color: a.is_overdue_flagged ? '#f87171' : undefined }}>{fmtDate(a.expected_return_date)}</span> : '—' },
    { key: 'overdue', header: '', render: a => a.is_overdue_flagged ? <span className="pill pill-critical">Overdue</span> : null },
    { key: 'actions', header: '', render: a => !a.returned_at && canManage ? (
      <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={13} />} onClick={e => { e.stopPropagation(); setReturnForm({ notes: '' }); setReturnModal(a); }}>Return</Button>
    ) : null },
  ];

  const transferCols: Column<Transfer>[] = [
    { key: 'asset_tag', header: 'Asset', render: t => <span className="tag-label">{t.asset_tag}</span> },
    { key: 'from_user_name', header: 'From', render: t => t.from_user_name },
    { key: 'to_user_name', header: 'To', render: t => t.to_user_name ?? t.to_dept_name },
    { key: 'reason', header: 'Reason', render: t => <span className="muted truncate" style={{ maxWidth: 200, display: 'block' }}>{t.reason}</span> },
    { key: 'status', header: 'Status', render: t => <StatusPill status={t.status} /> },
    { key: 'created_at', header: 'Requested', render: t => timeAgo(t.created_at) },
    { key: 'actions', header: '', render: t => t.status === 'REQUESTED' && canManage ? (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button size="sm" variant="primary" leftIcon={<CheckCircle size={12} />} onClick={e => { e.stopPropagation(); handleTransferAction(t.id, 'approve'); }}>Approve</Button>
        <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleTransferAction(t.id, 'reject'); }}>Reject</Button>
      </div>
    ) : null },
  ];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Allocation & Transfer</h1><p className="page-subtitle">Manage asset assignments and ownership transfers</p></div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" leftIcon={<ArrowLeftRight size={15} />} onClick={() => { setTransferForm({ asset_id: '', to_user_id: '', reason: '' }); setTransferModal(true); }}>Transfer Request</Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => { setAllocForm({ asset_id: '', user_id: '', expected_return_date: '' }); setConflictInfo(null); setAllocModal(true); }}>Allocate Asset</Button>
          </div>
        )}
      </div>

      <div className="tab-bar">
        {[['active', 'Active Allocations'], ['overdue', 'Overdue'], ['transfers', 'Transfer Requests']].map(([k, label]) => (
          <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} id={`alloc-tab-${k}`}>{label}</button>
        ))}
      </div>

      {tab !== 'transfers' && (
        <Table columns={allocCols} data={allocs} loading={loadingAllocs} rowKey={a => a.id}
          page={allocPage} total={allocTotal} limit={20} totalPages={Math.ceil(allocTotal / 20)}
          onPageChange={setAllocPage} rowClassName={a => a.is_overdue_flagged ? 'overdue-row' : ''}
          emptyMessage={tab === 'overdue' ? 'No overdue allocations. Great!' : 'No active allocations.'} />
      )}
      {tab === 'transfers' && (
        <Table columns={transferCols} data={transfers} loading={loadingTransfers} rowKey={t => t.id} emptyMessage="No transfer requests." />
      )}

      {/* Allocate Modal */}
      <Modal open={allocModal} onClose={() => { setAllocModal(false); setConflictInfo(null); }} title="Allocate Asset"
        footer={<><Button variant="ghost" onClick={() => { setAllocModal(false); setConflictInfo(null); }}>Cancel</Button><Button loading={saving} onClick={handleAllocate as any}>Allocate</Button></>}>
        <form onSubmit={handleAllocate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflictInfo && (
            <div className="alert alert-danger">
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Already allocated</p>
                <p style={{ fontSize: '0.825rem' }}>{conflictInfo.message}</p>
                <Button variant="danger" size="sm" style={{ marginTop: 8 }}
                  onClick={() => { setAllocModal(false); setTransferForm({ asset_id: allocForm.asset_id, to_user_id: allocForm.user_id, reason: '' }); setTransferModal(true); }}>
                  <ArrowLeftRight size={13} /> Request Transfer Instead
                </Button>
              </div>
            </div>
          )}
          <Select label="Asset *" id="alloc-asset" value={allocForm.asset_id} onChange={e => setAllocForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Select available asset" required>
            {assets.map(a => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
          </Select>
          <Select label="Allocate to *" id="alloc-user" value={allocForm.user_id} onChange={e => setAllocForm(f => ({ ...f, user_id: e.target.value }))} placeholder="Select employee" required>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </Select>
          <Input label="Expected return date" id="alloc-return" type="date" value={allocForm.expected_return_date} onChange={e => setAllocForm(f => ({ ...f, expected_return_date: e.target.value }))} />
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal open={!!returnModal} onClose={() => setReturnModal(null)} title="Record Asset Return"
        footer={<><Button variant="ghost" onClick={() => setReturnModal(null)}>Cancel</Button><Button loading={saving} onClick={handleReturn as any}>Confirm Return</Button></>}>
        {returnModal && (
          <form onSubmit={handleReturn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontWeight: 600 }}>{returnModal.asset_tag} — {returnModal.asset_name}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)', marginTop: 2 }}>Returned by {returnModal.holder_name}</p>
            </div>
            <Textarea label="Return condition notes" value={returnForm.notes} onChange={(e: any) => setReturnForm(f => ({ ...f, notes: e.target.value }))} placeholder="Describe the condition of the asset on return (scratches, missing parts, etc.)" />
          </form>
        )}
      </Modal>

      {/* Transfer Modal */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="New Transfer Request"
        footer={<><Button variant="ghost" onClick={() => setTransferModal(false)}>Cancel</Button><Button loading={saving} onClick={handleTransfer as any}>Submit Request</Button></>}>
        <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Asset *" id="transfer-asset" value={transferForm.asset_id} onChange={e => setTransferForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Select asset to transfer" required>
            {[...assets, ...allocs.map(a => ({ id: parseInt(a.asset_tag.replace('AF-', '')), asset_tag: a.asset_tag, name: a.asset_name, status: 'ALLOCATED' }))].map(a => <option key={a.id} value={a.id}>{a.asset_tag} — {a.name}</option>)}
          </Select>
          <Select label="Transfer to *" id="transfer-user" value={transferForm.to_user_id} onChange={e => setTransferForm(f => ({ ...f, to_user_id: e.target.value }))} placeholder="Select recipient" required>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </Select>
          <Textarea label="Reason *" value={transferForm.reason} onChange={(e: any) => setTransferForm(f => ({ ...f, reason: e.target.value }))} placeholder="Why is this asset being transferred?" required />
        </form>
      </Modal>
    </div>
  );
}

export default function AllocationsPage() {
  return <Suspense fallback={<div className="spinner-center"><div className="spinner spinner-lg" /></div>}><AllocationsContent /></Suspense>;
}
