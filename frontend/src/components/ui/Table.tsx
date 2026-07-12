'use client';
import React, { useState, ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (p: number) => void;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  rowKey?: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  rowClassName?: (row: T) => string;
}

export function Table<T>({
  columns, data, loading, page = 1, totalPages = 1, total = 0, limit = 20,
  onPageChange, onSort, rowKey, onRowClick, emptyMessage = 'No records found.', rowClassName,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function handleSort(key: string) {
    const dir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
    setSortKey(key); setSortDir(dir);
    onSort?.(key, dir);
  }

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', background: 'var(--color-surface)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="af-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={col.sortable ? 'sortable' : ''}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.header}
                    {col.sortable && (
                      <span style={{ opacity: sortKey === col.key ? 1 : 0.3 }}>
                        {sortKey === col.key && sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key}><div className="skeleton" style={{ height: 16, borderRadius: 4 }} /></td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-3)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : data.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row) : i}
                className={rowClassName?.(row) ?? ''}
                onClick={() => onRowClick?.(row)}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPageChange && totalPages > 1 && (
        <div className="pagination">
          <span>{total > 0 ? `Showing ${start}–${end} of ${total}` : 'No results'}</span>
          <div className="pagination-buttons">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              ← Prev
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return p <= totalPages ? (
                <Button key={p} variant={p === page ? 'secondary' : 'ghost'} size="sm" onClick={() => onPageChange(p)}>
                  {p}
                </Button>
              ) : null;
            })}
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
