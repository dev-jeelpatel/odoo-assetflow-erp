'use client';
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { Building2, Tag, Users, Plus, Edit2, Check, X, ChevronRight, Trash2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { StatusPill, RoleBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton, EmptyState } from '@/components/ui/EmptyState';
import { prettyStatus, fmtDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Dept { id: number; name: string; head_user_id: number | null; head_name?: string; parent_department_id: number | null; parent_name?: string; status: 'ACTIVE' | 'INACTIVE'; }
interface Category { id: number; name: string; description: string; custom_fields: any[]; status: string; }
interface User { id: number; name: string; email: string; role: string; department_id: number | null; dept_name?: string; status: string; }
interface CustomField { key: string; label: string; type: 'text' | 'number' | 'date'; }

// ── Department Tab ─────────────────────────────────────────────────────────────
function DepartmentsTab() {
  const { toast } = useToast();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [form, setForm] = useState({ name: '', head_user_id: '', parent_department_id: '', status: 'ACTIVE' });
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, ur] = await Promise.all([api.get<Dept[]>('/departments?limit=100'), api.get<User[]>('/users?limit=200')]);
      setDepts(dr.data ?? []);
      setUsers(ur.data ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ name: '', head_user_id: '', parent_department_id: '', status: 'ACTIVE' }); setErrors({}); setModal(true); };
  const openEdit = (d: Dept) => { setEditing(d); setForm({ name: d.name, head_user_id: String(d.head_user_id ?? ''), parent_department_id: String(d.parent_department_id ?? ''), status: d.status }); setErrors({}); setModal(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Name is required.' }); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), head_user_id: form.head_user_id ? Number(form.head_user_id) : null, parent_department_id: form.parent_department_id ? Number(form.parent_department_id) : null, status: form.status };
      if (editing) await api.patch(`/departments/${editing.id}`, payload);
      else await api.post('/departments', payload);
      toast(editing ? 'Department updated.' : 'Department created.', 'success');
      setModal(false); load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save.', 'error');
    } finally { setSaving(false); }
  };

  const cols: Column<Dept>[] = [
    { key: 'name', header: 'Department', render: d => <span style={{ fontWeight: 500 }}>{d.name}</span> },
    { key: 'parent_name', header: 'Parent', render: d => d.parent_name ? <span className="muted">{d.parent_name}</span> : <span style={{ color: 'var(--color-text-3)' }}>—</span> },
    { key: 'head_name', header: 'Head', render: d => d.head_name ? d.head_name : <span style={{ color: 'var(--color-text-3)' }}>Unassigned</span> },
    { key: 'status', header: 'Status', render: d => <StatusPill status={d.status} /> },
    { key: 'actions', header: '', width: '60px', render: d => (
      <button className="btn btn-ghost btn-icon btn-sm" onClick={e => { e.stopPropagation(); openEdit(d); }}><Edit2 size={13} /></button>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button leftIcon={<Plus size={15} />} onClick={openCreate}>New Department</Button>
      </div>
      <Table columns={cols} data={depts} loading={loading} rowKey={d => d.id} onRowClick={openEdit} emptyMessage="No departments yet." />
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Department' : 'New Department'}
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button loading={saving} onClick={save as any}>Save</Button></>}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Department name" id="dept-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} required />
          <Select label="Parent department (optional)" id="dept-parent" value={form.parent_department_id} onChange={e => setForm(f => ({ ...f, parent_department_id: e.target.value }))} placeholder="None (top-level)">
            {depts.filter(d => !editing || d.id !== editing.id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Department head (optional)" id="dept-head" value={form.head_user_id} onChange={e => setForm(f => ({ ...f, head_user_id: e.target.value }))} placeholder="Unassigned">
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {editing && <Select label="Status" id="dept-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </Select>}
        </form>
      </Modal>
    </div>
  );
}

// ── Categories Tab ─────────────────────────────────────────────────────────────
function CategoriesTab() {
  const { toast } = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [fields, setFields] = useState<CustomField[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get<Category[]>('/categories?limit=100'); setCats(r.data ?? []); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '' }); setFields([]); setModal(true); };
  const openEdit = (c: Category) => { setEditing(c); setForm({ name: c.name, description: c.description }); setFields(c.custom_fields ?? []); setModal(true); };

  const addField = () => setFields(f => [...f, { key: `field_${Date.now()}`, label: '', type: 'text' }]);
  const removeField = (i: number) => setFields(f => f.filter((_, idx) => idx !== i));
  const updateField = (i: number, patch: Partial<CustomField>) => setFields(f => f.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), description: form.description, custom_fields: fields };
      if (editing) await api.patch(`/categories/${editing.id}`, payload);
      else await api.post('/categories', payload);
      toast(editing ? 'Category updated.' : 'Category created.', 'success');
      setModal(false); load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to save.', 'error'); } finally { setSaving(false); }
  };

  const cols: Column<Category>[] = [
    { key: 'name', header: 'Category', render: c => <span style={{ fontWeight: 500 }}>{c.name}</span> },
    { key: 'description', header: 'Description', render: c => <span className="muted truncate" style={{ maxWidth: 300, display: 'block' }}>{c.description || '—'}</span> },
    { key: 'custom_fields', header: 'Custom Fields', render: c => <span>{c.custom_fields?.length ?? 0} field{c.custom_fields?.length !== 1 ? 's' : ''}</span> },
    { key: 'status', header: 'Status', render: c => <StatusPill status={c.status} /> },
    { key: 'actions', header: '', width: '60px', render: c => <button className="btn btn-ghost btn-icon btn-sm" onClick={e => { e.stopPropagation(); openEdit(c); }}><Edit2 size={13} /></button> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button leftIcon={<Plus size={15} />} onClick={openCreate}>New Category</Button>
      </div>
      <Table columns={cols} data={cats} loading={loading} rowKey={c => c.id} onRowClick={openEdit} emptyMessage="No categories yet." />
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Category' : 'New Category'} size="lg"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button loading={saving} onClick={save as any}>Save</Button></>}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Category name" id="cat-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <Input label="Description (optional)" id="cat-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="form-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p className="form-section-title" style={{ margin: 0 }}>Custom Fields</p>
              <Button variant="ghost" size="sm" leftIcon={<Plus size={13} />} onClick={addField} type="button">Add Field</Button>
            </div>
            {fields.length === 0 && <p style={{ color: 'var(--color-text-3)', fontSize: '0.8rem' }}>No custom fields. Click "Add Field" to define category-specific attributes like warranty period.</p>}
            {fields.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}>
                <Input label={i === 0 ? "Field label" : undefined} placeholder="e.g. Warranty (months)" value={f.label}
                  onChange={e => { updateField(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }); }} />
                <Select label={i === 0 ? "Type" : undefined} value={f.type} onChange={e => updateField(i, { type: e.target.value as any })}>
                  <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
                </Select>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeField(i)} style={{ marginBottom: 0 }}><X size={14} /></button>
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Users Tab ──────────────────────────────────────────────────────────────────
const ROLES = ['ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD', 'EMPLOYEE'];

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [roleTarget, setRoleTarget] = useState<{ user: User; role: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<User[]>('/users', { page, limit: 20, search: search || undefined });
      setUsers(r.data ?? []); setTotal(r.meta?.total ?? 0);
    } finally { setLoading(false); }
  }, [page, search]);
  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    setSaving(true);
    try {
      await api.patch(`/users/${roleTarget.user.id}/role`, { role: roleTarget.role });
      toast(`${roleTarget.user.name} is now ${prettyStatus(roleTarget.role)}.`, 'success');
      setRoleTarget(null); load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Failed to update role.', 'error'); } finally { setSaving(false); }
  };

  const cols: Column<User>[] = [
    { key: 'name', header: 'Employee', render: u => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,var(--color-primary-700),var(--color-primary-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {u.name.charAt(0).toUpperCase()}
        </div>
        <div><p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{u.name}</p><p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)' }}>{u.email}</p></div>
      </div>
    )},
    { key: 'role', header: 'Role', render: u => <RoleBadge role={u.role} /> },
    { key: 'dept_name', header: 'Department', render: u => u.dept_name ?? <span style={{ color: 'var(--color-text-3)' }}>—</span> },
    { key: 'status', header: 'Status', render: u => <StatusPill status={u.status} /> },
    { key: 'actions', header: 'Change Role', width: '160px', render: u => currentUser?.role === 'ADMIN' ? (
      <select
        className="input" style={{ padding: '5px 8px', fontSize: '0.8rem', width: 'auto' }}
        value={u.role}
        onChange={e => { if (e.target.value !== u.role) setRoleTarget({ user: u, role: e.target.value }); }}
        onClick={e => e.stopPropagation()}
      >
        {ROLES.map(r => <option key={r} value={r}>{prettyStatus(r)}</option>)}
      </select>
    ) : <RoleBadge role={u.role} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Input placeholder="Search by name or email…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} id="user-search" />
      </div>
      <Table columns={cols} data={users} loading={loading} rowKey={u => u.id} page={page} total={total} limit={20}
        totalPages={Math.ceil(total / 20)} onPageChange={setPage} emptyMessage="No employees found." />
      <ConfirmDialog
        open={!!roleTarget}
        onClose={() => setRoleTarget(null)}
        onConfirm={handleRoleChange}
        title="Change role"
        message={roleTarget ? <>Change <strong>{roleTarget.user.name}</strong>'s role to <strong>{prettyStatus(roleTarget.role)}</strong>? This immediately changes their access level.</> : ''}
        confirmLabel="Change Role"
        loading={saving}
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'departments', label: 'Departments', icon: <Building2 size={15} /> },
  { id: 'categories', label: 'Asset Categories', icon: <Tag size={15} /> },
  { id: 'employees', label: 'Employee Directory', icon: <Users size={15} /> },
];

export default function OrganizationPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('departments');
  if (user?.role !== 'ADMIN') return (
    <div className="empty-state">
      <div className="empty-icon"><Building2 size={28} /></div>
      <p className="empty-title">Admin Only</p>
      <p className="empty-desc">Organization setup is restricted to Admins.</p>
    </div>
  );
  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Organization Setup</h1><p className="page-subtitle">Manage departments, categories, and employee roles</p></div>
      </div>
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} id={`org-tab-${t.id}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t.icon}{t.label}</span>
          </button>
        ))}
      </div>
      {tab === 'departments' && <DepartmentsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'employees' && <UsersTab />}
    </div>
  );
}
