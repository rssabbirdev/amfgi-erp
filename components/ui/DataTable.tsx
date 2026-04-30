'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fuzzyMatch } from '@/lib/utils/fuzzyMatch';
import { TableSkeleton } from './skeleton/TableSkeleton';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  hiddenByDefault?: boolean;
}

type PersistedColumnState = {
  order: string[];
  visible: Record<string, boolean>;
};

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  searchKeys?: (keyof T)[];
  fuzzySearch?: boolean;
  enableSearchOptions?: boolean;
  enableColumnDisplayOptions?: boolean;
  preferenceKey?: string;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  onRowDoubleClick?: (row: T, e: React.MouseEvent) => void;
  onRowClick?: (row: T, e: React.MouseEvent) => void;
  selectedRowId?: string | null;
}

function normalizeSearchValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().toLowerCase();
  }

  return String(value).trim().toLowerCase();
}

function buildDefaultColumnState<T>(columns: Column<T>[]): PersistedColumnState {
  return {
    order: columns.map((column) => column.key),
    visible: Object.fromEntries(
      columns.map((column) => [column.key, column.hiddenByDefault ? false : true])
    ),
  };
}

function mergeColumnState<T>(
  columns: Column<T>[],
  stored: Partial<PersistedColumnState> | null | undefined
): PersistedColumnState {
  const defaults = buildDefaultColumnState(columns);
  const knownKeys = new Set(columns.map((column) => column.key));
  const safeOrder = (stored?.order ?? defaults.order).filter((key) => knownKeys.has(key));
  const missing = defaults.order.filter((key) => !safeOrder.includes(key));

  return {
    order: [...safeOrder, ...missing],
    visible: { ...defaults.visible, ...(stored?.visible ?? {}) },
  };
}

function getLocalPreferenceStorageKey(preferenceKey: string, columnSignature: string) {
  return `datatable:${preferenceKey}:${columnSignature}`;
}

function readLocalPreference(storageKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<PersistedColumnState>;
  } catch {
    return null;
  }
}

function writeLocalPreference(storageKey: string, state: PersistedColumnState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore local persistence failures.
  }
}

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  emptyText = 'No records found.',
  searchKeys = [],
  fuzzySearch = false,
  enableSearchOptions = false,
  enableColumnDisplayOptions = false,
  preferenceKey,
  initialPageSize = 0,
  pageSizeOptions = [25, 50, 100],
  onRowContextMenu,
  onRowDoubleClick,
  onRowClick,
  selectedRowId,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [searchScope, setSearchScope] = useState<string>('all');
  const [searchMode, setSearchMode] = useState<'contains' | 'fuzzy' | 'exact'>(
    fuzzySearch ? 'fuzzy' : 'contains'
  );
  const [columnState, setColumnState] = useState<PersistedColumnState>(() =>
    buildDefaultColumnState(columns)
  );
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadedPreferenceKeyRef = useRef<string | null>(null);
  const columnSignature = useMemo(
    () =>
      columns
        .map((column) => `${column.key}:${column.hiddenByDefault ? 'hidden' : 'visible'}`)
        .join('|'),
    [columns]
  );
  const localPreferenceStorageKey = useMemo(
    () => (preferenceKey ? getLocalPreferenceStorageKey(preferenceKey, columnSignature) : null),
    [columnSignature, preferenceKey]
  );

  const searchOptions = useMemo(
    () =>
      searchKeys.map((key) => {
        const column = columns.find((item) => item.key === String(key));
        return {
          key: String(key),
          label: column?.header ?? String(key),
        };
      }),
    [columns, searchKeys]
  );

  const orderedColumns = useMemo(() => {
    const columnsByKey = new Map(columns.map((column) => [column.key, column]));
    return columnState.order
      .map((key) => columnsByKey.get(key))
      .filter(Boolean) as Column<T>[];
  }, [columnState.order, columns]);

  const activeSearchKeys = useMemo(() => {
    if (searchScope === 'all') {
      return searchKeys;
    }
    return searchKeys.filter((key) => String(key) === searchScope);
  }, [searchKeys, searchScope]);

  const visibleColumns = useMemo(() => {
    const filteredColumns = orderedColumns.filter((column) => columnState.visible[column.key] !== false);
    return filteredColumns.length > 0 ? filteredColumns : orderedColumns.slice(0, 1);
  }, [columnState.visible, orderedColumns]);

  useEffect(() => {
    if (!preferenceKey) {
      setColumnState((current) => mergeColumnState(columns, current));
      setPreferencesLoaded(true);
      loadedPreferenceKeyRef.current = null;
      return;
    }

    setPreferencesLoaded(false);

    const controller = new AbortController();
    const targetPreferenceKey = preferenceKey;

    void (async () => {
      try {
        const response = await fetch(`/api/me/table-preferences/${encodeURIComponent(targetPreferenceKey)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to load table preferences');
        }

        const payload = (await response.json()) as {
          data?: Partial<PersistedColumnState> | null;
        };

        if (controller.signal.aborted) {
          return;
        }

        const nextState = mergeColumnState(columns, payload.data);
        setColumnState(nextState);
        if (localPreferenceStorageKey) {
          writeLocalPreference(localPreferenceStorageKey, nextState);
        }
        loadedPreferenceKeyRef.current = targetPreferenceKey;
        setPreferencesLoaded(true);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        const fallbackState = localPreferenceStorageKey
          ? mergeColumnState(columns, readLocalPreference(localPreferenceStorageKey))
          : buildDefaultColumnState(columns);
        setColumnState(fallbackState);
        loadedPreferenceKeyRef.current = targetPreferenceKey;
        setPreferencesLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [columnSignature, columns, localPreferenceStorageKey, preferenceKey]);

  useEffect(() => {
    if (!preferenceKey || !preferencesLoaded || loadedPreferenceKeyRef.current !== preferenceKey) {
      return;
    }

    setColumnState((current) => mergeColumnState(columns, current));
  }, [columnSignature, columns, preferenceKey, preferencesLoaded]);

  useEffect(() => {
    if (!preferenceKey) {
      return;
    }

    if (!preferencesLoaded || loadedPreferenceKeyRef.current !== preferenceKey) {
      return;
    }

    if (localPreferenceStorageKey) {
      writeLocalPreference(localPreferenceStorageKey, columnState);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/me/table-preferences/${encodeURIComponent(preferenceKey)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(columnState),
        signal: controller.signal,
      })
        .then(() => {
          // Database-backed persistence is best-effort; local storage already has the latest state.
        })
        .catch(() => {
          // Local storage already has the latest state.
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [columnState, localPreferenceStorageKey, preferenceKey, preferencesLoaded]);

  useEffect(() => {
    if (searchMode === 'fuzzy' && !fuzzySearch) {
      setSearchMode('contains');
    }
  }, [fuzzySearch, searchMode]);

  useEffect(() => {
    if (searchScope !== 'all' && !searchOptions.some((option) => option.key === searchScope)) {
      setSearchScope('all');
    }
  }, [searchOptions, searchScope]);

  const filtered = useMemo(() => {
    if (!search || activeSearchKeys.length === 0) return data;

    const q = normalizeSearchValue(search);
    if (!q) return data;

    if (searchMode === 'exact') {
      return data.filter((row) =>
        activeSearchKeys.some((key) => normalizeSearchValue(row[key]) === q)
      );
    }

    if (searchMode === 'fuzzy' && fuzzySearch) {
      return data
        .map((row) => {
          const searchable = activeSearchKeys
            .map((key) => normalizeSearchValue(row[key]))
            .filter(Boolean)
            .join(' ');
          return { row, score: fuzzyMatch(q, searchable) };
        })
        .filter(({ score }) => score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .map(({ row }) => row);
    }

    return data.filter((row) =>
      activeSearchKeys.some((key) => normalizeSearchValue(row[key]).includes(q))
    );
  }, [activeSearchKeys, data, fuzzySearch, search, searchMode]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortDir, sortKey]);

  const totalPages = useMemo(() => {
    if (!pageSize || pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(sorted.length / pageSize));
  }, [pageSize, sorted.length]);

  const paged = useMemo(() => {
    if (!pageSize || pageSize <= 0) return sorted;
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [page, pageSize, sorted]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, search, searchMode, searchScope, sortDir, sortKey]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDir('asc');
  };

  const toggleColumnVisibility = (key: string) => {
    setColumnState((current) => {
      const visibleCount = current.order.filter((columnKey) => current.visible[columnKey] !== false).length;
      const currentlyVisible = current.visible[key] !== false;

      if (currentlyVisible && visibleCount === 1) {
        return current;
      }

      return {
        ...current,
        visible: {
          ...current.visible,
          [key]: !currentlyVisible,
        },
      };
    });
  };

  const moveColumn = (key: string, direction: -1 | 1) => {
    setColumnState((current) => {
      const index = current.order.indexOf(key);
      const targetIndex = index + direction;

      if (index < 0 || targetIndex < 0 || targetIndex >= current.order.length) {
        return current;
      }

      const nextOrder = [...current.order];
      [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
      return {
        ...current,
        order: nextOrder,
      };
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {searchKeys.length > 0 ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            {enableSearchOptions ? (
              <div className="flex flex-wrap gap-2">
                <select
                  value={searchScope}
                  onChange={(e) => setSearchScope(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">All fields</option>
                  {searchOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as 'contains' | 'fuzzy' | 'exact')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="contains">Contains search</option>
                  {fuzzySearch ? <option value="fuzzy">Fuzzy search</option> : null}
                  <option value="exact">Exact match (case-insensitive)</option>
                </select>
              </div>
            ) : null}
          </div>

          {enableColumnDisplayOptions ? (
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white">
                Columns
                <svg
                  className="h-4 w-4 transition-transform group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="absolute right-0 z-10 mt-2 max-h-96 min-w-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="px-2 pb-2">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Visible columns
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Saved to your account for this company.
                  </p>
                </div>
                <div className="space-y-1">
                  {orderedColumns.map((column, index) => {
                    const checked = columnState.visible[column.key] !== false;
                    const visibleCount = orderedColumns.filter(
                      (item) => columnState.visible[item.key] !== false
                    ).length;
                    const disableToggle = checked && visibleCount === 1;

                    return (
                      <div
                        key={column.key}
                        className="rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disableToggle}
                              onChange={() => toggleColumnVisibility(column.key)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600"
                            />
                            <span className="min-w-0">
                              <span className="block">{column.header}</span>
                              <span className="block text-xs text-slate-400 dark:text-slate-500">{column.key}</span>
                            </span>
                          </label>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveColumn(column.key, -1)}
                              disabled={index === 0}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                            >
                              Left
                            </button>
                            <button
                              type="button"
                              onClick={() => moveColumn(column.key, 1)}
                              disabled={index === orderedColumns.length - 1}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                            >
                              Right
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
        <table className="w-full text-sm text-slate-700 dark:text-slate-300">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-800/80">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400 ${
                    col.sortable
                      ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-white'
                      : ''
                  } ${col.className ?? ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key ? (
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
                        />
                      </svg>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rows={5} columns={visibleColumns.length} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="py-12 text-center text-slate-500 dark:text-slate-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              paged.map((row) => {
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
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 ? (
        <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {pageSize > 0 ? (
              <>
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span>
              {pageSize > 0
                ? `${Math.min((page - 1) * pageSize + 1, sorted.length)}-${Math.min(page * pageSize, sorted.length)} of ${sorted.length}`
                : `${sorted.length} of ${data.length} records`}
            </span>
            {pageSize > 0 && totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="rounded border border-slate-200 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
                >
                  Prev
                </button>
                <span>
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="rounded border border-slate-200 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
