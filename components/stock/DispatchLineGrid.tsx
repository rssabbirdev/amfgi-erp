'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { useSession } from 'next-auth/react';
import SearchSelect from '@/components/ui/SearchSelect';
import LineGridColumnSettings, { type LineGridColumnConfig } from '@/components/stock/LineGridColumnSettings';
import { mergeLineGridInputProps, useLineGridKeyboardNav } from '@/lib/stock/lineGridKeyboardNav';
import { cn } from '@/lib/utils';
import type { Material } from '@/store/hooks';

interface WarehouseOption {
  id: string;
  name: string;
}

interface DispatchLineGridRow {
  id: string;
  materialId: string;
  dispatchQty: string;
  returnQty: string;
  quantityUomId: string;
  warehouseId: string;
}

export type DispatchLineGridPersistScope = 'dispatch-entry' | 'delivery-note' | 'warehouse-transfer';

const PREFERENCE_KEY_BY_SCOPE: Record<DispatchLineGridPersistScope, string> = {
  'dispatch-entry': 'stock-dispatch-entry-line-grid',
  'delivery-note': 'stock-dispatch-delivery-note-line-grid',
  'warehouse-transfer': 'stock-warehouse-transfer-line-grid',
};

interface DispatchLineGridProps {
  lines: DispatchLineGridRow[];
  materials: Material[];
  warehouses: WarehouseOption[];
  selectedJob: string;
  showWarehouseColumn?: boolean;
  emptyMessage: string;
  onUpdateLine: (id: string, field: keyof DispatchLineGridRow, value: string) => void;
  /**
   * Which screen this grid is on — each scope has its own column layout in `UserTablePreference`
   * and in `localStorage` (per active company).
   */
  persistScope: DispatchLineGridPersistScope;
  /** Material IDs from the budget warning API; matching rows use a warning-tinted background. */
  budgetWarningMaterialIds?: readonly string[];
  /** When set, row inputs use this instead of `Boolean(selectedJob)`. */
  gridEnabled?: boolean;
  /** Warehouse transfer worksheet: hide return/warehouse columns; relabel dispatch qty. */
  variant?: 'dispatch' | 'warehouse-transfer';
}

type DispatchGridColumnKey =
  | 'line'
  | 'material'
  | 'uom'
  | 'warehouseStock'
  | 'globalStock'
  | 'dispatchQty'
  | 'returnQty'
  | 'warehouse';

const DISPATCH_NAVIGABLE_COLUMN_KEYS: DispatchGridColumnKey[] = [
  'material',
  'uom',
  'dispatchQty',
  'returnQty',
  'warehouse',
];

const DEFAULT_GRID_COLUMNS: LineGridColumnConfig[] = [
  { key: 'line', label: '#', visible: true, width: 48, minWidth: 40, maxWidth: 72 },
  { key: 'material', label: 'Material', visible: true, width: 280, minWidth: 180, maxWidth: 420 },
  { key: 'uom', label: 'UOM', visible: true, width: 140, minWidth: 110, maxWidth: 220 },
  { key: 'warehouseStock', label: 'Warehouse Stock', visible: true, width: 150, minWidth: 120, maxWidth: 220 },
  { key: 'globalStock', label: 'Global Stock', visible: true, width: 150, minWidth: 120, maxWidth: 220 },
  { key: 'dispatchQty', label: 'Dispatch Qty', visible: true, width: 132, minWidth: 110, maxWidth: 220 },
  { key: 'returnQty', label: 'Return Qty', visible: true, width: 132, minWidth: 110, maxWidth: 220 },
  { key: 'warehouse', label: 'Warehouse', visible: true, width: 220, minWidth: 180, maxWidth: 320 },
];

function getSelectedUom(material: Material | undefined, quantityUomId: string) {
  if (!material) return null;
  if (!quantityUomId.trim()) {
    return {
      id: '',
      unitName: material.unit,
      factorToBase: 1,
    };
  }
  const selected = material.materialUoms?.find((uom) => uom.id === quantityUomId);
  return selected
    ? {
        id: selected.id,
        unitName: selected.unitName,
        factorToBase: selected.factorToBase,
      }
    : {
        id: '',
        unitName: material.unit,
        factorToBase: 1,
      };
}

function getWarehouseBaseStock(material: Material | undefined, warehouseId: string) {
  if (!material || !warehouseId) return 0;
  return material.materialWarehouseStocks?.find((stock) => stock.warehouseId === warehouseId)?.currentStock ?? 0;
}

function formatWarehouseStock(material: Material | undefined, warehouseId: string, quantityUomId: string) {
  const selectedUom = getSelectedUom(material, quantityUomId);
  const baseStock = getWarehouseBaseStock(material, warehouseId);
  if (!selectedUom) {
    return { quantity: 0, unitName: '' };
  }
  return {
    quantity: baseStock / selectedUom.factorToBase,
    unitName: selectedUom.unitName,
  };
}

function formatGlobalStock(material: Material | undefined, quantityUomId: string) {
  const selectedUom = getSelectedUom(material, quantityUomId);
  const globalStock = material?.currentStock ?? 0;
  if (!selectedUom) {
    return { quantity: 0, unitName: '' };
  }
  return {
    quantity: globalStock / selectedUom.factorToBase,
    unitName: selectedUom.unitName,
  };
}

function getMaterialUomOptions(material: Material | undefined) {
  if (!material) return [];
  const extraUoms = (material.materialUoms ?? []).filter((uom) => !uom.isBase);
  return [
    {
      value: '',
      label: `${material.unit} (base)`,
    },
    ...extraUoms.map((uom) => ({
      value: uom.id,
      label: `${uom.unitName} (=${uom.factorToBase} ${material.unit})`,
    })),
  ];
}

function showBaseStockLine(quantityUomId: string) {
  return quantityUomId.trim().length > 0;
}

type LineGridPreferencePayload = {
  order: string[];
  visible: Record<string, boolean>;
  widths?: Record<string, number>;
};

function mergeStoredGridColumns(
  defaults: LineGridColumnConfig[],
  stored: Partial<LineGridPreferencePayload> | null | undefined
): LineGridColumnConfig[] {
  const defaultByKey = new Map(defaults.map((c) => [c.key, c]));
  const known = new Set(defaults.map((c) => c.key));
  const rawOrder = stored?.order?.length ? stored.order : defaults.map((c) => c.key);
  const order = rawOrder.filter((k) => known.has(k));
  for (const k of defaults.map((c) => c.key)) {
    if (!order.includes(k)) order.push(k);
  }
  return order.map((key) => {
    const base = defaultByKey.get(key)!;
    const v = stored?.visible?.[key];
    const w = stored?.widths?.[key];
    const width =
      typeof w === 'number' && Number.isFinite(w)
        ? Math.round(Math.max(base.minWidth ?? 64, Math.min(base.maxWidth ?? 420, w)))
        : base.width;
    const visible = typeof v === 'boolean' ? v : base.visible;
    return { ...base, visible, width };
  });
}

function gridColumnsToPreferencePayload(columns: LineGridColumnConfig[]): LineGridPreferencePayload {
  return {
    order: columns.map((c) => c.key),
    visible: Object.fromEntries(columns.map((c) => [c.key, c.visible])),
    widths: Object.fromEntries(columns.map((c) => [c.key, c.width])),
  };
}

function getDispatchGridLocalStorageKey(preferenceKey: string, companyId: string) {
  return `dispatch-line-grid:${preferenceKey.trim().toLowerCase()}:${companyId}`;
}

function readDispatchGridLocalPref(storageKey: string): Partial<LineGridPreferencePayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<LineGridPreferencePayload>;
  } catch {
    return null;
  }
}

function writeDispatchGridLocalPref(storageKey: string, payload: LineGridPreferencePayload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export default function DispatchLineGrid({
  lines,
  materials,
  warehouses,
  selectedJob,
  showWarehouseColumn = true,
  emptyMessage,
  onUpdateLine,
  persistScope,
  budgetWarningMaterialIds,
  gridEnabled,
  variant = 'dispatch',
}: DispatchLineGridProps) {
  const isWarehouseTransfer = variant === 'warehouse-transfer';
  const inputsEnabled = gridEnabled ?? Boolean(selectedJob);
  const effectiveShowWarehouseColumn = showWarehouseColumn && !isWarehouseTransfer;
  const preferenceKey = PREFERENCE_KEY_BY_SCOPE[persistScope];
  const budgetWarningMaterialIdSet = useMemo(() => {
    if (!budgetWarningMaterialIds?.length) return null;
    return new Set(budgetWarningMaterialIds);
  }, [budgetWarningMaterialIds]);
  const { data: session, status: sessionStatus } = useSession();
  const companyId = session?.user?.activeCompanyId;
  const storageKey = useMemo(
    () => (companyId ? getDispatchGridLocalStorageKey(preferenceKey, companyId) : null),
    [preferenceKey, companyId]
  );

  const defaultColumnsForScope = useMemo(() => {
    if (!isWarehouseTransfer) return DEFAULT_GRID_COLUMNS;
    return DEFAULT_GRID_COLUMNS.map((column) =>
      column.key === 'dispatchQty'
        ? { ...column, label: 'Transfer Qty' }
        : column.key === 'returnQty'
          ? { ...column, visible: false }
          : column.key === 'warehouse'
            ? { ...column, visible: false }
            : column,
    );
  }, [isWarehouseTransfer]);

  const [gridColumns, setGridColumns] = useState<LineGridColumnConfig[]>(defaultColumnsForScope);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadedPreferenceKeyRef = useRef<string | null>(null);
  const visibleGridColumns = useMemo(() => {
    return gridColumns.filter((column) => {
      if (!column.visible) return false;
      if (!effectiveShowWarehouseColumn && column.key === 'warehouse') return false;
      if (isWarehouseTransfer && column.key === 'returnQty') return false;
      return true;
    });
  }, [gridColumns, effectiveShowWarehouseColumn, isWarehouseTransfer]);
  const gridTemplateColumns = useMemo(
    () => visibleGridColumns.map((column) => `${column.width}px`).join(' '),
    [visibleGridColumns]
  );
  const navigableColumns = useMemo(
    () =>
      visibleGridColumns
        .map((column) => column.key as DispatchGridColumnKey)
        .filter((key) => DISPATCH_NAVIGABLE_COLUMN_KEYS.includes(key)),
    [visibleGridColumns]
  );
  const { getNavInputProps } = useLineGridKeyboardNav(lines.length, navigableColumns.length);
  const navColIndex = useCallback(
    (key: DispatchGridColumnKey) => navigableColumns.indexOf(key),
    [navigableColumns]
  );
  const cellNavInputProps = useCallback(
    (rowIndex: number, key: DispatchGridColumnKey, existing?: InputHTMLAttributes<HTMLInputElement>) => {
      const col = navColIndex(key);
      if (col < 0) return existing;
      return mergeLineGridInputProps(getNavInputProps(rowIndex, col), existing);
    },
    [getNavInputProps, navColIndex]
  );

  /** Apply last-known columns from localStorage before paint (avoids default-width flash while session/network load). */
  useLayoutEffect(() => {
    if (!storageKey) return;
    const stashed = readDispatchGridLocalPref(storageKey);
    if (!stashed) return;
    setGridColumns(mergeStoredGridColumns(defaultColumnsForScope, stashed));
  }, [storageKey, defaultColumnsForScope]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!companyId) {
      setPreferencesLoaded(true);
      loadedPreferenceKeyRef.current = `${preferenceKey}:`;
      return;
    }

    setPreferencesLoaded(false);
    const controller = new AbortController();
    const apiKey = preferenceKey;

    void (async () => {
      try {
        const response = await fetch(`/api/me/table-preferences/${encodeURIComponent(apiKey)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load table preferences');
        const json = (await response.json()) as { data?: Partial<LineGridPreferencePayload> | null };
        if (controller.signal.aborted) return;

        const remote = json.data;
        const mergedFromServer =
          remote != null ? mergeStoredGridColumns(defaultColumnsForScope, remote) : null;

        if (mergedFromServer) {
          setGridColumns(mergedFromServer);
          if (storageKey) {
            writeDispatchGridLocalPref(storageKey, gridColumnsToPreferencePayload(mergedFromServer));
          }
        }

        loadedPreferenceKeyRef.current = `${apiKey}:${companyId}`;
        setPreferencesLoaded(true);
      } catch {
        if (controller.signal.aborted) return;
        const fallback = storageKey ? readDispatchGridLocalPref(storageKey) : null;
        setGridColumns(mergeStoredGridColumns(defaultColumnsForScope, fallback));
        loadedPreferenceKeyRef.current = `${apiKey}:${companyId}`;
        setPreferencesLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [preferenceKey, companyId, sessionStatus, storageKey, defaultColumnsForScope]);

  useEffect(() => {
    if (!preferencesLoaded || loadedPreferenceKeyRef.current !== `${preferenceKey}:${companyId ?? ''}`) return;
    if (!storageKey) return;

    const payload = gridColumnsToPreferencePayload(gridColumns);
    writeDispatchGridLocalPref(storageKey, payload);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/me/table-preferences/${encodeURIComponent(preferenceKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => {});
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [gridColumns, preferenceKey, preferencesLoaded, storageKey, companyId]);

  const setGridColumnVisibility = (key: string) => {
    setGridColumns((current) => {
      const visibleCount = current.filter((column) => column.visible).length;
      return current.map((column) => {
        if (column.key !== key) return column;
        if (column.visible && visibleCount === 1) return column;
        return { ...column, visible: !column.visible };
      });
    });
  };

  const moveGridColumn = (key: string, direction: 'left' | 'right') => {
    setGridColumns((current) => {
      const index = current.findIndex((column) => column.key === key);
      if (index < 0) return current;
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [column] = next.splice(index, 1);
      next.splice(targetIndex, 0, column);
      return next;
    });
  };

  const beginHeaderResize = (e: React.PointerEvent<HTMLButtonElement>, columnKey: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const col = gridColumns.find((c) => c.key === columnKey);
    if (!col) return;

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startWidth = col.width;

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const next = startWidth + (moveEvent.clientX - startX);
      setGridColumns((current) =>
        current.map((column) =>
          column.key === columnKey
            ? {
                ...column,
                width: Math.max(column.minWidth ?? 64, Math.min(column.maxWidth ?? 420, next)),
              }
            : column
        )
      );
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Excel View</div>
        <LineGridColumnSettings
          columns={gridColumns.filter((column) => {
            if (!effectiveShowWarehouseColumn && column.key === 'warehouse') return false;
            if (isWarehouseTransfer && column.key === 'returnQty') return false;
            return true;
          })}
          onToggle={setGridColumnVisibility}
          onMove={moveGridColumn}
        />
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-max bg-card">
          <div
            className="grid border-b border-border bg-muted/50"
            style={{ gridTemplateColumns }}
          >
            {visibleGridColumns.map((column) => (
              <div
                key={column.key}
                className="relative flex min-w-0 items-center border-r border-border py-1 pl-2 pr-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground last:border-r-0"
              >
                <span className="min-w-0 flex-1 truncate pr-1">{column.label}</span>
                <button
                  type="button"
                  aria-label={`Resize ${column.label} column`}
                  className="absolute right-0 top-0 z-1 h-full w-2 max-w-[10px] touch-none cursor-col-resize border-0 bg-transparent p-0 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onPointerDown={(ev) => beginHeaderResize(ev, column.key)}
                />
              </div>
            ))}
          </div>

          {lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            lines.map((line, idx) => {
              const mat = materials.find((material) => material.id === line.materialId);
              const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === line.warehouseId);
              const stockDisplay = formatWarehouseStock(mat, line.warehouseId, line.quantityUomId);
              const globalStockDisplay = formatGlobalStock(mat, line.quantityUomId);
              const selectedUom = getSelectedUom(mat, line.quantityUomId);
              const selectedWarehouseBaseStock = getWarehouseBaseStock(mat, line.warehouseId);
              const isBudgetWarningRow =
                Boolean(line.materialId) && budgetWarningMaterialIdSet?.has(line.materialId) === true;

              return (
                <div
                  key={line.id}
                  className={cn(
                    'grid border-b border-border',
                    isBudgetWarningRow
                      ? 'bg-amber-500/15 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:hover:bg-amber-500/25'
                      : 'hover:bg-muted/40'
                  )}
                  style={{ gridTemplateColumns }}
                >
                  {visibleGridColumns.map((column) => {
                    const cellClassName = 'border-r border-border last:border-r-0';
                    switch (column.key as DispatchGridColumnKey) {
                      case 'line':
                        return (
                          <div key={column.key} className={`${cellClassName} px-2 py-1 font-mono text-xs text-muted-foreground`}>
                            {idx + 1}
                          </div>
                        );
                      case 'material':
                        return (
                          <div key={column.key} className={`${cellClassName} min-w-0`}>
                            <SearchSelect
                              value={line.materialId}
                              onChange={(id) => onUpdateLine(line.id, 'materialId', id)}
                              placeholder="Material"
                              disabled={!inputsEnabled}
                              items={materials.filter((material) => material.isActive).map((material) => ({
                                id: material.id,
                                label: material.name,
                                searchText: `${material.currentStock} ${material.unit}`,
                              }))}
                              dropdownInPortal
                              allowClearButton={false}
                              clearOnEmptyInput
                              passThroughArrowKeys
                              inputProps={cellNavInputProps(idx, 'material', {
                                className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
                              })}
                              renderItem={(item) => (
                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <div className="truncate font-medium text-foreground">{item.label}</div>
                                  <span className="text-[11px] text-muted-foreground">{item.searchText}</span>
                                </div>
                              )}
                            />
                          </div>
                        );
                      case 'uom':
                        return (
                          <div key={column.key} className={cellClassName}>
                            {line.materialId ? (
                              <SearchSelect
                                value={line.quantityUomId}
                                onChange={(id) => onUpdateLine(line.id, 'quantityUomId', id)}
                                placeholder="UOM"
                                disabled={!inputsEnabled}
                                items={getMaterialUomOptions(mat).map((uom) => ({
                                  id: uom.value,
                                  label: uom.label,
                                }))}
                                dropdownInPortal
                                allowClearButton={false}
                                clearOnEmptyInput
                                passThroughArrowKeys
                                inputProps={cellNavInputProps(idx, 'uom', {
                                  className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-xs focus:!ring-0 min-w-0',
                                })}
                              />
                            ) : (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">UOM</div>
                            )}
                          </div>
                        );
                      case 'warehouseStock':
                        return (
                          <div key={column.key} className={`${cellClassName} px-2 py-1.5 text-right font-mono`}>
                            {line.warehouseId && selectedUom ? (
                              <>
                                <div className="text-sm text-emerald-700 dark:text-emerald-300">
                                  {stockDisplay.quantity.toFixed(3)} {stockDisplay.unitName}
                                </div>
                                {mat && showBaseStockLine(line.quantityUomId) ? (
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {selectedWarehouseBaseStock.toFixed(3)} {mat.unit}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="text-sm text-emerald-700 dark:text-emerald-300">—</div>
                            )}
                          </div>
                        );
                      case 'globalStock':
                        return (
                          <div key={column.key} className={`${cellClassName} px-2 py-1.5 text-right font-mono`}>
                            {mat && selectedUom ? (
                              <>
                                <div className="text-sm text-blue-700 dark:text-blue-300">
                                  {globalStockDisplay.quantity.toFixed(3)} {globalStockDisplay.unitName}
                                </div>
                                {showBaseStockLine(line.quantityUomId) ? (
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {mat.currentStock.toFixed(3)} {mat.unit}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="text-sm text-blue-700 dark:text-blue-300">—</div>
                            )}
                          </div>
                        );
                      case 'dispatchQty':
                        return (
                          <div key={column.key} className={cellClassName}>
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              disabled={
                                !inputsEnabled || !mat || (!isWarehouseTransfer && !line.warehouseId)
                              }
                              value={line.dispatchQty}
                              onChange={(event) => onUpdateLine(line.id, 'dispatchQty', event.target.value)}
                              title={
                                !mat
                                  ? ''
                                  : !isWarehouseTransfer && !line.warehouseId
                                    ? 'Select warehouse first'
                                    : ''
                              }
                              placeholder="0.00"
                              {...cellNavInputProps(idx, 'dispatchQty', {
                                className: 'h-full w-full [appearance:textfield] border-0 bg-transparent px-2 py-1.5 text-right text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                              })}
                            />
                          </div>
                        );
                      case 'returnQty':
                        return (
                          <div key={column.key} className={cellClassName}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.returnQty}
                              onChange={(event) => onUpdateLine(line.id, 'returnQty', event.target.value)}
                              placeholder="0.00"
                              disabled={!inputsEnabled}
                              {...cellNavInputProps(idx, 'returnQty', {
                                className: 'h-full w-full [appearance:textfield] border-0 bg-transparent px-2 py-1.5 text-right text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                              })}
                            />
                          </div>
                        );
                      case 'warehouse':
                        return (
                          <div key={column.key} className={cellClassName}>
                            <SearchSelect
                              value={line.warehouseId}
                              onChange={(id) => onUpdateLine(line.id, 'warehouseId', id)}
                              placeholder="Warehouse"
                              disabled={!inputsEnabled || !mat}
                              dropdownInPortal
                              passThroughArrowKeys
                              items={warehouses.map((warehouse) => {
                                const warehouseStock = formatWarehouseStock(mat, warehouse.id, line.quantityUomId);
                                return {
                                  id: warehouse.id,
                                  label: warehouse.name,
                                  searchText: `${warehouseStock.quantity.toFixed(3)} ${warehouseStock.unitName}${mat?.warehouseId === warehouse.id ? ' default' : ''}`,
                                };
                              })}
                              allowClearButton={false}
                              clearOnEmptyInput
                              inputProps={cellNavInputProps(idx, 'warehouse', {
                                className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
                              })}
                              renderItem={(item) => (
                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">{item.label}</div>
                                    {mat?.warehouseId === item.id ? (
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Default</div>
                                    ) : null}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">{item.searchText}</span>
                                </div>
                              )}
                            />
                            <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
                              {selectedWarehouse && selectedUom
                                ? `${selectedWarehouse.name}: ${stockDisplay.quantity.toFixed(3)} ${selectedUom.unitName}`
                                : 'Warehouse stock'}
                            </div>
                          </div>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
