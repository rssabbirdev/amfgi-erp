'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  useCreateMaterialMutation,
  useGetUnitsQuery,
  useCreateUnitMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
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

export default function CreateMaterialPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const { data: units = [] } = useGetUnitsQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();

  const [createMaterial, { isLoading: isCreating }] = useCreateMaterialMutation();
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

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [stockType, setStockType] = useState('');
  const [externalItemName, setExternalItemName] = useState('');
  const [currentStock, setCurrentStock] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('');
  const [unitCost, setUnitCost] = useState('');

  // Set default warehouse on load
  useEffect(() => {
    if (warehouses.length > 0 && !warehouse) {
      setWarehouse(warehouses[0].name);
    }
  }, [warehouses]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Item Name is required');
      return;
    }
    if (!unit.trim()) {
      toast.error('Unit is required');
      return;
    }
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
    if (!externalItemName.trim()) {
      toast.error('External Item Name is required');
      return;
    }

    const data = {
      name: name.trim(),
      description: description || undefined,
      unit: unit.trim(),
      category: category.trim(),
      warehouse: warehouse.trim(),
      stockType: stockType.trim(),
      externalItemName: externalItemName.trim(),
      currentStock: parseFloat(currentStock) || 0,
      reorderLevel: reorderLevel ? parseFloat(reorderLevel) : undefined,
      unitCost: unitCost ? parseFloat(unitCost) : undefined,
    };

    try {
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
        materialId: result._id,
        action: 'created',
        changes,
      }).unwrap();

      // Log initial price if set
      const newUnitCost = parseFloat(unitCost) || 0;
      if (newUnitCost > 0) {
        await createPriceLog({
          materialId: result._id,
          previousPrice: 0,
          currentPrice: newUnitCost,
          source: 'manual',
        }).unwrap();
      }

      toast.success('Material created successfully');
      router.push(`/materials/${result._id}`);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to create material');
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
      const newWh = await createWarehouse({ name: newWarehouseName.trim(), location: newWarehouseLocation.trim() || undefined }).unwrap();
      setWarehouse(newWh.name);
      setNewWarehouseName('');
      setNewWarehouseLocation('');
      setWarehouseModal(false);
      toast.success('Warehouse created');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to create warehouse');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-emerald-400 hover:text-emerald-300 text-sm font-medium flex items-center gap-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-white mt-3">Create New Material</h1>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Item Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Fiberglass Mat 300gsm"
                autoFocus
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Item description (optional)"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit *</label>
              <div className="flex gap-2">
                <select
                  required
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
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setUnitModal(true)}
                >
                  + New
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Stock Type *</label>
              <select
                required
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

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">External Item Name *</label>
              <input
                required
                value={externalItemName}
                onChange={(e) => setExternalItemName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. QuickBooks item code"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Category *</label>
              <div className="flex gap-2">
                <select
                  required
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
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setCategoryModal(true)}
                >
                  + New
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Warehouse *</label>
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
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setWarehouseModal(true)}
                >
                  + New
                </Button>
              </div>
            </div>

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

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Reorder Level</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Alert threshold"
              />
            </div>

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
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={() => router.back()} fullWidth>
              Cancel
            </Button>
            <Button type="submit" loading={isCreating} fullWidth>
              Create Material
            </Button>
          </div>
        </form>
      </div>

      {/* Create Unit Modal */}
      <Modal isOpen={unitModal} onClose={() => setUnitModal(false)} title="Create New Unit">
        <form onSubmit={handleCreateUnit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Name *</label>
            <input
              type="text"
              required
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              placeholder="e.g., kg, meter, liter, pcs"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setUnitModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create Unit
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Category Modal */}
      <Modal isOpen={categoryModal} onClose={() => setCategoryModal(false)} title="Create New Category">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category Name *</label>
            <input
              type="text"
              required
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g., Resin, Steel, Fabric"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setCategoryModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Warehouse Modal */}
      <Modal isOpen={warehouseModal} onClose={() => setWarehouseModal(false)} title="Create New Warehouse">
        <form onSubmit={handleCreateWarehouse} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Warehouse Name *</label>
            <input
              type="text"
              required
              value={newWarehouseName}
              onChange={(e) => setNewWarehouseName(e.target.value)}
              placeholder="e.g., Main Warehouse, Dubai Warehouse"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Location</label>
            <input
              type="text"
              value={newWarehouseLocation}
              onChange={(e) => setNewWarehouseLocation(e.target.value)}
              placeholder="e.g., Al Quoz Industrial Area"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setWarehouseModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create Warehouse
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
