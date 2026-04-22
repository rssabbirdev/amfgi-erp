'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  useCreateCategoryMutation,
  useCreateMaterialLogMutation,
  useCreateMaterialMutation,
  useCreateMaterialUomMutation,
  useCreatePriceLogMutation,
  useCreateUnitMutation,
  useCreateWarehouseMutation,
  useDeleteMaterialUomMutation,
  useGetCategoriesQuery,
  useGetMaterialByIdQuery,
  useGetMaterialLogsQuery,
  useGetPriceLogsQuery,
  useGetUnitsQuery,
  useGetWarehousesQuery,
  useUpdateMaterialMutation,
  type Material,
} from '@/store/hooks';

interface ChangeLogValue {
  from: string | number | null;
  to: string | number | null;
}

interface MaterialLogEntry {
  id: string;
  action: 'created' | 'updated' | string;
  timestamp: string;
  changedBy?: string | null;
  changes: Record<string, ChangeLogValue>;
}

interface PriceLogEntry {
  id: string;
  source: 'manual' | string;
  previousPrice: number;
  currentPrice: number;
  changedBy?: string | null;
  timestamp: string;
  notes?: string | null;
}

interface BasicOption {
  id: string;
  name: string;
}

function formatNumber(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatMoney(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return `AED ${value.toFixed(2)}`;
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder-slate-500';
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'object' &&
    (error as { data?: { error?: unknown } }).data?.error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  return fallback;
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FieldShell({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function MaterialEditor({
  material,
  units,
  categories,
  warehouses,
  materialLogs,
  priceLogs,
}: {
  material?: Material;
  units: BasicOption[];
  categories: BasicOption[];
  warehouses: BasicOption[];
  materialLogs: MaterialLogEntry[];
  priceLogs: PriceLogEntry[];
}) {
  const router = useRouter();
  const isCreateMode = !material;

  const [updateMaterial, { isLoading: isUpdating }] = useUpdateMaterialMutation();
  const [createMaterial, { isLoading: isCreating }] = useCreateMaterialMutation();
  const [createMaterialUom] = useCreateMaterialUomMutation();
  const [deleteMaterialUom] = useDeleteMaterialUomMutation();
  const [createUnit] = useCreateUnitMutation();
  const [createCategory] = useCreateCategoryMutation();
  const [createWarehouse] = useCreateWarehouseMutation();
  const [createMaterialLog] = useCreateMaterialLogMutation();
  const [createPriceLog] = useCreatePriceLogMutation();

  const [unitModal, setUnitModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseLocation, setNewWarehouseLocation] = useState('');

  const [name, setName] = useState(material?.name ?? '');
  const [description, setDescription] = useState(material?.description ?? '');
  const [unit, setUnit] = useState(material?.unit ?? '');
  const [category, setCategory] = useState(material?.category ?? '');
  const [warehouse, setWarehouse] = useState(material?.warehouse ?? '');
  const [stockType, setStockType] = useState(material?.stockType ?? '');
  const [externalItemName, setExternalItemName] = useState(material?.externalItemName ?? '');
  const [reorderLevel, setReorderLevel] = useState(material?.reorderLevel?.toString() ?? '');
  const [unitCost, setUnitCost] = useState(material?.unitCost?.toString() ?? '');
  const [currentStock, setCurrentStock] = useState('0');
  const [deriveUnitId, setDeriveUnitId] = useState('');
  const [deriveParentId, setDeriveParentId] = useState('');
  const [deriveFactor, setDeriveFactor] = useState('');

  const materialUoms = material?.materialUoms ?? [];
  const availableDerivedUnits = units.filter((entry) => !materialUoms.some((uom) => uom.unitId === entry.id));
  const latestPriceLog = priceLogs[0];

  const pageTitle = isCreateMode ? 'New material' : material.name;
  const pageSubtitle = isCreateMode
    ? 'Set the stock base, costing, and warehouse defaults in one compact pass.'
    : 'Update stock settings, packaging conversions, and change history.';
  const submitButtonText = isCreateMode ? 'Create Material' : 'Save Changes';
  const isLoading = isCreateMode ? isCreating : isUpdating;

  const stockStatus = useMemo(() => {
    if (isCreateMode) {
      return { label: 'Draft', tone: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300' };
    }

    const low =
      typeof material.reorderLevel === 'number' &&
      typeof material.currentStock === 'number' &&
      material.currentStock <= material.reorderLevel;

    return low
      ? { label: 'Low stock watch', tone: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' }
      : { label: 'Healthy stock', tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' };
  }, [isCreateMode, material]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Item Name is required');
      return;
    }
    if (!unit.trim()) {
      toast.error('Unit is required');
      return;
    }
    if (!stockType.trim()) {
      toast.error('Stock Type is required');
      return;
    }
    if (!unitCost.trim()) {
      toast.error('Unit Cost is required');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      unit: unit.trim(),
      category: category.trim() || undefined,
      warehouse: warehouse.trim() || undefined,
      stockType: stockType.trim(),
      externalItemName: externalItemName.trim() || undefined,
      ...(isCreateMode && { currentStock: parseFloat(currentStock) || 0 }),
      reorderLevel: reorderLevel ? parseFloat(reorderLevel) : undefined,
      unitCost: unitCost ? parseFloat(unitCost) : undefined,
    };

    try {
      if (isCreateMode) {
        const result = await createMaterial(payload).unwrap();

        const changes: Record<string, ChangeLogValue> = {
          name: { from: null, to: name },
          unit: { from: null, to: unit },
          category: { from: null, to: category || null },
          warehouse: { from: null, to: warehouse || null },
          stockType: { from: null, to: stockType },
          externalItemName: { from: null, to: externalItemName || null },
        };

        if (description) changes.description = { from: null, to: description };
        if (reorderLevel) changes.reorderLevel = { from: null, to: reorderLevel };

        await createMaterialLog({
          materialId: result.id,
          action: 'created',
          changes,
        }).unwrap();

        const parsedUnitCost = parseFloat(unitCost) || 0;
        if (parsedUnitCost > 0) {
          await createPriceLog({
            materialId: result.id,
            previousPrice: 0,
            currentPrice: parsedUnitCost,
            source: 'manual',
          }).unwrap();
        }

        toast.success('Material created successfully');
        router.push(`/stock/materials/${result.id}`);
        return;
      }

      const previousUnitCost = material.unitCost || 0;
      const newUnitCost = parseFloat(unitCost) || 0;

      await updateMaterial({ id: material.id, data: payload }).unwrap();

      const changes: Record<string, ChangeLogValue> = {};
      if (name !== material.name) changes.name = { from: material.name, to: name };
      if (description !== (material.description ?? '')) {
        changes.description = {
          from: material.description || '(empty)',
          to: description || '(empty)',
        };
      }
      if (unit !== material.unit) changes.unit = { from: material.unit, to: unit };
      if (category !== material.category) changes.category = { from: material.category || null, to: category || null };
      if (warehouse !== material.warehouse) changes.warehouse = { from: material.warehouse || null, to: warehouse || null };
      if (stockType !== material.stockType) changes.stockType = { from: material.stockType, to: stockType };
      if (externalItemName !== material.externalItemName) {
        changes.externalItemName = {
          from: material.externalItemName || null,
          to: externalItemName || null,
        };
      }
      if (reorderLevel !== (material.reorderLevel?.toString() ?? '')) {
        changes.reorderLevel = {
          from: material.reorderLevel ?? 0,
          to: parseFloat(reorderLevel) || 0,
        };
      }

      if (Object.keys(changes).length > 0) {
        await createMaterialLog({
          materialId: material.id,
          action: 'updated',
          changes,
        }).unwrap();
      }

      if (previousUnitCost !== newUnitCost) {
        await createPriceLog({
          materialId: material.id,
          previousPrice: previousUnitCost,
          currentPrice: newUnitCost,
          source: 'manual',
        }).unwrap();
      }

      toast.success('Material updated successfully');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, isCreateMode ? 'Failed to create material' : 'Failed to update material'));
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) {
      toast.error('Unit name is required');
      return;
    }
    try {
      const newUnit = await createUnit({ name: newUnitName.trim() }).unwrap();
      setUnit(newUnit.name);
      setNewUnitName('');
      setUnitModal(false);
      toast.success('Unit created');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to create unit'));
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      const newCategory = await createCategory({ name: newCategoryName.trim() }).unwrap();
      setCategory(newCategory.name);
      setNewCategoryName('');
      setCategoryModal(false);
      toast.success('Category created');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to create category'));
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) {
      toast.error('Warehouse name is required');
      return;
    }
    try {
      const newWarehouse = await createWarehouse({
        name: newWarehouseName.trim(),
        location: newWarehouseLocation.trim() || undefined,
      }).unwrap();
      setWarehouse(newWarehouse.name);
      setNewWarehouseName('');
      setNewWarehouseLocation('');
      setWarehouseModal(false);
      toast.success('Warehouse created');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to create warehouse'));
    }
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Materials Setup
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">{pageTitle}</h1>
                <span className={['inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', stockStatus.tone].join(' ')}>
                  {stockStatus.label}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{pageSubtitle}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!isCreateMode ? (
                <Button variant="ghost" onClick={() => router.push('/stock/materials')}>
                  Back to materials
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={isLoading}>
                {submitButtonText}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Base unit',
              value: unit || material?.unit || '-',
              note: isCreateMode ? 'Used for stock and transaction storage' : 'Current stock base',
            },
            {
              label: 'Current stock',
              value: isCreateMode ? currentStock || '0' : formatNumber(material?.currentStock),
              note:
                !isCreateMode && material?.reorderLevel !== undefined
                  ? `Reorder at ${formatNumber(material.reorderLevel)}`
                  : 'Opening stock while creating',
            },
            {
              label: 'Unit cost',
              value: unitCost ? `AED ${Number(unitCost || 0).toFixed(2)}` : formatMoney(material?.unitCost),
              note: latestPriceLog ? `Latest change ${new Date(latestPriceLog.timestamp).toLocaleDateString()}` : 'Manual cost baseline',
            },
            {
              label: 'UOM chain',
              value: String(materialUoms.length),
              note: materialUoms.some((entry) => entry.isBase) ? 'Base and derived units configured' : 'Create base UOM after save',
            },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-950/80">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <SectionShell
            title="Material details"
            description="Keep the core stock settings close together so edits take one pass."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label="Item name" hint="Primary inventory label used across transactions." wide>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClassName()}
                  placeholder="e.g. Fiberglass Mat 300gsm"
                  autoFocus={isCreateMode}
                />
              </FieldShell>

              <FieldShell label="Description" hint="Optional note for teams and imports." wide>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClassName()}
                  rows={3}
                />
              </FieldShell>

              <FieldShell label="Base unit" hint="Inventory and dispatch quantities resolve back to this unit.">
                <div className="flex gap-2">
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClassName()}>
                    <option value="">Select unit</option>
                    {units.map((entry) => (
                      <option key={entry.id} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setUnitModal(true)}>
                    New
                  </Button>
                </div>
              </FieldShell>

              <FieldShell label="Stock type" hint="Used to separate raw, WIP, and finished items.">
                <select value={stockType} onChange={(e) => setStockType(e.target.value)} className={inputClassName()}>
                  <option value="">Select stock type</option>
                  <option value="Raw Material">Raw Material</option>
                  <option value="Work In Progress">Work In Progress</option>
                  <option value="Finished Goods">Finished Goods</option>
                  <option value="Semi-finished">Semi-finished</option>
                  <option value="Consumable">Consumable</option>
                  <option value="Other">Other</option>
                </select>
              </FieldShell>

              <FieldShell label="Category">
                <div className="flex gap-2">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClassName()}>
                    <option value="">Select category</option>
                    {categories.map((entry) => (
                      <option key={entry.id} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setCategoryModal(true)}>
                    New
                  </Button>
                </div>
              </FieldShell>

              <FieldShell label="Warehouse">
                <div className="flex gap-2">
                  <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={inputClassName()}>
                    <option value="">Select warehouse</option>
                    {warehouses.map((entry) => (
                      <option key={entry.id} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                    {warehouse && !warehouses.some((entry) => entry.name === warehouse) ? (
                      <option value={warehouse}>{warehouse} (current)</option>
                    ) : null}
                  </select>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setWarehouseModal(true)}>
                    New
                  </Button>
                </div>
              </FieldShell>

              <FieldShell label="External item name" hint="Optional code or linked accounting label.">
                <input
                  value={externalItemName}
                  onChange={(e) => setExternalItemName(e.target.value)}
                  className={inputClassName()}
                  placeholder="e.g. QuickBooks item code"
                />
              </FieldShell>

              {isCreateMode ? (
                <FieldShell label="Opening stock" hint="Starting quantity in the selected base unit.">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    className={inputClassName()}
                  />
                </FieldShell>
              ) : (
                <FieldShell label="Current stock" hint="Read-only current quantity in the base unit.">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-emerald-300">
                    {formatNumber(material.currentStock)}
                  </div>
                </FieldShell>
              )}

              <FieldShell label="Unit cost (AED)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className={inputClassName()}
                />
              </FieldShell>

              <FieldShell label="Reorder level">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  className={inputClassName()}
                />
              </FieldShell>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={isLoading}>
                {submitButtonText}
              </Button>
            </div>
          </SectionShell>

          {!isCreateMode ? (
            <SectionShell
              title="Units of measure"
              description="Define packaging or billing units while keeping all stock in the base unit."
            >
              {materialUoms.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-600/30 dark:bg-amber-950/20 dark:text-amber-100/90">
                  <p>No UOM chain exists yet.</p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const existingUnit = units.find((entry) => entry.name === unit.trim());
                        if (!existingUnit) {
                          toast.error('Select a base unit above that exists in Settings > Units');
                          return;
                        }
                        try {
                          await createMaterialUom({
                            materialId: material.id,
                            body: { mode: 'base', unitId: existingUnit.id },
                          }).unwrap();
                          toast.success('Base UOM created');
                        } catch (error: unknown) {
                          toast.error(extractErrorMessage(error, 'Failed to create base UOM'));
                        }
                      }}
                    >
                      Create base UOM from &quot;{unit || '...'}&quot;
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Parent</th>
                        <th className="px-4 py-3">Factor</th>
                        <th className="px-4 py-3">To base</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialUoms.map((row) => {
                        const parent = materialUoms.find((entry) => entry.id === row.parentUomId);
                        return (
                          <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800">
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.unitName}</td>
                            <td className="px-4 py-3">
                              <span
                                className={[
                                  'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                                  row.isBase
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                                ].join(' ')}
                              >
                                {row.isBase ? 'Base' : 'Derived'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{parent?.unitName ?? '-'}</td>
                            <td className="px-4 py-3 font-mono">{row.factorToParent}</td>
                            <td className="px-4 py-3 font-mono text-emerald-700 dark:text-emerald-300">{row.factorToBase}</td>
                            <td className="px-4 py-3 text-right">
                              {!row.isBase ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (!window.confirm(`Remove UOM "${row.unitName}"?`)) return;
                                    try {
                                      await deleteMaterialUom({ materialId: material.id, uomId: row.id }).unwrap();
                                      toast.success('UOM removed');
                                    } catch (error: unknown) {
                                      toast.error(extractErrorMessage(error, 'Failed to remove'));
                                    }
                                  }}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {materialUoms.some((entry) => entry.isBase) ? (
                <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 dark:border-slate-800 lg:grid-cols-[1.1fr_1fr_0.8fr_auto]">
                  <FieldShell label="Packaging unit">
                    <select value={deriveUnitId} onChange={(e) => setDeriveUnitId(e.target.value)} className={inputClassName()}>
                      <option value="">Select unit</option>
                      {availableDerivedUnits.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell label="Parent UOM">
                    <select value={deriveParentId} onChange={(e) => setDeriveParentId(e.target.value)} className={inputClassName()}>
                      <option value="">Select parent</option>
                      {materialUoms.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.unitName}
                          {entry.isBase ? ' (base)' : ` (=${entry.factorToBase} ${material.unit})`}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell label="Factor to parent">
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={deriveFactor}
                      onChange={(e) => setDeriveFactor(e.target.value)}
                      placeholder="e.g. 190"
                      className={inputClassName()}
                    />
                  </FieldShell>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={async () => {
                        const factor = parseFloat(deriveFactor);
                        if (!deriveUnitId || !deriveParentId || !factor || factor <= 0) {
                          toast.error('Select unit, parent, and a positive factor');
                          return;
                        }
                        try {
                          await createMaterialUom({
                            materialId: material.id,
                            body: {
                              mode: 'derived',
                              unitId: deriveUnitId,
                              parentUomId: deriveParentId,
                              factorToParent: factor,
                            },
                          }).unwrap();
                          setDeriveUnitId('');
                          setDeriveParentId('');
                          setDeriveFactor('');
                          toast.success('UOM added');
                        } catch (error: unknown) {
                          toast.error(extractErrorMessage(error, 'Failed to add UOM'));
                        }
                      }}
                    >
                      Add conversion
                    </Button>
                  </div>
                </div>
              ) : null}
            </SectionShell>
          ) : null}

          {!isCreateMode ? (
            <SectionShell
              title="Change history"
              description="Recent field changes and pricing adjustments stay visible in one place."
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-white">Material edits</h3>
                  <div className="space-y-3">
                    {materialLogs.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-500">No edits yet.</p>
                    ) : (
                      materialLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                              {log.action === 'created' ? 'Created' : 'Updated'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            Changed by <span className="text-slate-700 dark:text-slate-300">{log.changedBy || 'System'}</span>
                          </p>
                          <div className="mt-3 space-y-2">
                            {Object.entries(log.changes).map(([key, value]) => (
                              <div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-300">
                                <span className="font-medium text-slate-900 dark:text-slate-200">{key}</span>{' '}
                                <span className="text-red-600 dark:text-red-300">{String(value.from)}</span>{' '}
                                <span className="text-slate-400 dark:text-slate-600">→</span>{' '}
                                <span className="text-emerald-700 dark:text-emerald-300">{String(value.to)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-white">Price history</h3>
                  <div className="space-y-3">
                    {priceLogs.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-500">No price changes.</p>
                    ) : (
                      priceLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900 dark:text-slate-200">
                              {log.source === 'manual' ? 'Manual update' : 'Bill-linked'}
                            </span>
                            <span className={log.currentPrice > log.previousPrice ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
                              AED {log.previousPrice} → AED {log.currentPrice}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">{new Date(log.timestamp).toLocaleString()}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            Changed by <span className="text-slate-700 dark:text-slate-300">{log.changedBy || 'System'}</span>
                          </p>
                          {log.notes ? <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">{log.notes}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </SectionShell>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <SectionShell title="Quick summary" description="Key numbers stay pinned while you edit.">
            <div className="space-y-4">
              {[
                { label: 'Stock on hand', value: isCreateMode ? currentStock || '0' : formatNumber(material.currentStock) },
                { label: 'Reorder level', value: reorderLevel || formatNumber(material?.reorderLevel) },
                { label: 'Unit cost', value: unitCost ? `AED ${Number(unitCost || 0).toFixed(2)}` : formatMoney(material?.unitCost) },
                { label: 'Warehouse', value: warehouse || material?.warehouse || '-' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </SectionShell>

          <SectionShell title="Setup notes" description="Operational reminders for stock and conversion setup.">
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <p>Stock is always stored in the base unit, even when dispatch uses packaging units.</p>
              <p>Create the material first, then add drum, pallet, or bundle conversions in the UOM section.</p>
              <p>Price changes are logged automatically whenever unit cost is updated.</p>
            </div>
          </SectionShell>
        </aside>
      </div>

      <Modal isOpen={unitModal} onClose={() => setUnitModal(false)} title="Create New Unit">
        <form onSubmit={handleCreateUnit} className="space-y-4">
          <input
            type="text"
            required
            value={newUnitName}
            onChange={(e) => setNewUnitName(e.target.value)}
            placeholder="e.g. kg, meter, liter"
            className={inputClassName()}
            autoFocus
          />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setUnitModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={categoryModal} onClose={() => setCategoryModal(false)} title="Create New Category">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <input
            type="text"
            required
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="e.g. Resin, Steel"
            className={inputClassName()}
            autoFocus
          />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setCategoryModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={warehouseModal} onClose={() => setWarehouseModal(false)} title="Create New Warehouse">
        <form onSubmit={handleCreateWarehouse} className="space-y-4">
          <input
            type="text"
            required
            value={newWarehouseName}
            onChange={(e) => setNewWarehouseName(e.target.value)}
            placeholder="e.g. Main Warehouse"
            className={inputClassName()}
            autoFocus
          />
          <input
            type="text"
            value={newWarehouseLocation}
            onChange={(e) => setNewWarehouseLocation(e.target.value)}
            placeholder="Location (optional)"
            className={inputClassName()}
          />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setWarehouseModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function MaterialDetailPage() {
  const params = useParams();
  const materialId = params.id as string;
  const isCreateMode = materialId === 'new';

  const { data: material, isLoading: isLoadingMaterial } = useGetMaterialByIdQuery(materialId, {
    skip: isCreateMode,
  });
  const { data: units = [] } = useGetUnitsQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const { data: materialLogs = [] } = useGetMaterialLogsQuery(materialId, { skip: isCreateMode });
  const { data: priceLogs = [] } = useGetPriceLogsQuery(materialId, { skip: isCreateMode });

  if (!isCreateMode && isLoadingMaterial) {
    return <div className="text-sm text-slate-600 dark:text-slate-300">Loading material...</div>;
  }

  if (!isCreateMode && !material) {
    return <div className="text-sm text-slate-600 dark:text-slate-300">Material not found.</div>;
  }

  return (
    <MaterialEditor
      key={material?.id ?? 'new'}
      material={material}
      units={units}
      categories={categories}
      warehouses={warehouses}
      materialLogs={materialLogs as MaterialLogEntry[]}
      priceLogs={priceLogs as PriceLogEntry[]}
    />
  );
}
