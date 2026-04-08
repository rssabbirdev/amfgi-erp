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
} from '@/store/hooks';

interface Material {
  _id: string;
  name: string;
  description?: string;
  unit: string;
  category: string;
  warehouse: string;
  stockType: string;
  externalItemName: string;
  currentStock: number;
  reorderLevel: number;
  unitCost: number;
  isActive: boolean;
  createdAt: Date;
}

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const materialId = params.id as string;

  const { data: material, isLoading: isLoadingMaterial } = useGetMaterialByIdQuery(materialId);
  const { data: units = [] } = useGetUnitsQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const { data: materialLogs = [] } = useGetMaterialLogsQuery(materialId);
  const { data: priceLogs = [] } = useGetPriceLogsQuery(materialId);

  const [updateMaterial, { isLoading: isUpdating }] = useUpdateMaterialMutation();
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

  // Update form when material loads
  useEffect(() => {
    if (material) {
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
  }, [material]);

  const handleSave = async () => {
    if (!category.trim()) {
      toast.error('Category is required');
      return;
    }
    if (!warehouse.trim()) {
      toast.error('Warehouse is required');
      return;
    }
    if (!stockType.trim()) {
      toast.error('Stock Type is required');
      return;
    }

    const previousUnitCost = material?.unitCost || 0;
    const newUnitCost = parseFloat(unitCost) || 0;

    const data = {
      name: name.trim(),
      description: description || undefined,
      unit,
      category: category.trim(),
      warehouse: warehouse.trim(),
      stockType: stockType.trim(),
      externalItemName: externalItemName.trim(),
      reorderLevel: reorderLevel ? parseFloat(reorderLevel) : undefined,
      unitCost: newUnitCost,
    };

    try {
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
      // Return to materials page after successful save
      setTimeout(() => router.back(), 800);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to update material');
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

  if (isLoadingMaterial) {
    return <div className="text-white">Loading...</div>;
  }

  if (!material) {
    return <div className="text-white">Material not found</div>;
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Main Content */}
      <div className="flex-1 space-y-6 overflow-y-auto pr-2">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">{material.name}</h1>
            <p className="text-slate-400 text-sm mt-1">Edit material details</p>
          </div>
          <Button onClick={() => router.back()} variant="secondary">
            ← Back
          </Button>
        </div>

        {/* Form */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Item Name */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Item Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
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

            {/* Unit */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit</label>
              <div className="flex gap-2">
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Select Unit --</option>
                  {units.map((u) => (
                    <option key={u._id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="secondary" onClick={() => setUnitModal(true)}>
                  + New
                </Button>
              </div>
            </div>

            {/* Stock Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Stock Type</label>
              <select
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
                    <option key={c._id} value={c.name}>
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
                  required
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Select Warehouse --</option>
                  {warehouses.map((w) => (
                    <option key={w._id} value={w.name}>
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
              />
            </div>

            {/* Unit Cost */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Cost (AED)</label>
              <input
                type="number"
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

            {/* Stock Info */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Stock</label>
              <div className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-emerald-400 text-sm">
                {material.currentStock}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()} fullWidth>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={isUpdating} fullWidth>
              Save Changes
            </Button>
          </div>
        </div>

        {/* Edit History Below Form */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Edit History</h3>
          <div className="space-y-3">
            {materialLogs.length === 0 ? (
              <p className="text-sm text-slate-400">No edits yet</p>
            ) : (
              materialLogs.map((log: any) => (
                <div key={log._id} className="text-sm bg-slate-700/40 border border-slate-600 rounded p-3 space-y-2">
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
      </div>

      {/* Right Sidebar - Price History */}
      <div className="w-80 flex flex-col sticky top-0 h-screen overflow-y-auto">
        {/* Price Logs */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Price History</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {priceLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No price changes</p>
            ) : (
              priceLogs.map((log: any) => (
                <div key={log._id} className="text-xs bg-slate-700/50 rounded p-2 space-y-1">
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
