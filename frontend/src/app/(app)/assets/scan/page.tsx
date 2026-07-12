'use client';
import React, { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, QrCode, Search, ArrowRight, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusPill } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/utils';

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR'];

interface ActiveAllocation {
  id: number;
  allocated_to_user_id: number | null;
  allocated_to_department_id: number | null;
  expected_return_date: string | null;
}
interface ScannedAsset {
  id: number; asset_tag: string; name: string; category_name: string; department_name: string | null;
  status: string; active_allocation: ActiveAllocation | null;
}
interface UserOpt { id: number; name: string; }
interface DeptOpt { id: number; name: string; }

export default function ScanAssetPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const canAllocate = user?.role === 'ADMIN' || user?.role === 'ASSET_MANAGER' || user?.role === 'DEPT_HEAD';

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraSupported, setCameraSupported] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualTag, setManualTag] = useState('');
  const [resolving, setResolving] = useState(false);
  const [asset, setAsset] = useState<ScannedAsset | null>(null);

  const [users, setUsers] = useState<UserOpt[]>([]);
  const [depts, setDepts] = useState<DeptOpt[]>([]);
  const [saving, setSaving] = useState(false);

  const [returnForm, setReturnForm] = useState({ return_condition: 'GOOD', notes: '' });
  const [allocForm, setAllocForm] = useState({ target: 'me', user_id: '', department_id: '', expected_return_date: '' });

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const handleTagResolved = useCallback(async (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag) return;
    setResolving(true);
    try {
      const r = await api.get<ScannedAsset>(`/assets/by-tag/${encodeURIComponent(tag)}`);
      setAsset(r.data);
      setReturnForm({ return_condition: 'GOOD', notes: '' });
      setAllocForm({ target: 'me', user_id: '', department_id: '', expected_return_date: '' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Asset not found.', 'error');
    } finally {
      setResolving(false);
    }
  }, [toast]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!('BarcodeDetector' in window)) { setCameraSupported(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      setCameraActive(true);
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes.length) {
            const value = codes[0].rawValue as string;
            stopCamera();
            handleTagResolved(value);
          }
        } catch {
          // transient decode error — keep scanning
        }
      }, 300);
    } catch {
      setCameraError('Camera access was denied or unavailable. Use manual entry below.');
      setCameraActive(false);
    }
  }, [handleTagResolved, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canAllocate) return;
    Promise.all([
      api.get<UserOpt[]>('/users?limit=200'),
      api.get<DeptOpt[]>('/departments?limit=100'),
    ]).then(([ur, dr]) => { setUsers(ur.data ?? []); setDepts(dr.data ?? []); }).catch(() => {});
  }, [canAllocate]);

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleTagResolved(manualTag);
  };

  const scanNext = () => {
    setAsset(null);
    setManualTag('');
    startCamera();
  };

  const handleReturn = async (e: FormEvent) => {
    e.preventDefault();
    if (!asset?.active_allocation) return;
    setSaving(true);
    try {
      await api.post(`/allocations/${asset.active_allocation.id}/return`, {
        return_condition: returnForm.return_condition,
        return_condition_notes: returnForm.notes || undefined,
      });
      toast(`${asset.asset_tag} returned successfully.`, 'success');
      scanNext();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Return failed.', 'error');
    } finally { setSaving(false); }
  };

  const handleAllocate = async (e: FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    if (allocForm.target === 'employee' && !allocForm.user_id) { toast('Select an employee.', 'warning'); return; }
    if (allocForm.target === 'department' && !allocForm.department_id) { toast('Select a department.', 'warning'); return; }
    setSaving(true);
    try {
      await api.post('/allocations', {
        asset_id: asset.id,
        allocated_to_user_id: allocForm.target === 'me' ? user!.id : allocForm.target === 'employee' ? Number(allocForm.user_id) : null,
        allocated_to_department_id: allocForm.target === 'department' ? Number(allocForm.department_id) : null,
        expected_return_date: allocForm.expected_return_date || null,
      });
      toast(`${asset.asset_tag} allocated successfully.`, 'success');
      scanNext();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Allocation failed.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Scan Asset</h1><p className="page-subtitle">Scan a QR code or enter an asset tag to check in or out</p></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 360px) 1fr', gap: 20, alignItems: 'start' }}>
        {/* Scanner / manual entry */}
        <div className="card" style={{ padding: 20 }}>
          {cameraSupported ? (
            <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000', aspectRatio: '1 / 1', marginBottom: 16 }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraActive ? 'block' : 'none' }} />
              {!cameraActive && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-text-3)' }}>
                  <Camera size={28} />
                  <span style={{ fontSize: '0.8rem', textAlign: 'center', padding: '0 16px' }}>{cameraError || 'Starting camera…'}</span>
                  {cameraError && <Button size="sm" variant="secondary" onClick={startCamera}>Try Again</Button>}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0', color: 'var(--color-text-3)', textAlign: 'center' }}>
              <QrCode size={28} />
              <span style={{ fontSize: '0.8rem' }}>Live scanning isn&apos;t supported in this browser. Enter the asset tag manually below.</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Input placeholder="Or enter tag, e.g. AF-0042" value={manualTag} leftIcon={<Search size={14} />}
                onChange={e => setManualTag(e.target.value)} id="scan-manual-tag" />
            </div>
            <Button type="submit" loading={resolving} rightIcon={<ArrowRight size={14} />}>Go</Button>
          </form>
        </div>

        {/* Result / action sheet */}
        <div>
          {!asset ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)' }}>
              Scan a QR code or type an asset tag to get started.
            </div>
          ) : (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span className="tag-label">{asset.asset_tag}</span>
                <StatusPill status={asset.status} />
              </div>
              <h2 style={{ fontSize: '1.15rem', marginBottom: 2 }}>{asset.name}</h2>
              <p style={{ color: 'var(--color-text-3)', fontSize: '0.85rem', marginBottom: 18 }}>
                {asset.category_name}{asset.department_name ? ` · ${asset.department_name}` : ''}
              </p>

              {asset.active_allocation ? (
                <form onSubmit={handleReturn}>
                  <p style={{ fontSize: '0.85rem', marginBottom: 14 }}>
                    Currently allocated{asset.active_allocation.expected_return_date ? ` — due ${fmtDate(asset.active_allocation.expected_return_date)}` : ''}.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <Select label="Return condition" value={returnForm.return_condition}
                      onChange={e => setReturnForm(f => ({ ...f, return_condition: e.target.value }))}>
                      {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <Textarea label="Notes (optional)" value={returnForm.notes}
                      onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                  </div>
                  <Button type="submit" loading={saving} leftIcon={<RotateCcw size={14} />}>Return Asset</Button>
                </form>
              ) : canAllocate ? (
                <form onSubmit={handleAllocate}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <Select label="Allocate to" value={allocForm.target}
                      onChange={e => setAllocForm(f => ({ ...f, target: e.target.value }))}>
                      <option value="me">Me</option>
                      <option value="employee">Employee</option>
                      <option value="department">Department</option>
                    </Select>
                    {allocForm.target === 'employee' && (
                      <Select label="Employee" value={allocForm.user_id} placeholder="Select employee"
                        onChange={e => setAllocForm(f => ({ ...f, user_id: e.target.value }))}>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select>
                    )}
                    {allocForm.target === 'department' && (
                      <Select label="Department" value={allocForm.department_id} placeholder="Select department"
                        onChange={e => setAllocForm(f => ({ ...f, department_id: e.target.value }))}>
                        {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select>
                    )}
                    <Input label="Expected return date (optional)" type="date" value={allocForm.expected_return_date}
                      onChange={e => setAllocForm(f => ({ ...f, expected_return_date: e.target.value }))} />
                  </div>
                  <Button type="submit" loading={saving} rightIcon={<ArrowRight size={14} />}>Allocate Asset</Button>
                </form>
              ) : (
                <p style={{ color: 'var(--color-text-3)', fontSize: '0.85rem' }}>Not currently allocated — ask a manager to allocate it.</p>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/assets/${asset.id}`)}>View Asset</Button>
                <Button variant="ghost" size="sm" leftIcon={<Camera size={13} />} onClick={scanNext}>Scan Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
