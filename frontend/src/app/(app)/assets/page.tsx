'use client';
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Package, SlidersHorizontal, X, Upload, Download } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, Column } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtDate, fmtCurrency } from '@/lib/utils';
import { parseCsv } from '@/lib/csv';

interface Asset {
  id: number; asset_tag: string; name: string; category_name: string;
  serial_number: string; status: string; cond: string; location: string;
  department_name: string; holder_name: string; acquisition_date: string;
  acquisition_cost: number; is_bookable: boolean;
}
interface Category { id: number; name: string; custom_fields: any[]; }
interface Dept { id: number; name: string; }

const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR'];
const STATUSES = ['AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED'];

const CSV_COLUMNS = ['name', 'category_name', 'serial_number', 'acquisition_date', 'acquisition_cost', 'cond', 'location', 'department_name', 'is_bookable'];

interface CsvRow {
  name: string; category_name: string; serial_number: string | null; acquisition_date: string | null;
  acquisition_cost: number | null; cond: string; location: string | null; department_name: string | null; is_bookable: boolean;
}
interface ImportRowResult { row: number; success: boolean; id?: number; asset_tag?: string; error?: string; }

function truthy(v: string): boolean {
  return ['true', '1', 'yes', 'y'].includes(v.trim().toLowerCase());
}

function csvRowsFromText(text: string): { rows: CsvRow[]; warnings: string[] } {
  const table = parseCsv(text);
  const warnings: string[] = [];
  if (!table.length) return { rows: [], warnings: ['File is empty.'] };
  const header = table[0].map(h => h.trim().toLowerCase());
  const rows: CsvRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const get = (col: string) => { const idx = header.indexOf(col); return idx === -1 ? '' : (cells[idx] ?? '').trim(); };
    const name = get('name');
    const category_name = get('category_name');
    if (!name || !category_name) warnings.push(`Row ${i}: missing name or category_name.`);
    const costRaw = get('acquisition_cost');
    if (costRaw && Number.isNaN(Number(costRaw))) warnings.push(`Row ${i}: acquisition_cost '${costRaw}' is not a number.`);
    const dateRaw = get('acquisition_date');
    if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) warnings.push(`Row ${i}: acquisition_date '${dateRaw}' should be YYYY-MM-DD.`);
    rows.push({
      name, category_name,
      serial_number: get('serial_number') || null,
      acquisition_date: dateRaw || null,
      acquisition_cost: costRaw ? Number(costRaw) : null,
      cond: (get('cond') || 'GOOD').toUpperCase(),
      location: get('location') || null,
      department_name: get('department_name') || null,
      is_bookable: truthy(get('is_bookable')),
    });
  }
  return { rows, warnings };
}

export default function AssetsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const canManage = user?.role === 'ADMIN' || user?.role === 'ASSET_MANAGER';

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState<Category[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [registerModal, setRegisterModal] = useState(false);
  const [previewTag, setPreviewTag] = useState('AF-????');
  const [saving, setSaving] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(null);
  const [form, setForm] = useState({
    name: '', category_id: '', serial_number: '', acquisition_date: '',
    acquisition_cost: '', cond: 'GOOD', location: '', department_id: '', is_bookable: false,
    useful_life_years: '',
  });
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [selectedCatFields, setSelectedCatFields] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<Asset[]>('/assets', {
        page, limit: 20, search: search || undefined,
        status: filterStatus || undefined, category_id: filterCat ? Number(filterCat) : undefined,
        department_id: filterDept ? Number(filterDept) : undefined,
      });
      setAssets(r.data ?? []); setTotal(r.meta?.total ?? 0);
    } finally { setLoading(false); }
  }, [page, search, filterStatus, filterCat, filterDept]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([
      api.get<Category[]>('/categories?limit=100'),
      api.get<Dept[]>('/departments?limit=100'),
    ]).then(([cr, dr]) => { setCats(cr.data ?? []); setDepts(dr.data ?? []); });
  }, []);

  // Preview next tag
  useEffect(() => {
    if (registerModal) {
      api.get<any>('/assets?limit=1').then(r => {
        const tag = r.meta?.total ?? 0;
        setPreviewTag(`AF-${String(tag + 1).padStart(4, '0')} (approx.)`);
      }).catch(() => {});
    }
  }, [registerModal]);

  const handleCatChange = (catId: string) => {
    setForm(f => ({ ...f, category_id: catId }));
    const cat = cats.find(c => c.id === Number(catId));
    setSelectedCatFields(cat?.custom_fields ?? []);
    setCustomFields({});
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.category_id) { toast('Name and category are required.', 'warning'); return; }
    setSaving(true);
    try {
      const r = await api.post<{ id: number; asset_tag: string }>('/assets', {
        name: form.name.trim(), category_id: Number(form.category_id),
        serial_number: form.serial_number || null, acquisition_date: form.acquisition_date || null,
        acquisition_cost: form.acquisition_cost ? Number(form.acquisition_cost) : null,
        cond: form.cond, location: form.location || null,
        department_id: form.department_id ? Number(form.department_id) : null,
        is_bookable: form.is_bookable,
        custom_field_values: Object.keys(customFields).length ? customFields : null,
        useful_life_years: form.useful_life_years ? Number(form.useful_life_years) : null,
      });
      toast(`Asset ${r.data.asset_tag} registered successfully.`, 'success');
      setRegisterModal(false);
      setForm({ name: '', category_id: '', serial_number: '', acquisition_date: '', acquisition_cost: '', cond: 'GOOD', location: '', department_id: '', is_bookable: false, useful_life_years: '' });
      load();
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Registration failed.', 'error'); } finally { setSaving(false); }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportResults(null);
    setCsvFileName(file.name);
    const text = await file.text();
    const { rows, warnings } = csvRowsFromText(text);
    setCsvRows(rows);
    setCsvWarnings(warnings);
  };

  const handleImport = async () => {
    if (!csvRows.length) return;
    setImporting(true);
    try {
      const r = await api.post<{ total: number; imported: number; failed: number; results: ImportRowResult[] }>('/assets/bulk-import', { rows: csvRows });
      setImportResults(r.data.results);
      if (r.data.imported > 0) { toast(`${r.data.imported} of ${r.data.total} asset(s) imported.`, r.data.failed ? 'warning' : 'success'); load(); }
      else toast('No rows were imported — see errors below.', 'error');
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Import failed.', 'error'); } finally { setImporting(false); }
  };

  const closeImportModal = () => {
    setImportModal(false);
    setCsvRows([]); setCsvWarnings([]); setCsvFileName(''); setImportResults(null);
  };

  const downloadSampleCsv = () => {
    const sample = [
      CSV_COLUMNS.join(','),
      'Dell XPS 15 Laptop,Laptops,SN-12345,2025-01-15,120000,GOOD,Floor 3 Room 301,Engineering,false',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'assetflow-import-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const cols: Column<Asset>[] = [
    { key: 'asset_tag', header: 'Tag', render: a => <span className="tag-label">{a.asset_tag}</span> },
    { key: 'name', header: 'Asset Name', sortable: true, render: a => <span style={{ fontWeight: 500 }}>{a.name}</span> },
    { key: 'category_name', header: 'Category' },
    { key: 'status', header: 'Status', render: a => <StatusPill status={a.status} /> },
    { key: 'cond', header: 'Condition', render: a => <span className="muted">{a.cond}</span> },
    { key: 'location', header: 'Location', render: a => a.location ?? <span style={{ color: 'var(--color-text-3)' }}>—</span> },
    { key: 'holder_name', header: 'Holder', render: a => a.holder_name ?? <span style={{ color: 'var(--color-text-3)' }}>—</span> },
  ];

  const hasFilters = filterStatus || filterCat || filterDept;

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Asset Directory</h1><p className="page-subtitle">{total} assets registered</p></div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" leftIcon={<Upload size={15} />} onClick={() => setImportModal(true)} id="import-csv-btn">
              Import CSV
            </Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => setRegisterModal(true)} id="register-asset-btn">
              Register Asset
            </Button>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input placeholder="Search by tag, name, or serial number…" id="asset-search"
            leftIcon={<Search size={14} />} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} placeholder="All statuses" style={{ width: 160 }}>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <Select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }} placeholder="All categories" style={{ width: 160 }}>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1); }} placeholder="All depts" style={{ width: 160 }}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" leftIcon={<X size={13} />} onClick={() => { setFilterStatus(''); setFilterCat(''); setFilterDept(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      <Table
        columns={cols} data={assets} loading={loading} rowKey={a => a.id}
        page={page} total={total} limit={20} totalPages={Math.ceil(total / 20)}
        onPageChange={setPage} onRowClick={a => router.push(`/assets/${a.id}`)}
        emptyMessage="No assets found. Register your first asset to get started."
      />

      {/* Register Modal */}
      <Modal open={registerModal} onClose={() => setRegisterModal(false)} title="Register New Asset" size="lg"
        footer={<><Button variant="ghost" onClick={() => setRegisterModal(false)}>Cancel</Button><Button loading={saving} onClick={handleRegister as any}>Register Asset</Button></>}>
        <form onSubmit={handleRegister}>
          <div className="form-grid" style={{ gap: 14 }}>
            <div className="col-span-2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.15)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-3)' }}>Auto-generated tag:</span>
                <span className="tag-label">{previewTag}</span>
              </div>
            </div>
            <Input label="Asset name *" id="asset-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dell XPS 15 Laptop" required />
            <Select label="Category *" id="asset-cat" value={form.category_id} onChange={e => handleCatChange(e.target.value)} placeholder="Select category" required>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Serial number" id="asset-serial" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="Optional" />
            <Select label="Condition" id="asset-cond" value={form.cond} onChange={e => setForm(f => ({ ...f, cond: e.target.value }))}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Location" id="asset-location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Floor 3, Room 301" />
            <Select label="Department" id="asset-dept" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} placeholder="Unassigned">
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Input label="Acquisition date" id="asset-acqdate" type="date" value={form.acquisition_date} onChange={e => setForm(f => ({ ...f, acquisition_date: e.target.value }))} />
            <Input label="Acquisition cost (₹)" id="asset-cost" type="number" min="0" value={form.acquisition_cost} onChange={e => setForm(f => ({ ...f, acquisition_cost: e.target.value }))} placeholder="Optional, reporting only" />
            <Input label="Useful life (years)" id="asset-useful-life" type="number" min="1" max="50" value={form.useful_life_years} onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))} placeholder="Optional, for depreciation" />
            <div className="col-span-2" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="asset-bookable" checked={form.is_bookable} onChange={e => setForm(f => ({ ...f, is_bookable: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--color-primary-500)' }} />
              <label htmlFor="asset-bookable" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>This asset is bookable as a shared resource (meeting room, projector, vehicle, etc.)</label>
            </div>
            {selectedCatFields.length > 0 && (
              <div className="col-span-2 form-section">
                <p className="form-section-title">Category-specific Fields</p>
                <div className="form-grid" style={{ gap: 12 }}>
                  {selectedCatFields.map(f => (
                    <Input key={f.key} label={f.label} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      value={customFields[f.key] ?? ''}
                      onChange={e => setCustomFields(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Import CSV Modal */}
      <Modal open={importModal} onClose={closeImportModal} title="Import Assets from CSV" size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={closeImportModal}>Close</Button>
            {csvRows.length > 0 && !importResults && (
              <Button loading={importing} onClick={handleImport}>Import {csvRows.length} Row{csvRows.length !== 1 ? 's' : ''}</Button>
            )}
          </>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={14} />
              <span>{csvFileName || 'Choose CSV file'}</span>
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCsvFile} />
            </label>
            <Button variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={downloadSampleCsv}>
              Download sample CSV
            </Button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-3)' }}>
            Required columns: <code>name</code>, <code>category_name</code>. Optional: <code>serial_number</code>, <code>acquisition_date</code> (YYYY-MM-DD), <code>acquisition_cost</code>, <code>cond</code>, <code>location</code>, <code>department_name</code>, <code>is_bookable</code>. Category and department names must match existing ones.
          </p>

          {csvWarnings.length > 0 && !importResults && (
            <div className="alert alert-warning">
              <span>{csvWarnings.length} row(s) may need attention: {csvWarnings.slice(0, 5).join(' ')}{csvWarnings.length > 5 ? ' …' : ''}</span>
            </div>
          )}

          {!importResults && csvRows.length > 0 && (
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table className="af-table">
                <thead><tr><th>#</th><th>Name</th><th>Category</th><th>Serial</th><th>Cost</th><th>Department</th></tr></thead>
                <tbody>
                  {csvRows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td>{i + 2}</td>
                      <td style={{ fontWeight: 500 }}>{r.name || <span style={{ color: 'var(--color-danger)' }}>missing</span>}</td>
                      <td>{r.category_name || <span style={{ color: 'var(--color-danger)' }}>missing</span>}</td>
                      <td>{r.serial_number ?? '—'}</td>
                      <td>{r.acquisition_cost ?? '—'}</td>
                      <td>{r.department_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 20 && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-3)', padding: '8px 12px' }}>+{csvRows.length - 20} more row(s) not shown, will still be imported.</p>}
            </div>
          )}

          {importResults && (
            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table className="af-table">
                <thead><tr><th>Row</th><th>Result</th></tr></thead>
                <tbody>
                  {importResults.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>
                        {r.success
                          ? <span style={{ color: 'var(--color-success)' }}>✓ {r.asset_tag}</span>
                          : <span style={{ color: 'var(--color-danger)' }}>✗ {r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
