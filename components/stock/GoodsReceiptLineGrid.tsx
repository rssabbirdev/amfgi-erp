'use client';

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';
import { useSession } from 'next-auth/react';
import ScheduleSearchSelect from '@/components/hr/ScheduleSearchSelect';
import SearchSelect from '@/components/ui/SearchSelect';
import LineGridColumnSettings, { type LineGridColumnConfig } from '@/components/stock/LineGridColumnSettings';
import {
  mergeLineGridInputProps,
  useLineGridKeyboardNav,
  type MergeLineGridInputPropsOptions,
} from '@/lib/stock/lineGridKeyboardNav';
import { toMaterialSelectItem, type MaterialSelectItem } from '@/lib/stock/pagedSelectSearch';
import { cn } from '@/lib/utils';
import type { Material } from '@/store/hooks';

interface WarehouseOption {
  id: string;
  name: string;
}

export interface GoodsReceiptLineGridRow {
  id: string;
  materialId: string;
  quantity: string;
  quantityUomId: string;
  unitCost: string;
  warehouseId: string;
}

const PREFERENCE_KEY = 'stock-goods-receipt-receive-line-grid';

type ReceiptGridColumnKey =
  | 'line'
  | 'material'
  | 'uom'
  | 'stock'
  | 'qty'
  | 'warehouse'
  | 'unitCost'
  | 'total';

const RECEIPT_NAVIGABLE_COLUMN_KEYS: ReceiptGridColumnKey[] = [
  'material',
  'uom',
  'qty',
  'warehouse',
  'unitCost',
];

const DEFAULT_GRID_COLUMNS: LineGridColumnConfig[] = [
  { key: 'line', label: '#', visible: true, width: 48, minWidth: 40, maxWidth: 72 },
  { key: 'material', label: 'Material', visible: true, width: 280, minWidth: 180, maxWidth: 420 },
  { key: 'uom', label: 'UOM', visible: true, width: 140, minWidth: 110, maxWidth: 220 },
  { key: 'stock', label: 'Stock', visible: true, width: 130, minWidth: 100, maxWidth: 200 },
  { key: 'qty', label: 'Qty', visible: true, width: 132, minWidth: 110, maxWidth: 220 },
  { key: 'warehouse', label: 'Warehouse', visible: true, width: 220, minWidth: 180, maxWidth: 320 },
  { key: 'unitCost', label: 'Unit cost', visible: true, width: 132, minWidth: 110, maxWidth: 220 },
  { key: 'total', label: 'Total', visible: true, width: 140, minWidth: 110, maxWidth: 220 },
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

const ReceiptMaterialSelectCell = memo(function ReceiptMaterialSelectCell({
  lineId,
  materialId,
  material,
  searchMaterials,
  resolveMaterialById,
  onUpdateLine,
  onMaterialResolved,
  isDuplicateRow,
  materialNavInputProps,
  canCreateMaterial,
  onRequestCreateMaterial,
}: {
  lineId: string;
  materialId: string;
  material: Material | undefined;
  searchMaterials: (query: string) => Promise<MaterialSelectItem[]>;
  resolveMaterialById: (id: string) => Promise<MaterialSelectItem | null>;
  onUpdateLine: (id: string, field: keyof GoodsReceiptLineGridRow, value: string) => void;
  onMaterialResolved: (lineId: string, material: Material) => void;
  isDuplicateRow: boolean;
  materialNavInputProps?: InputHTMLAttributes<HTMLInputElement>;
  canCreateMaterial?: boolean;
  onRequestCreateMaterial?: (lineId: string, suggestedName: string) => void;
}) {
  const knownItem = useMemo(
    () => (material ? toMaterialSelectItem(material) : null),
    [material]
  );

  const handleResolved = useCallback(
    (item: MaterialSelectItem | null) => {
      if (item) onMaterialResolved(lineId, item.material);
    },
    [lineId, onMaterialResolved]
  );

  const emptyAction = useMemo(() => {
    if (!canCreateMaterial || !onRequestCreateMaterial) return undefined;
    return {
      label: (query: string) => `Create material "${query}"`,
      onAction: (query: string) => onRequestCreateMaterial(lineId, query),
    };
  }, [canCreateMaterial, lineId, onRequestCreateMaterial]);

  return (
    <div className="min-w-0">
      <ScheduleSearchSelect<MaterialSelectItem>
        value={materialId}
        knownItem={knownItem}
        onChange={(id) => onUpdateLine(lineId, 'materialId', id)}
        onResolved={handleResolved}
        search={searchMaterials}
        resolveById={resolveMaterialById}
        placeholder="Type to search material…"
        minCharactersToSearch={1}
        dropdownInPortal
        allowClearButton={false}
        clearOnEmptyInput
        passThroughArrowKeys
        emptyAction={emptyAction}
        inputProps={mergeLineGridInputProps(materialNavInputProps ?? {}, {
          className:
            '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
        })}
        renderItem={(item) => (
          <div className="flex w-full min-w-0 items-center justify-between gap-3">
            <div className="truncate font-medium text-foreground">{item.label}</div>
            <span className="text-[11px] text-muted-foreground">{item.searchText}</span>
          </div>
        )}
      />
      {isDuplicateRow ? (
        <p className="border-t border-border px-2 py-1 text-[10px] text-destructive">
          Duplicate material — merge rows before posting
        </p>
      ) : null}
    </div>
  );
});

function getUnitCostPerBase(material: Material | undefined, line: GoodsReceiptLineGridRow) {
  if (!material) return null;
  const inputCost = parseFloat(line.unitCost);
  if (!inputCost || inputCost <= 0) return null;
  const selectedUom = material.materialUoms?.find((uom) =>
    line.quantityUomId ? uom.id === line.quantityUomId : uom.isBase
  );
  const factor = selectedUom?.factorToBase ?? 1;
  return inputCost / factor;
}

function lineTotal(line: GoodsReceiptLineGridRow) {
  const quantity = parseFloat(line.quantity) || 0;
  const unitCost = parseFloat(line.unitCost) || 0;
  return quantity * unitCost;
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

function getGridLocalStorageKey(companyId: string) {
  return `goods-receipt-line-grid:${PREFERENCE_KEY.trim().toLowerCase()}:${companyId}`;
}

function readGridLocalPref(storageKey: string): Partial<LineGridPreferencePayload> | null {
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

function writeGridLocalPref(storageKey: string, payload: LineGridPreferencePayload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

interface GoodsReceiptLineGridProps {
  lines: GoodsReceiptLineGridRow[];
  getMaterial: (materialId: string) => Material | undefined;
  searchMaterials: (query: string) => Promise<MaterialSelectItem[]>;
  resolveMaterialById: (id: string) => Promise<MaterialSelectItem | null>;
  onMaterialResolved: (lineId: string, material: Material) => void;
  warehouses: WarehouseOption[];
  showWarehouseColumn?: boolean;
  emptyMessage: string;
  duplicateMaterialIds?: readonly string[];
  onUpdateLine: (id: string, field: keyof GoodsReceiptLineGridRow, value: string) => void;
  canCreateMaterial?: boolean;
  onRequestCreateMaterial?: (lineId: string, suggestedName: string) => void;
}

export default function GoodsReceiptLineGrid({
  lines,
  getMaterial,
  searchMaterials,
  resolveMaterialById,
  onMaterialResolved,
  warehouses,
  showWarehouseColumn = true,
  emptyMessage,
  duplicateMaterialIds,
  onUpdateLine,
  canCreateMaterial = false,
  onRequestCreateMaterial,
}: GoodsReceiptLineGridProps) {
  const duplicateMaterialIdSet = useMemo(() => {
    if (!duplicateMaterialIds?.length) return null;
    return new Set(duplicateMaterialIds);
  }, [duplicateMaterialIds]);

  const { data: session, status: sessionStatus } = useSession();
  const companyId = session?.user?.activeCompanyId;
  const storageKey = useMemo(
    () => (companyId ? getGridLocalStorageKey(companyId) : null),
    [companyId]
  );

  const [gridColumns, setGridColumns] = useState<LineGridColumnConfig[]>(DEFAULT_GRID_COLUMNS);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadedPreferenceKeyRef = useRef<string | null>(null);

  const visibleGridColumns = useMemo(() => {
    return gridColumns.filter((column) => {
      if (!column.visible) return false;
      if (!showWarehouseColumn && column.key === 'warehouse') return false;
      return true;
    });
  }, [gridColumns, showWarehouseColumn]);

  const gridTemplateColumns = useMemo(
    () => visibleGridColumns.map((column) => `${column.width}px`).join(' '),
    [visibleGridColumns]
  );
  const navigableColumns = useMemo(
    () =>
      visibleGridColumns
        .map((column) => column.key as ReceiptGridColumnKey)
        .filter((key) => RECEIPT_NAVIGABLE_COLUMN_KEYS.includes(key)),
    [visibleGridColumns]
  );
  const { getNavInputProps } = useLineGridKeyboardNav(lines.length, navigableColumns.length);
  const navColIndex = useCallback(
    (key: ReceiptGridColumnKey) => navigableColumns.indexOf(key),
    [navigableColumns]
  );
  const cellNavInputProps = useCallback(
    (
      rowIndex: number,
      key: ReceiptGridColumnKey,
      existing?: InputHTMLAttributes<HTMLInputElement>,
      options?: MergeLineGridInputPropsOptions
    ) => {
      const col = navColIndex(key);
      if (col < 0) return existing;
      return mergeLineGridInputProps(getNavInputProps(rowIndex, col), existing, options);
    },
    [getNavInputProps, navColIndex]
  );

  useLayoutEffect(() => {
    if (!storageKey) return;
    const stashed = readGridLocalPref(storageKey);
    if (!stashed) return;
    setGridColumns(mergeStoredGridColumns(DEFAULT_GRID_COLUMNS, stashed));
  }, [storageKey]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!companyId) {
      setPreferencesLoaded(true);
      loadedPreferenceKeyRef.current = `${PREFERENCE_KEY}:`;
      return;
    }

    setPreferencesLoaded(false);
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/me/table-preferences/${encodeURIComponent(PREFERENCE_KEY)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load table preferences');
        const json = (await response.json()) as { data?: Partial<LineGridPreferencePayload> | null };
        if (controller.signal.aborted) return;

        const remote = json.data;
        const mergedFromServer =
          remote != null ? mergeStoredGridColumns(DEFAULT_GRID_COLUMNS, remote) : null;

        if (mergedFromServer) {
          setGridColumns(mergedFromServer);
          if (storageKey) {
            writeGridLocalPref(storageKey, gridColumnsToPreferencePayload(mergedFromServer));
          }
        }

        loadedPreferenceKeyRef.current = `${PREFERENCE_KEY}:${companyId}`;
        setPreferencesLoaded(true);
      } catch {
        if (controller.signal.aborted) return;
        const fallback = storageKey ? readGridLocalPref(storageKey) : null;
        setGridColumns(mergeStoredGridColumns(DEFAULT_GRID_COLUMNS, fallback));
        loadedPreferenceKeyRef.current = `${PREFERENCE_KEY}:${companyId}`;
        setPreferencesLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [companyId, sessionStatus, storageKey]);

  useEffect(() => {
    if (!preferencesLoaded || loadedPreferenceKeyRef.current !== `${PREFERENCE_KEY}:${companyId ?? ''}`) return;
    if (!storageKey) return;

    const payload = gridColumnsToPreferencePayload(gridColumns);
    writeGridLocalPref(storageKey, payload);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/me/table-preferences/${encodeURIComponent(PREFERENCE_KEY)}`, {
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
  }, [gridColumns, preferencesLoaded, storageKey, companyId]);

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
            if (!showWarehouseColumn && column.key === 'warehouse') return false;
            return true;
          })}
          onToggle={setGridColumnVisibility}
          onMove={moveGridColumn}
        />
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-max bg-card">
          <div className="grid border-b border-border bg-muted/50" style={{ gridTemplateColumns }}>
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
              const mat = line.materialId ? getMaterial(line.materialId) : undefined;
              const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === line.warehouseId);
              const globalStockDisplay = formatGlobalStock(mat, line.quantityUomId);
              const selectedUom = getSelectedUom(mat, line.quantityUomId);
              const stockDisplay = formatWarehouseStock(mat, line.warehouseId, line.quantityUomId);
              const isDuplicateRow =
                Boolean(line.materialId) && duplicateMaterialIdSet?.has(line.materialId) === true;
              const total = lineTotal(line);
              const perBase = getUnitCostPerBase(mat, line);

              return (
                <div
                  key={line.id}
                  className={cn(
                    'grid border-b border-border',
                    isDuplicateRow
                      ? 'bg-destructive/10 hover:bg-destructive/15'
                      : 'hover:bg-muted/40'
                  )}
                  style={{ gridTemplateColumns }}
                >
                  {visibleGridColumns.map((column) => {
                    const cellClassName = 'border-r border-border last:border-r-0';
                    switch (column.key as ReceiptGridColumnKey) {
                      case 'line':
                        return (
                          <div
                            key={column.key}
                            className={`${cellClassName} px-2 py-1 font-mono text-xs text-muted-foreground`}
                          >
                            {idx + 1}
                          </div>
                        );
                      case 'material':
                        return (
                          <div key={column.key} className={cellClassName}>
                            <ReceiptMaterialSelectCell
                              lineId={line.id}
                              materialId={line.materialId}
                              material={mat}
                              searchMaterials={searchMaterials}
                              resolveMaterialById={resolveMaterialById}
                              onUpdateLine={onUpdateLine}
                              onMaterialResolved={onMaterialResolved}
                              isDuplicateRow={isDuplicateRow}
                              materialNavInputProps={cellNavInputProps(idx, 'material')}
                              canCreateMaterial={canCreateMaterial}
                              onRequestCreateMaterial={onRequestCreateMaterial}
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
                                items={getMaterialUomOptions(mat).map((uom) => ({
                                  id: uom.value,
                                  label: uom.label,
                                }))}
                                dropdownInPortal
                                allowClearButton={false}
                                clearOnEmptyInput
                                passThroughArrowKeys
                                inputProps={cellNavInputProps(idx, 'uom', {
                                  className:
                                    '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-xs focus:!ring-0 min-w-0',
                                })}
                              />
                            ) : (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">UOM</div>
                            )}
                          </div>
                        );
                      case 'stock':
                        return (
                          <div key={column.key} className={`${cellClassName} px-2 py-1.5 text-right font-mono`}>
                            {mat && selectedUom ? (
                              <>
                                <div
                                  className={cn(
                                    'text-sm',
                                    mat.currentStock <= 0
                                      ? 'text-destructive'
                                      : 'text-blue-700 dark:text-blue-300'
                                  )}
                                >
                                  {globalStockDisplay.quantity.toFixed(3)} {globalStockDisplay.unitName}
                                </div>
                                {showBaseStockLine(line.quantityUomId) ? (
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {mat.currentStock.toFixed(3)} {mat.unit}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </div>
                        );
                      case 'qty':
                        return (
                          <div key={column.key} className={cellClassName}>
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              disabled={!mat}
                              value={line.quantity}
                              onChange={(event) => onUpdateLine(line.id, 'quantity', event.target.value)}
                              placeholder="0.000"
                              {...cellNavInputProps(idx, 'qty', {
                                className: 'h-full w-full [appearance:textfield] border-0 bg-transparent px-2 py-1.5 text-right text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                              }, { blockWheel: true })}
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
                              disabled={!mat}
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
                                className:
                                  '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
                              })}
                              renderItem={(item) => (
                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">{item.label}</div>
                                    {mat?.warehouseId === item.id ? (
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                                        Default
                                      </div>
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
                      case 'unitCost':
                        return (
                          <div key={column.key} className={cellClassName}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitCost}
                              onChange={(event) => onUpdateLine(line.id, 'unitCost', event.target.value)}
                              placeholder="0.00"
                              disabled={!mat}
                              {...cellNavInputProps(idx, 'unitCost', {
                                className: 'h-full w-full [appearance:textfield] border-0 bg-transparent px-2 py-1.5 text-right text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                              }, { blockWheel: true })}
                            />
                          </div>
                        );
                      case 'total':
                        return (
                          <div key={column.key} className={`${cellClassName} px-2 py-1.5 text-right`}>
                            <span className="block font-mono text-sm font-medium text-foreground">
                              {total > 0 ? total.toFixed(2) : '—'}
                            </span>
                            {perBase ? (
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                Base {perBase.toFixed(2)}
                              </span>
                            ) : null}
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
