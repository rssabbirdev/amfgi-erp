'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  useGetMaterialByIdQuery,
  useUpdateMaterialMutation,
  useCreateMaterialMutation,
  useCreateMaterialUomMutation,
  useDeleteMaterialUomMutation,
  useGetUnitsQuery,
  useCreateUnitMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useGetMaterialLogsQuery,
  useGetPriceLogsQuery,
  useCreateMaterialLogMutation,
  useCreatePriceLogMutation,
  type Material,
} from '@/store/hooks';

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const materialId = params.id as string;
  const isCreateMode = materialId === 'new';

  const { data: material, isLoading: isLoadingMaterial } = useGetMaterialByIdQuery(materialId, { skip: isCreateMode });
  const { data: units = [] } = useGetUnitsQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const { data: materialLogs = [] } = useGetMaterialLogsQuery(materialId, { skip: isCreateMode });
  const { data: priceLogs = [] } = useGetPriceLogsQuery(materialId, { skip: isCreateMode });

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

  // Form state - initialized with defaults
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [stockType, setStockType] = useState('');
  const [externalItemName, setExternalItemName] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [currentStock, setCurrentStock] = useState('0');

  const [deriveUnitId, setDeriveUnitId] = useState('');
  const [deriveParentId, setDeriveParentId] = useState('');
  const [deriveFactor, setDeriveFactor] = useState('');

  // Update form when material loads (edit mode)
  useEffect(() => {
    if (material && !isCreateMode) {
      setName(material.name || '');
      setDescription(material.description || '');
      setUnit(material.unit || '');
      setCategory(material.category || '');
      setWarehouse(material.warehouse || '');
      setStockType(material.stockType || '');
      setExternalItemName(material.externalItemName || '');
      setReorderLevel(material.reorderLevel?.toString() || '');
      setUnitCost(material.unitCost?.toString() || '');
    }
  }, [material, isCreateMode]);

  const handleSave = async () => {
    // Validation - same required fields for both create and edit
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

    const data = {
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
        // CREATE mode
        const result = await createMaterial(data).unwrap();

        // Log creation
        const changes: Record<string, any> = {
          name: { from: null, to: name },
          unit: { from: null, to: unit },
          category: { from: null, to: category },
          warehouse: { from: null, to: warehouse },
          stockType: { from: null, to: stockType },
          externalItemName: { from: null, to: externalItemName },
        };

        if (description) changes.description = { from: null, to: description };
        if (reorderLevel) changes.reorderLevel = { from: null, to: reorderLevel };

        await createMaterialLog({
          materialId: result.id,
          action: 'created',
          changes,
        }).unwrap();

        // Log initial price if set
        const newUnitCost = parseFloat(unitCost) || 0;
        if (newUnitCost > 0) {
          await createPriceLog({
            materialId: result.id,
            previousPrice: 0,
            currentPrice: newUnitCost,
            source: 'manual',
          }).unwrap();
        }

        toast.success('Material created successfully');
        router.push(`/materials/${result.id}`);
      } else {
        // UPDATE mode
        const previousUnitCost = material?.unitCost || 0;
        const newUnitCost = parseFloat(unitCost) || 0;

        await updateMaterial({ id: materialId, data }).unwrap();

        // Record only the changes that actually changed
        const changes: Record<string, any> = {};
        if (name !== material?.name) changes.name = { from: material?.name, to: name };
        if (description !== material?.description) changes.description = { from: material?.description || '(empty)', to: description || '(empty)' };
        if (unit !== material?.unit) changes.unit = { from: material?.unit, to: unit };
        if (category !== material?.category) changes.category = { from: material?.category, to: category };
        if (warehouse !== material?.warehouse) changes.warehouse = { from: material?.warehouse, to: warehouse };
        if (stockType !== material?.stockType) changes.stockType = { from: material?.stockType, to: stockType };
        if (externalItemName !== material?.externalItemName) changes.externalItemName = { from: material?.externalItemName, to: externalItemName };
        if (reorderLevel !== (material?.reorderLevel?.toString() || '')) changes.reorderLevel = { from: material?.reorderLevel || 0, to: parseFloat(reorderLevel) || 0 };

        if (Object.keys(changes).length > 0) {
          await createMaterialLog({
            materialId,
            action: 'updated',
            changes,
          }).unwrap();
        }

        // Log price change if different
        if (previousUnitCost !== newUnitCost) {
          await createPriceLog({
            materialId,
            previousPrice: previousUnitCost,
            currentPrice: newUnitCost,
            source: 'manual',
          }).unwrap();
        }

        toast.success('Material updated successfully');
      }
    } catch (err: any) {
      toast.error(err?.data?.error ?? (isCreateMode ? 'Failed to create material' : 'Failed to update material'));
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
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to create unit');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      const newCat = await createCategory({ name: newCategoryName.trim() }).unwrap();
      setCategory(newCat.name);
      setNewCategoryName('');
      setCategoryModal(false);
      toast.success('Category created');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to create category');
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) {
      toast.error('Warehouse name is required');
      return;
    }
    try {
      const newWh = await createWarehouse({
        name: newWarehouseName.trim(),
        location: newWarehouseLocation.trim() || undefined,
      }).unwrap();
      setWarehouse(newWh.name);
      setNewWarehouseName('');
      setNewWarehouseLocation('');
      setWarehouseModal(false);
      toast.success('Warehouse created');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to create warehouse');
    }
  };

  if (!isCreateMode && isLoadingMaterial) {
    return <div className="text-white">Loading...</div>;
  }

  if (!isCreateMode && !material) {
    return <div className="text-white">Material not found</div>;
  }

  const isLoading = isCreateMode ? isCreating : isUpdating;
  const pageTitle = isCreateMode ? 'Create New Material' : material?.name || 'Material';
  const pageSubtitle = isCreateMode ? '' : 'Edit material details';
  const submitButtonText = isCreateMode ? 'Create Material' : 'Save Changes';

  return (
    <div className={isCreateMode ? 'max-w-2xl mx-auto' : 'flex gap-6 h-full'}>
      {/* Main Content */}
      <div className={isCreateMode ? 'space-y-6' : 'flex-1 space-y-6 overflow-y-auto pr-2'}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={isCreateMode ? 'text-2xl font-bold text-white' : 'text-3xl font-bold text-white'}>{pageTitle}</h1>
            {pageSubtitle && <p className="text-slate-400 text-sm mt-1">{pageSubtitle}</p>}
          </div>
          {!isCreateMode && (
            <Button onClick={() => router.back()} variant="secondary">
              ← Back
            </Button>
          )}
        </div>

        {/* Form */}
        <div className={isCreateMode ? 'bg-slate-800 rounded-lg border border-slate-700 p-6' : 'bg-slate-800 rounded-lg border border-slate-700 p-6'}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Item Name */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Item Name {isCreateMode && '*'}</label>
                <input
                  required={isCreateMode}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  placeholder={isCreateMode ? 'e.g. Fiberglass Mat 300gsm' : ''}
                  autoFocus={isCreateMode}
                />
              </div>

              {/* Description */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  rows={2}
                />
              </div>

              {/* Base unit */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Base unit (stock) {isCreateMode && '*'}
                </label>
                <div className="flex gap-2">
                  <select
                    required={isCreateMode}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Unit --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setUnitModal(true)}>
                    + New
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Inventory and transactions store quantities in this unit. Add drum/pallet (etc.) on the UOM panel after
                  save.
                </p>
              </div>

              {/* Stock Type */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Stock Type {isCreateMode && '*'}</label>
                <select
                  required={isCreateMode}
                  value={stockType}
                  onChange={(e) => setStockType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Select Stock Type --</option>
                  <option value="Raw Material">Raw Material</option>
                  <option value="Work In Progress">Work In Progress</option>
                  <option value="Finished Goods">Finished Goods</option>
                  <option value="Semi-finished">Semi-finished</option>
                  <option value="Consumable">Consumable</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
                <div className="flex gap-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setCategoryModal(true)}>
                    + New
                  </Button>
                </div>
              </div>

              {/* Warehouse */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Warehouse</label>
                <div className="flex gap-2">
                  <select
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Warehouse --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.name}>
                        {w.name}
                      </option>
                    ))}
                    {warehouse && !warehouses.some(w => w.name === warehouse) && (
                      <option value={warehouse} className="text-slate-400">{warehouse} (current)</option>
                    )}
                  </select>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setWarehouseModal(true)}>
                    + New
                  </Button>
                </div>
              </div>

              {/* External Item Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">External Item Name</label>
                <input
                  value={externalItemName}
                  onChange={(e) => setExternalItemName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  placeholder={isCreateMode ? 'e.g. QuickBooks item code' : ''}
                />
              </div>

              {/* Opening Stock (Create mode only) */}
              {isCreateMode && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Opening Stock</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Unit Cost */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Cost (AED) {isCreateMode && '*'}</label>
                <input
                  type="number"
                  required={isCreateMode}
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Reorder Level */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Reorder Level</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Stock Info (Edit mode only) */}
              {!isCreateMode && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Stock</label>
                  <div className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-emerald-400 text-sm">
                    {material?.currentStock}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => router.back()} fullWidth>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={isLoading} fullWidth>
                {submitButtonText}
              </Button>
            </div>
          </div>
        </div>

        {!isCreateMode && material && (
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Units of measure (billing / dispatch)</h3>
            <p className="text-sm text-slate-400">
              Example: base <span className="text-slate-300">kg</span> → add <span className="text-slate-300">drum</span>{' '}
              with parent base and factor <span className="text-slate-300">190</span> (1 drum = 190 kg) → add{' '}
              <span className="text-slate-300">pallet</span> with parent drum and factor <span className="text-slate-300">6</span>{' '}
              (1 pallet = 1140 kg).
            </p>

            {(!material.materialUoms || material.materialUoms.length === 0) && (
              <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-3 text-sm text-amber-100/90">
                No UOM chain yet.{' '}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="ml-2"
                  onClick={async () => {
                    const u = units.find((x) => x.name === unit.trim());
                    if (!u) {
                      toast.error('Select a base unit above that exists in Settings → Units');
                      return;
                    }
                    try {
                      await createMaterialUom({
                        materialId: material.id,
                        body: { mode: 'base', unitId: u.id },
                      }).unwrap();
                      toast.success('Base UOM created');
                    } catch (err: any) {
                      toast.error(err?.data?.error ?? 'Failed to create base UOM');
                    }
                  }}
                >
                  Create base UOM from &quot;{unit || '…'}&quot;
                </Button>
              </div>
            )}

            {material.materialUoms && material.materialUoms.length > 0 && (
              <div className="overflow-x-auto rounded border border-slate-600">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Parent</th>
                      <th className="px-3 py-2">Factor</th>
                      <th className="px-3 py-2">= base ({material.unit})</th>
                      <th className="px-3 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {material.materialUoms.map((row) => {
                      const parent = material.materialUoms!.find((p) => p.id === row.parentUomId);
                      return (
                        <tr key={row.id} className="border-t border-slate-700">
                          <td className="px-3 py-2 text-white">{row.unitName}</td>
                          <td className="px-3 py-2 text-slate-300">{row.isBase ? 'Base' : 'Derived'}</td>
                          <td className="px-3 py-2 text-slate-400">{parent?.unitName ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-300">{row.factorToParent}</td>
                          <td className="px-3 py-2 font-mono text-emerald-300/90">{row.factorToBase}</td>
                          <td className="px-3 py-2">
                            {!row.isBase && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  if (!window.confirm(`Remove UOM “${row.unitName}”?`)) return;
                                  try {
                                    await deleteMaterialUom({ materialId: material.id, uomId: row.id }).unwrap();
                                    toast.success('UOM removed');
                                  } catch (err: any) {
                                    toast.error(err?.data?.error ?? 'Failed to remove');
                                  }
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {material.materialUoms?.some((x) => x.isBase) && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t border-slate-700 pt-4">
                <div className="md:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1">Packaging unit</label>
                  <select
                    value={deriveUnitId}
                    onChange={(e) => setDeriveUnitId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="">— Select —</option>
                    {units
                      .filter((u) => !material.materialUoms?.some((m) => m.unitId === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1">Parent UOM</label>
                  <select
                    value={deriveParentId}
                    onChange={(e) => setDeriveParentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                  >
                    <option value="">— Select —</option>
                    {material.materialUoms?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitName}
                        {u.isBase ? ' (base)' : ` (=${u.factorToBase} ${material.unit})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">1 new unit = × parent</label>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={deriveFactor}
                    onChange={(e) => setDeriveFactor(e.target.value)}
                    placeholder="e.g. 190 or 6"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                  />
                </div>
                <div>
                  <Button
                    type="button"
                    onClick={async () => {
                      const f = parseFloat(deriveFactor);
                      if (!deriveUnitId || !deriveParentId || !f || f <= 0) {
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
                            factorToParent: f,
                          },
                        }).unwrap();
                        setDeriveUnitId('');
                        setDeriveParentId('');
                        setDeriveFactor('');
                        toast.success('UOM added');
                      } catch (err: any) {
                        toast.error(err?.data?.error ?? 'Failed to add UOM');
                      }
                    }}
                  >
                    Add conversion
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit History (Edit mode only) */}
        {!isCreateMode && (
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Edit History</h3>
            <div className="space-y-3">
              {materialLogs.length === 0 ? (
                <p className="text-sm text-slate-400">No edits yet</p>
              ) : (
                materialLogs.map((log: any) => (
                  <div key={log.id} className="text-sm bg-slate-700/40 border border-slate-600 rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-emerald-400">{log.action === 'created' ? '✨ Created' : '📝 Updated'}</span>
                      <span className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-slate-400">Changed by: <span className="text-slate-300">{log.changedBy || 'System'}</span></div>
                    <div className="space-y-1 mt-2">
                      {Object.entries(log.changes).map(([key, value]: [string, any]) => (
                        <div key={key} className="text-xs text-slate-300 bg-slate-800/60 rounded p-1.5 pl-2">
                          <span className="font-medium text-slate-200">{key}:</span> <span className="text-red-300">{value.from}</span> <span className="text-slate-500">→</span> <span className="text-emerald-300">{value.to}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Price History (Edit mode only) */}
      {!isCreateMode && (
        <div className="w-80 flex flex-col sticky top-0 h-screen overflow-y-auto">
          {/* Price Logs */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Price History</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {priceLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No price changes</p>
              ) : (
                priceLogs.map((log: any) => (
                  <div key={log.id} className="text-xs bg-slate-700/50 rounded p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-300">
                        {log.source === 'manual' ? '✏️ Manual' : '📄 Bill'}
                      </span>
                      <span className={log.currentPrice > log.previousPrice ? 'text-red-400' : 'text-emerald-400'}>
                        AED {log.previousPrice} → AED {log.currentPrice}
                      </span>
                    </div>
                    <div className="text-slate-400 text-xs">Changed by: <span className="text-slate-300">{log.changedBy || 'System'}</span></div>
                    <div className="text-slate-400">{new Date(log.timestamp).toLocaleString()}</div>
                    {log.notes && <div className="text-slate-400 italic">{log.notes}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={unitModal} onClose={() => setUnitModal(false)} title="Create New Unit">
        <form onSubmit={handleCreateUnit} className="space-y-4">
          <input
            type="text"
            required
            value={newUnitName}
            onChange={(e) => setNewUnitName(e.target.value)}
            placeholder="e.g., kg, meter, liter"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
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
            placeholder="e.g., Resin, Steel"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
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
            placeholder="e.g., Main Warehouse"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
          <input
            type="text"
            value={newWarehouseLocation}
            onChange={(e) => setNewWarehouseLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
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
