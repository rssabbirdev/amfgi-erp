'use client';

import { useMemo, useState } from 'react';
import SearchSelect from '@/components/ui/SearchSelect';
import LineGridColumnSettings, { type LineGridColumnConfig } from '@/components/stock/LineGridColumnSettings';
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

interface DispatchLineGridProps {
  lines: DispatchLineGridRow[];
  materials: Material[];
  warehouses: WarehouseOption[];
  selectedJob: string;
  showWarehouseColumn?: boolean;
  emptyMessage: string;
  onUpdateLine: (id: string, field: keyof DispatchLineGridRow, value: string) => void;
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

export default function DispatchLineGrid({
  lines,
  materials,
  warehouses,
  selectedJob,
  showWarehouseColumn = true,
  emptyMessage,
  onUpdateLine,
}: DispatchLineGridProps) {
  const [gridColumns, setGridColumns] = useState<LineGridColumnConfig[]>(DEFAULT_GRID_COLUMNS);
  const visibleGridColumns = useMemo(
    () => gridColumns.filter((column) => column.visible && (showWarehouseColumn || column.key !== 'warehouse')),
    [gridColumns, showWarehouseColumn]
  );
  const gridTemplateColumns = useMemo(
    () => visibleGridColumns.map((column) => `${column.width}px`).join(' '),
    [visibleGridColumns]
  );

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

  const resizeGridColumn = (key: string, width: number) => {
    setGridColumns((current) =>
      current.map((column) =>
        column.key === key
          ? {
              ...column,
              width: Math.max(column.minWidth ?? 64, Math.min(column.maxWidth ?? 420, width)),
            }
          : column
      )
    );
  };

  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Excel View</div>
        <LineGridColumnSettings
          columns={gridColumns.filter((column) => showWarehouseColumn || column.key !== 'warehouse')}
          onToggle={setGridColumnVisibility}
          onMove={moveGridColumn}
          onResize={resizeGridColumn}
        />
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-max bg-white dark:bg-slate-950/70">
          <div
            className="grid border-b border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
            style={{ gridTemplateColumns }}
          >
            {visibleGridColumns.map((column) => (
              <div
                key={column.key}
                className="border-r border-slate-300 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 last:border-r-0 dark:border-slate-700 dark:text-slate-300"
              >
                {column.label}
              </div>
            ))}
          </div>

          {lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</div>
          ) : (
            lines.map((line, idx) => {
              const mat = materials.find((material) => material.id === line.materialId);
              const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === line.warehouseId);
              const stockDisplay = formatWarehouseStock(mat, line.warehouseId, line.quantityUomId);
              const globalStockDisplay = formatGlobalStock(mat, line.quantityUomId);
              const selectedUom = getSelectedUom(mat, line.quantityUomId);
              const selectedWarehouseBaseStock = getWarehouseBaseStock(mat, line.warehouseId);

              return (
                <div
                  key={line.id}
                  className="grid border-b border-slate-200 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/40"
                  style={{ gridTemplateColumns }}
                >
                  {visibleGridColumns.map((column) => {
                    const cellClassName = 'border-r border-slate-200 last:border-r-0 dark:border-slate-800';
                    switch (column.key as DispatchGridColumnKey) {
                      case 'line':
                        return (
                          <div key={column.key} className={`${cellClassName} px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400`}>
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
                              disabled={!selectedJob}
                              items={materials.filter((material) => material.isActive).map((material) => ({
                                id: material.id,
                                label: material.name,
                                searchText: `${material.currentStock} ${material.unit}`,
                              }))}
                              dropdownInPortal
                              allowClearButton={false}
                              clearOnEmptyInput
                              openOnFocus
                              inputProps={{
                                className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
                              }}
                              renderItem={(item) => (
                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <div className="truncate font-medium text-slate-900 dark:text-white">{item.label}</div>
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.searchText}</span>
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
                                disabled={!selectedJob}
                                items={getMaterialUomOptions(mat).map((uom) => ({
                                  id: uom.value,
                                  label: uom.label,
                                }))}
                                dropdownInPortal
                                allowClearButton={false}
                                clearOnEmptyInput
                                openOnFocus
                                clearInputOnFocus
                                inputProps={{
                                  className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-xs focus:!ring-0 min-w-0',
                                }}
                              />
                            ) : (
                              <div className="px-2 py-1.5 text-xs text-slate-400 dark:text-slate-500">UOM</div>
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
                                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
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
                                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
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
                              disabled={!selectedJob || !mat || !line.warehouseId}
                              value={line.dispatchQty}
                              onChange={(event) => onUpdateLine(line.id, 'dispatchQty', event.target.value)}
                              title={
                                !mat
                                  ? ''
                                  : !line.warehouseId
                                    ? 'Select warehouse first'
                                    : ''
                              }
                              placeholder="0.00"
                              className="h-full w-full [appearance:textfield] border-0 bg-transparent px-2 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
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
                              disabled={!selectedJob}
                              className="h-full w-full [appearance:textfield] border-0 bg-transparent px-2 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
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
                              disabled={!selectedJob || !mat}
                              dropdownInPortal
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
                              openOnFocus
                              inputProps={{
                                className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
                              }}
                              renderItem={(item) => (
                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-slate-900 dark:text-white">{item.label}</div>
                                    {mat?.warehouseId === item.id ? (
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Default</div>
                                    ) : null}
                                  </div>
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.searchText}</span>
                                </div>
                              )}
                            />
                            <div className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
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
