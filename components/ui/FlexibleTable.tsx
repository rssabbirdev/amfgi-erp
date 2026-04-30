'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type FlexibleTableColumn<T> = {
  id: string;
  title: string;
  align?: 'left' | 'right' | 'center';
  defaultVisible?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  menuLabel?: string;
  menuDescription?: string;
  renderCell: (row: T, rowIndex: number) => React.ReactNode;
  renderHeader?: () => React.ReactNode;
};

type TableColumnState = {
  order: string[];
  visible: Record<string, boolean>;
  widths: Record<string, number>;
};

type StoredTableState = TableColumnState & {
  signature?: string;
};

type Props<T> = {
  storageKey: string;
  columns: FlexibleTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, rowIndex: number) => string;
  minTableWidthClassName?: string;
  rowClassName?: (row: T, rowIndex: number) => string;
  title?: string;
  description?: string;
  toolbarContent?: React.ReactNode;
  emptyState?: React.ReactNode;
};

function getColumnSignature<T>(columns: FlexibleTableColumn<T>[]) {
  return columns.map((col) => col.id).join('|');
}

function defaultColumnState<T>(columns: FlexibleTableColumn<T>[]): TableColumnState {
  return {
    order: columns.map((col) => col.id),
    visible: Object.fromEntries(columns.map((col) => [col.id, col.defaultVisible ?? true])),
    widths: Object.fromEntries(columns.map((col) => [col.id, col.defaultWidth ?? 160])),
  };
}

function mergeStoredColumnState<T>(
  columns: FlexibleTableColumn<T>[],
  parsed: Partial<StoredTableState> | null | undefined
): TableColumnState {
  const defaults = defaultColumnState(columns);
  const known = new Set(columns.map((col) => col.id));
  const safeOrder = (parsed?.order ?? defaults.order).filter((id) => known.has(id));
  const missing = defaults.order.filter((id) => !safeOrder.includes(id));

  return {
    order: [...safeOrder, ...missing],
    visible: { ...defaults.visible, ...(parsed?.visible ?? {}) },
    widths: { ...defaults.widths, ...(parsed?.widths ?? {}) },
  };
}

function getCellAlignmentClass(align?: 'left' | 'right' | 'center') {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export default function FlexibleTable<T>({
  storageKey,
  columns,
  rows,
  rowKey,
  minTableWidthClassName = 'min-w-[820px]',
  rowClassName,
  title,
  description,
  toolbarContent,
  emptyState,
}: Props<T>) {
  const [showSettings, setShowSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnState, setColumnState] = useState<TableColumnState>(() => defaultColumnState(columns));
  const [loadedStorageIdentity, setLoadedStorageIdentity] = useState<string | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const columnSignature = useMemo(() => getColumnSignature(columns), [columns]);
  const storageIdentity = useMemo(() => `${storageKey}::${columnSignature}`, [columnSignature, storageKey]);

  useEffect(() => {
    setLoadedStorageIdentity(null);

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setColumnState(defaultColumnState(columns));
        setLoadedStorageIdentity(storageIdentity);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<StoredTableState>;
      setColumnState(mergeStoredColumnState(columns, parsed));
      setLoadedStorageIdentity(storageIdentity);
    } catch {
      setColumnState(defaultColumnState(columns));
      setLoadedStorageIdentity(storageIdentity);
    }
  }, [columns, storageIdentity, storageKey]);

  useEffect(() => {
    if (loadedStorageIdentity !== storageIdentity) {
      return;
    }

    const stored: StoredTableState = {
      ...columnState,
      signature: columnSignature,
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      // Ignore persistence errors
    }
  }, [columnSignature, columnState, loadedStorageIdentity, storageIdentity, storageKey]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        settingsRef.current &&
        !settingsRef.current.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const columnsById = useMemo(() => new Map(columns.map((col) => [col.id, col])), [columns]);

  const orderedColumns = useMemo(
    () => columnState.order.map((id) => columnsById.get(id)).filter(Boolean) as FlexibleTableColumn<T>[],
    [columnState.order, columnsById]
  );

  const visibleColumns = useMemo(
    () => orderedColumns.filter((col) => columnState.visible[col.id] !== false),
    [orderedColumns, columnState.visible]
  );

  const filteredColumns = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return orderedColumns;

    return orderedColumns.filter((col) => {
      const label = (col.menuLabel ?? col.title).toLowerCase();
      const descriptionText = (col.menuDescription ?? '').toLowerCase();
      return label.includes(needle) || descriptionText.includes(needle) || col.id.toLowerCase().includes(needle);
    });
  }, [orderedColumns, searchTerm]);

  const hiddenColumnCount = orderedColumns.length - visibleColumns.length;

  const setColumnVisibility = (columnId: string, next: boolean) => {
    setColumnState((prev) => ({
      ...prev,
      visible: {
        ...prev.visible,
        [columnId]: next,
      },
    }));
  };

  const setColumnWidth = (columnId: string, width: number) => {
    setColumnState((prev) => ({
      ...prev,
      widths: {
        ...prev.widths,
        [columnId]: width,
      },
    }));
  };

  const moveColumn = (columnId: string, delta: -1 | 1) => {
    setColumnState((prev) => {
      const idx = prev.order.indexOf(columnId);
      if (idx < 0) return prev;

      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= prev.order.length) return prev;

      const next = [...prev.order];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return { ...prev, order: next };
    });
  };

  const openSettings = () => {
    setShowSettings((prev) => !prev);
    setSearchTerm('');
  };

  const headerSummary = title ? (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {visibleColumns.length}/{orderedColumns.length} visible
        </span>
        {hiddenColumnCount > 0 ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {hiddenColumnCount} hidden
          </span>
        ) : null}
      </div>
      {description ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
    </div>
  ) : description ? (
    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
  ) : null;

  return (
    <div>
      {(headerSummary || toolbarContent || orderedColumns.length > 0) ? (
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>{headerSummary}</div>

            <div className="flex flex-col gap-2 lg:items-end">
              {toolbarContent ? <div className="flex flex-wrap gap-2">{toolbarContent}</div> : null}

              <div className="relative">
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={openSettings}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Columns
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">
                    {visibleColumns.length}
                  </span>
                </button>

                {showSettings ? (
                  <div
                    ref={settingsRef}
                    className="absolute right-0 z-30 mt-2 w-[360px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Column manager
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Changes are saved automatically for this table.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSettings(false)}
                        className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Find a column..."
                        className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-white dark:placeholder-slate-500"
                      />
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                        {visibleColumns.length} visible
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {hiddenColumnCount} hidden
                      </span>
                    </div>

                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {filteredColumns.length > 0 ? (
                        filteredColumns.map((col) => {
                          const min = col.minWidth ?? 90;
                          const max = col.maxWidth ?? 420;
                          const width = columnState.widths[col.id] ?? col.defaultWidth ?? 160;
                          const label = col.menuLabel ?? col.title;

                          return (
                            <div key={col.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={columnState.visible[col.id] !== false}
                                  onChange={(event) => setColumnVisibility(col.id, event.target.checked)}
                                  className="mt-0.5 h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                                      {col.menuDescription ? (
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{col.menuDescription}</p>
                                      ) : null}
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => moveColumn(col.id, -1)}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                        aria-label={`Move ${label} left`}
                                      >
                                        Left
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveColumn(col.id, 1)}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                        aria-label={`Move ${label} right`}
                                      >
                                        Right
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-3">
                                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      <span>Width</span>
                                      <span>{width}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={min}
                                      max={max}
                                      value={width}
                                      onChange={(event) => setColumnWidth(col.id, Number(event.target.value))}
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          No matching columns.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 p-3 lg:hidden">
        {rows.length > 0 ? (
          rows.map((row, rowIndex) => (
            <div
              key={rowKey(row, rowIndex)}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="space-y-3">
                {visibleColumns.map((col) => (
                  <div key={col.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {col.menuLabel ?? col.title}
                    </p>
                    <div className={`mt-1 ${getCellAlignmentClass(col.align)}`}>{col.renderCell(row, rowIndex)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
            {emptyState ?? 'No rows available.'}
          </div>
        )}
      </div>

      <div className="hidden lg:block">
        <div className="overflow-x-auto">
          <table className={`w-full ${minTableWidthClassName} text-sm`}>
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    style={{ width: `${columnState.widths[col.id] ?? col.defaultWidth ?? 160}px` }}
                    className={[
                      'px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
                      getCellAlignmentClass(col.align),
                    ].join(' ')}
                  >
                    {col.renderHeader ? col.renderHeader() : col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row, rowIndex) => (
                  <tr
                    key={rowKey(row, rowIndex)}
                    className={
                      rowClassName?.(row, rowIndex) ??
                      'border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40'
                    }
                  >
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        style={{ width: `${columnState.widths[col.id] ?? col.defaultWidth ?? 160}px` }}
                        className={['px-2.5 py-1.5 align-top', getCellAlignmentClass(col.align)].join(' ')}
                      >
                        {col.renderCell(row, rowIndex)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={Math.max(visibleColumns.length, 1)}
                    className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    {emptyState ?? 'No rows available.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
