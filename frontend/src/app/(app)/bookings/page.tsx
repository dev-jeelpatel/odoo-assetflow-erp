'use client';
import React, { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, AlertTriangle, Clock, Calendar } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/Badge';
import { fmtDate, fmtDateTime } from '@/lib/utils';

interface BookableAsset { id: number; asset_tag: string; name: string; location: string; }
interface Booking { id: number; asset_id: number; asset_name?: string; asset_tag?: string; booked_by_name: string; starts_at: string; ends_at: string; status: string; }

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDays(base: Date) {
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function BookingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resources, setResources] = useState<BookableAsset[]>([]);
  const [selectedResource, setSelectedResource] = useState<BookableAsset | null>(null);
  const [weekBase, setWeekBase] = useState(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [form, setForm] = useState({ starts_at: '', ends_at: '' });
  const [saving, setSaving] = useState(false);
  const [conflictError, setConflictError] = useState('');
  const [view, setView] = useState<'calendar' | 'my'>('calendar');

  const weekDays = getWeekDays(weekBase);

  useEffect(() => {
    api.get<BookableAsset[]>('/assets?bookable=true&limit=50').then(r => {
      setResources(r.data ?? []);
      if (r.data?.length) setSelectedResource(r.data[0]);
    });
  }, []);

  const loadBookings = useCallback(async () => {
    if (!selectedResource) return;
    setLoading(true);
    try {
      const from = weekDays[0].toISOString();
      const to = weekDays[6].toISOString();
      const [calRes, myRes] = await Promise.all([
        api.get<Booking[]>(`/assets/${selectedResource.id}/bookings`, { from, to }),
        api.get<Booking[]>('/bookings?my=true&limit=50'),
      ]);
      setBookings(calRes.data ?? []);
      setMyBookings(myRes.data ?? []);
    } finally { setLoading(false); }
  }, [selectedResource, weekDays[0].toISOString()]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Convert booking to pixel position on the calendar
  const getBookingStyle = (b: Booking, dayIdx: number) => {
    const start = new Date(b.starts_at);
    const end = new Date(b.ends_at);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const top = startHour * 48; // 48px per hour
    const height = Math.max((endHour - startHour) * 48, 20);
    return { top, height };
  };

  const handleCellClick = (day: Date, hour: number) => {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    const end = new Date(d);
    end.setHours(hour + 1, 0, 0, 0);
    setForm({
      starts_at: d.toISOString().slice(0, 16),
      ends_at: end.toISOString().slice(0, 16),
    });
    setConflictError('');
    setModal(true);
  };

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !form.starts_at || !form.ends_at) return;
    if (new Date(form.ends_at) <= new Date(form.starts_at)) { setConflictError('End time must be after start time.'); return; }
    setSaving(true);
    setConflictError('');
    try {
      const excludeId = rescheduleTarget?.id;
      if (rescheduleTarget) {
        await api.post(`/bookings/${rescheduleTarget.id}/reschedule`, { starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() });
        toast('Booking rescheduled.', 'success');
        setRescheduleTarget(null);
      } else {
        await api.post('/bookings', { asset_id: selectedResource.id, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() });
        toast('Booking confirmed!', 'success');
      }
      setModal(false); loadBookings();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflictError(err.message);
      else toast(err instanceof ApiError ? err.message : 'Booking failed.', 'error');
    } finally { setSaving(false); }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.post(`/bookings/${cancelTarget.id}/cancel`);
      toast('Booking cancelled.', 'success'); setCancelTarget(null); loadBookings();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed.', 'error'); }
  };

  const myBookingCols: Column<Booking>[] = [
    { key: 'asset_tag', header: 'Resource', render: b => <span className="tag-label">{b.asset_tag ?? '—'}</span> },
    { key: 'asset_name', header: 'Name', render: b => b.asset_name ?? '—' },
    { key: 'starts_at', header: 'Start', render: b => fmtDateTime(b.starts_at) },
    { key: 'ends_at', header: 'End', render: b => fmtDateTime(b.ends_at) },
    { key: 'status', header: 'Status', render: b => <StatusPill status={b.status} /> },
    { key: 'actions', header: '', render: b => b.status === 'UPCOMING' ? (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setForm({ starts_at: b.starts_at.slice(0, 16), ends_at: b.ends_at.slice(0, 16) }); setRescheduleTarget(b); setConflictError(''); setModal(true); }}>Reschedule</Button>
        <Button variant="danger" size="sm" onClick={e => { e.stopPropagation(); setCancelTarget(b); }}>Cancel</Button>
      </div>
    ) : null },
  ];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Resource Booking</h1><p className="page-subtitle">Book shared resources: rooms, projectors, vehicles</p></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`tab-btn ${view === 'calendar' ? 'active' : ''}`} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }} onClick={() => setView('calendar')}><Calendar size={14} /> Calendar</button>
          <button className={`tab-btn ${view === 'my' ? 'active' : ''}`} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }} onClick={() => setView('my')}><Clock size={14} /> My Bookings</button>
        </div>
      </div>

      {view === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
          {/* Resource list */}
          <div className="card" style={{ padding: 12 }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-3)', marginBottom: 10 }}>Bookable Resources</p>
            {resources.length === 0 ? <p style={{ color: 'var(--color-text-3)', fontSize: '0.8rem' }}>No bookable assets found.</p> :
              resources.map(r => (
                <button key={r.id} onClick={() => setSelectedResource(r)}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 'var(--radius-md)', marginBottom: 4, border: '1px solid', cursor: 'pointer', background: selectedResource?.id === r.id ? 'rgba(20,184,166,0.1)' : 'transparent', borderColor: selectedResource?.id === r.id ? 'rgba(20,184,166,0.3)' : 'var(--color-border)', transition: 'all var(--transition)' }}>
                  <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{r.name}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)', marginTop: 2 }}>{r.asset_tag} · {r.location ?? '—'}</p>
                </button>
              ))
            }
          </div>

          {/* Calendar */}
          {selectedResource && (
            <div>
              {/* Week nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Button variant="ghost" size="sm" leftIcon={<ChevronLeft size={14} />} onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }}>Prev</Button>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <Button variant="ghost" size="sm" rightIcon={<ChevronRight size={14} />} onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }}>Next</Button>
                <Button variant="ghost" size="sm" onClick={() => setWeekBase(new Date())}>Today</Button>
              </div>

              {conflictError && !modal && (
                <div className="alert alert-danger" style={{ marginBottom: 12 }}>
                  <AlertTriangle size={15} /><span>{conflictError}</span>
                </div>
              )}

              {/* Calendar grid */}
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--color-surface)' }}>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ padding: '8px 6px', fontSize: '0.7rem', color: 'var(--color-text-3)', textAlign: 'center', borderRight: '1px solid var(--color-border)' }}>Time</div>
                  {weekDays.map((day, i) => (
                    <div key={i} style={{ padding: '8px 6px', textAlign: 'center', borderRight: i < 6 ? '1px solid var(--color-border)' : undefined, background: sameDay(day, new Date()) ? 'rgba(20,184,166,0.05)' : undefined }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-3)' }}>{DAYS[day.getDay()]}</p>
                      <p style={{ fontSize: '0.875rem', fontWeight: sameDay(day, new Date()) ? 700 : 400, color: sameDay(day, new Date()) ? 'var(--color-primary-400)' : undefined }}>{day.getDate()}</p>
                    </div>
                  ))}
                </div>

                {/* Time rows — only show business hours 7-20 */}
                <div style={{ maxHeight: 520, overflowY: 'auto', position: 'relative' }}>
                  {HOURS.filter(h => h >= 7 && h <= 20).map(hour => (
                    <div key={hour} style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--color-border)' }}>
                      <div style={{ padding: '0 6px', fontSize: '0.65rem', color: 'var(--color-text-3)', textAlign: 'right', height: 48, display: 'flex', alignItems: 'flex-start', paddingTop: 4, borderRight: '1px solid var(--color-border)' }}>
                        {hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`}
                      </div>
                      {weekDays.map((day, di) => {
                        const cellBookings = bookings.filter(b => {
                          const s = new Date(b.starts_at);
                          return sameDay(s, day) && s.getHours() === hour;
                        });
                        return (
                          <div key={di} onClick={() => handleCellClick(day, hour)}
                            style={{ height: 48, borderRight: di < 6 ? '1px solid var(--color-border)' : undefined, position: 'relative', cursor: 'pointer', transition: 'background var(--transition)' }}
                            className="cal-cell">
                            {cellBookings.map(b => (
                              <div key={b.id} title={`${b.booked_by_name}: ${fmtDateTime(b.starts_at)} – ${fmtDateTime(b.ends_at)}`}
                                style={{ position: 'absolute', left: 2, right: 2, top: 2, bottom: 2, borderRadius: 4, background: b.status === 'ONGOING' ? 'rgba(16,185,129,0.25)' : 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.4)', fontSize: '0.65rem', padding: '2px 4px', overflow: 'hidden', cursor: 'default', zIndex: 1 }}
                                onClick={e => e.stopPropagation()}>
                                {b.booked_by_name}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', marginTop: 8 }}>Click any cell to create a booking for {selectedResource.name}</p>
            </div>
          )}
        </div>
      )}

      {view === 'my' && (
        <Table columns={myBookingCols} data={myBookings} loading={loading} rowKey={b => b.id} emptyMessage="You have no bookings." />
      )}

      {/* Book / Reschedule Modal */}
      <Modal open={modal} onClose={() => { setModal(false); setRescheduleTarget(null); setConflictError(''); }}
        title={rescheduleTarget ? 'Reschedule Booking' : `Book ${selectedResource?.name ?? ''}`}
        footer={<><Button variant="ghost" onClick={() => { setModal(false); setRescheduleTarget(null); }}>Cancel</Button><Button loading={saving} onClick={handleBook as any}>{rescheduleTarget ? 'Reschedule' : 'Confirm Booking'}</Button></>}>
        <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflictError && (
            <div className="alert alert-danger">
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <div>
                <strong>Booking conflict</strong>
                <p style={{ fontSize: '0.8rem', marginTop: 4 }}>{conflictError}</p>
              </div>
            </div>
          )}
          <Input label="Start date & time *" id="booking-start" type="datetime-local" value={form.starts_at} onChange={e => { setForm(f => ({ ...f, starts_at: e.target.value })); setConflictError(''); }} required />
          <Input label="End date & time *" id="booking-end" type="datetime-local" value={form.ends_at} onChange={e => { setForm(f => ({ ...f, ends_at: e.target.value })); setConflictError(''); }} required />
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-3)' }}>Back-to-back bookings are allowed. Overlapping bookings are rejected.</p>
        </form>
      </Modal>

      {/* Cancel confirm */}
      {cancelTarget && (
        <Modal open={true} onClose={() => setCancelTarget(null)} title="Cancel Booking"
          footer={<><Button variant="ghost" onClick={() => setCancelTarget(null)}>Keep Booking</Button><Button variant="danger" onClick={handleCancel}>Cancel Booking</Button></>}>
          <p style={{ color: 'var(--color-text-2)' }}>Cancel booking for <strong>{cancelTarget.asset_name}</strong> from {fmtDateTime(cancelTarget.starts_at)} to {fmtDateTime(cancelTarget.ends_at)}?</p>
        </Modal>
      )}
    </div>
  );
}
