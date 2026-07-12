'use client';
import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, QrCode, Clock, Wrench, Calendar, Info, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/EmptyState';
import { fmtDate, fmtDateTime, fmtCurrency, prettyStatus, timeAgo } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface Asset {
  id: number; asset_tag: string; name: string; category_name: string; category_custom_fields: any;
  serial_number: string; status: string; cond: string; location: string; department_name: string;
  acquisition_date: string; acquisition_cost: number; is_bookable: boolean; custom_field_values: any;
  allocations: any[]; maintenance: any[]; files: any[]; upcoming_bookings: any[];
}

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const canManage = user?.role === 'ADMIN' || user?.role === 'ASSET_MANAGER';

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'allocations' | 'maintenance' | 'bookings'>('info');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<Asset>(`/assets/${id}`);
      setAsset(r.data);
      // Generate QR code from asset tag
      const url = await QRCode.toDataURL(r.data.asset_tag, { width: 180, margin: 1, color: { dark: '#14b8a6', light: '#111827' } });
      setQrDataUrl(url);
    } catch { router.replace('/assets'); } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async () => {
    if (!newStatus) return;
    setSavingStatus(true);
    try {
      await api.patch(`/assets/${id}/status`, { status: newStatus, note: statusNote || undefined });
      toast(`Status updated to ${prettyStatus(newStatus)}.`, 'success');
      setStatusModal(false); load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to update.', 'error'); } finally { setSavingStatus(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach(f => form.append('files', f));
    setUploadingFile(true);
    try {
      await api.postForm(`/assets/${id}/files`, form);
      toast('Files uploaded.', 'success'); load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Upload failed.', 'error'); } finally { setUploadingFile(false); e.target.value = ''; }
  };

  const adminStatuses = ['RETIRED', 'DISPOSED'];

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Skeleton height={32} width="40%" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <Skeleton height={300} />
        <Skeleton height={300} />
      </div>
    </div>
  );
  if (!asset) return null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={14} />} onClick={() => router.back()}>Back</Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <span className="tag-label">{asset.asset_tag}</span>
              <StatusPill status={asset.status} />
            </div>
            <h1 className="page-title" style={{ fontSize: '1.25rem' }}>{asset.name}</h1>
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={14} />
              <span>{uploadingFile ? 'Uploading…' : 'Upload Files'}</span>
              <input type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            <Button variant="secondary" size="sm" onClick={() => { setNewStatus(''); setStatusNote(''); setStatusModal(true); }}>
              Change Status
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* Main content */}
        <div>
          {/* Tabs */}
          <div className="tab-bar">
            {[['info', 'Details'], ['allocations', `Allocations (${asset.allocations.length})`], ['maintenance', `Maintenance (${asset.maintenance.length})`], ['bookings', `Upcoming Bookings (${asset.upcoming_bookings.length})`]].map(([k, label]) => (
              <button key={k} className={`tab-btn ${activeTab === k ? 'active' : ''}`} onClick={() => setActiveTab(k as any)}>{label}</button>
            ))}
          </div>

          {activeTab === 'info' && (
            <div className="card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {[
                  ['Category', asset.category_name],
                  ['Condition', asset.cond],
                  ['Location', asset.location ?? '—'],
                  ['Department', asset.department_name ?? '—'],
                  ['Serial Number', asset.serial_number ?? '—'],
                  ['Acquisition Date', fmtDate(asset.acquisition_date)],
                  ['Acquisition Cost', fmtCurrency(asset.acquisition_cost)],
                  ['Bookable Resource', asset.is_bookable ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', marginBottom: 3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                    <p style={{ fontSize: '0.9rem' }}>{value}</p>
                  </div>
                ))}
              </div>
              {asset.category_custom_fields && JSON.parse(asset.category_custom_fields as any).length > 0 && asset.custom_field_values && (
                <div className="form-section" style={{ marginTop: 20 }}>
                  <p className="form-section-title">Category Custom Fields</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {JSON.parse(asset.category_custom_fields as any).map((f: any) => (
                      <div key={f.key}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', fontWeight: 500 }}>{f.label}</p>
                        <p style={{ fontSize: '0.9rem' }}>{(asset.custom_field_values as any)?.[f.key] ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Files */}
              {asset.files.length > 0 && (
                <div className="form-section" style={{ marginTop: 20 }}>
                  <p className="form-section-title">Attached Files ({asset.files.length})</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {asset.files.map((f: any) => (
                      <a key={f.id} href={`${BASE}/assets/files/${f.id}`} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', fontSize: '0.8rem', textDecoration: 'none', color: 'var(--color-text-2)' }}>
                        <Download size={13} />{f.original_name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'allocations' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="af-table">
                <thead><tr><th>Holder</th><th>Allocated By</th><th>From</th><th>Expected Return</th><th>Returned</th><th>Return Condition</th></tr></thead>
                <tbody>
                  {asset.allocations.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-3)' }}>No allocation history.</td></tr>
                  ) : asset.allocations.map((a: any) => (
                    <tr key={a.id}>
                      <td><strong>{a.holder_name ?? a.holder_department ?? '—'}</strong></td>
                      <td>{a.allocated_by_name}</td>
                      <td>{fmtDate(a.allocated_at)}</td>
                      <td>{fmtDate(a.expected_return_date) ?? '—'}</td>
                      <td>{a.returned_at ? fmtDate(a.returned_at) : <span className="pill pill-allocated">Active</span>}</td>
                      <td>{a.return_condition_notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="timeline" style={{ paddingLeft: 8 }}>
              {asset.maintenance.length === 0 ? <p style={{ color: 'var(--color-text-3)' }}>No maintenance history.</p> :
                asset.maintenance.map((m: any) => (
                  <div key={m.id} className="timeline-item">
                    <div className="timeline-dot" style={{ background: m.status === 'RESOLVED' ? 'var(--color-success)' : m.status === 'REJECTED' ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                    <div className="timeline-content">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <StatusPill status={m.status} type="maintenance" />
                        <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{m.issue_description}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-2)' }}>Raised by {m.raised_by_name} · {timeAgo(m.created_at)}</p>
                      {m.resolution_notes && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-3)', marginTop: 4 }}>Resolution: {m.resolution_notes}</p>}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="af-table">
                <thead><tr><th>Booked By</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
                <tbody>
                  {asset.upcoming_bookings.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-3)' }}>No upcoming bookings.</td></tr>
                  ) : asset.upcoming_bookings.map((b: any) => (
                    <tr key={b.id}>
                      <td>{b.booked_by_name}</td>
                      <td>{fmtDateTime(b.starts_at)}</td>
                      <td>{fmtDateTime(b.ends_at)}</td>
                      <td><StatusPill status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar: QR Code */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-2)', fontSize: '0.8rem', fontWeight: 500 }}>
              <QrCode size={14} /> QR Code
            </div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR for ${asset.asset_tag}`} style={{ borderRadius: 8, border: '2px solid rgba(20,184,166,0.2)' }} />
            ) : <div className="skeleton" style={{ width: 180, height: 180 }} />}
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', textAlign: 'center' }}>Scan to look up this asset</p>
            {qrDataUrl && (
              <a href={qrDataUrl} download={`${asset.asset_tag}-qr.png`} className="btn btn-secondary btn-sm">
                <Download size={13} /> Download QR
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Status change modal */}
      {canManage && (
        <Modal open={statusModal} onClose={() => setStatusModal(false)} title="Change Asset Status"
          footer={<><Button variant="ghost" onClick={() => setStatusModal(false)}>Cancel</Button><Button loading={savingStatus} onClick={handleStatusChange} disabled={!newStatus}>Update Status</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="alert alert-warning">
              Current status: <strong>{prettyStatus(asset.status)}</strong>. Use dedicated workflows for Allocated/Under Maintenance transitions.
            </div>
            <Select label="New status" id="new-status" value={newStatus} onChange={e => setNewStatus(e.target.value)} placeholder="Select new status">
              {adminStatuses.map(s => <option key={s} value={s}>{prettyStatus(s)}</option>)}
              {asset.status === 'LOST' && <option value="AVAILABLE">Available (found in audit)</option>}
            </Select>
            <Input label="Note (optional)" id="status-note" value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="Reason for status change" />
          </div>
        </Modal>
      )}
    </div>
  );
}
