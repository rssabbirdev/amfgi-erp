'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { TableSkeleton } from './skeleton/TableSkeleton';

export interface Column<T> {
  key:        string;
  header:     string;
  render?:    (row: T) => ReactNode;
  sortable?:  boolean;
  className?: string;
}

interface DataTableProps<T extends { id: string }> {
  columns:            Column<T>[];
  data:               T[];
  loading?:           boolean;
  emptyText?:         string;
  searchKeys?:        (keyof T)[];
  onRowContextMenu?:  (row: T, e: React.MouseEvent) => void;
  onRowDoubleClick?:  (row: T, e: React.MouseEvent) => void;
  onRowClick?:        (row: T, e: React.MouseEvent) => void;
  selectedRowId?:     string | null;
}

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  emptyText = 'No records found.',
  searchKeys = [],
  onRowContextMenu,
  onRowDoubleClick,
  onRowClick,
  selectedRowId,
}: DataTableProps<T>) {
  const [search,    setSearch]    = useState('');
  const [sortKey,   setSortKey]   = useState<string | null>(null);
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {searchKeys.length > 0 && (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
        <table className="w-full text-sm text-slate-700 dark:text-slate-300">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-800/80">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 ${col.sortable ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-white' : ''} ${col.className ?? ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} columns={columns.length} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-500 dark:text-slate-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const isSelected = selectedRowId === row.id;
                const rowInteractive = !!(onRowContextMenu || onRowDoubleClick || onRowClick);
                return (
                <tr
                  key={row.id}
                  className={`border-b transition-colors ${
                    isSelected
                      ? 'border-emerald-400/50 bg-emerald-50 hover:bg-emerald-100/70 dark:border-emerald-500/40 dark:bg-emerald-600/15 dark:hover:bg-emerald-600/20'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-800/40'
                  } ${rowInteractive ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? (e) => onRowClick(row, e) : undefined}
                  onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(row, e) : undefined}
                  onDoubleClick={onRowDoubleClick ? (e) => onRowDoubleClick(row, e) : undefined}
                  data-context-menu={onRowContextMenu ? 'true' : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
        <p className="text-right text-xs text-slate-500 dark:text-slate-500">
          {sorted.length} of {data.length} records
        </p>
      )}
    </div>
  );
}
