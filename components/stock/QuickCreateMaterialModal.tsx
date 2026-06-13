'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { Button } from '@/components/ui/shadcn/button';
import toast from 'react-hot-toast';
import {
  useCreateMaterialMutation,
  useGetCategoriesQuery,
  useGetUnitsQuery,
  type Material,
} from '@/store/hooks';

const STOCK_TYPE_OPTIONS = [
  'Raw Material',
  'Work In Progress',
  'Finished Goods',
  'Semi-finished',
  'Asset',
  'Service',
  'Stock Assembly',
  'Non-Stock',
  'Other',
].map((label) => ({ id: label, label }));

function inputClassName() {
  return 'w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
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

type WarehouseOption = { id: string; name: string };

interface QuickCreateMaterialModalProps {
  isOpen: boolean;
  defaultName: string;
  warehouses: WarehouseOption[];
  onClose: () => void;
  onCreated: (material: Material) => void;
}

export default function QuickCreateMaterialModal({
  isOpen,
  defaultName,
  warehouses,
  onClose,
  onCreated,
}: QuickCreateMaterialModalProps) {
  const { data: units = [] } = useGetUnitsQuery(undefined, { skip: !isOpen });
  const { data: categories = [] } = useGetCategoriesQuery(undefined, { skip: !isOpen });
  const [createMaterial, { isLoading }] = useCreateMaterialMutation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [stockType, setStockType] = useState('Raw Material');
  const [category, setCategory] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [unitCost, setUnitCost] = useState('');

  const warehouseItems = useMemo(
    () => warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name })),
    [warehouses],
  );
  const unitItems = useMemo(() => units.map((entry) => ({ id: entry.name, label: entry.name })), [units]);
  const categoryItems = useMemo(
    () => categories.map((entry) => ({ id: entry.name, label: entry.name })),
    [categories],
  );

  useEffect(() => {
    if (!isOpen) return;
    setName(defaultName.trim());
    setDescription('');
    setUnit('');
    setStockType('Raw Material');
    setCategory('');
    setWarehouseId('');
    setUnitCost('');
  }, [defaultName, isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!unit.trim()) {
      toast.error('Base unit is required');
      return;
    }
    if (!stockType.trim()) {
      toast.error('Stock type is required');
      return;
    }
    if (stockType !== 'Stock Assembly' && !unitCost.trim()) {
      toast.error('Unit cost is required');
      return;
    }

    const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId);

    try {
      const material = await createMaterial({
        name: name.trim(),
        description: description.trim() || undefined,
        unit: unit.trim(),
        stockType: stockType.trim(),
        category: category.trim() || undefined,
        warehouse: selectedWarehouse?.name,
        warehouseId: warehouseId || undefined,
        unitCost: unitCost.trim() ? parseFloat(unitCost) : undefined,
        currentStock: 0,
      }).unwrap();

      toast.success(`Material "${material.name}" created`);
      onCreated(material);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to create material'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create material"
      description="Add a new item and continue on the same receipt line."
      size="lg"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" form="quick-create-material-form" disabled={isLoading}>
            {isLoading ? 'Saving…' : 'Save material'}
          </Button>
        </>
      }
    >
      <form id="quick-create-material-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Item name <span className="text-destructive">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName()}
            autoFocus
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClassName()}
            rows={2}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Base unit <span className="text-destructive">*</span>
          </label>
          <SearchSelect
            items={unitItems}
            value={unit}
            onChange={setUnit}
            placeholder="Select unit"
            openOnFocus
            dropdownInPortal
            inputProps={{ className: inputClassName() }}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Stock type <span className="text-destructive">*</span>
          </label>
          <SearchSelect
            items={STOCK_TYPE_OPTIONS}
            value={stockType}
            onChange={setStockType}
            placeholder="Select stock type"
            openOnFocus
            dropdownInPortal
            inputProps={{ className: inputClassName() }}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Category
          </label>
          <SearchSelect
            items={categoryItems}
            value={category}
            onChange={setCategory}
            placeholder="Select category"
            openOnFocus
            dropdownInPortal
            inputProps={{ className: inputClassName() }}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Warehouse
          </label>
          <SearchSelect
            items={warehouseItems}
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder="Select warehouse"
            openOnFocus
            dropdownInPortal
            inputProps={{ className: inputClassName() }}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Unit cost <span className="text-destructive">*</span>
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className={inputClassName()}
            placeholder="0.00"
          />
        </div>
      </form>
    </Modal>
  );
}
