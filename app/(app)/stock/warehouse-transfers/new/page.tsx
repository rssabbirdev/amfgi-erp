'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import DispatchLineGrid from '@/components/stock/DispatchLineGrid';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import {
  useGetMaterialsQuery,
  useGetWarehousesQuery,
  useWarehouseTransferStockMutation,
  type Material,
  type MaterialUomDto,
} from '@/store/hooks';

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const MIN_VISIBLE_ROWS = 5;
const MIN_EMPTY_ROWS = 3;

interface Line {
  id: string;
  jobId: string;
  materialId: string;
  dispatchQty: string;
  returnQty: string;
  quantityUomId: string;
  warehouseId: string;
  targetWarehouseId?: string;
  materialLineId?: string;
  issuedQty?: number;
  receivedQty?: number;
  outstandingQty?: number;
  receiveQty?: string;
  receiveDestWarehouseId?: string;
}

function emptyLine(sourceWarehouseId = ''): Line {
  return {
    id: generateId(),
    jobId: 'warehouse-transfer',
    materialId: '',
    dispatchQty: '',
    returnQty: '',
    quantityUomId: '',
    warehouseId: sourceWarehouseId,
  };
}

function isLineEmpty(line: Line) {
  return !line.materialId && !line.dispatchQty;
}

function normalizeLines(lines: Line[], sourceWarehouseId = '') {
  const nonEmptyLines = lines.filter((line) => !isLineEmpty(line));
  const requiredEmptyRows = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmptyLines.length);
  return [...nonEmptyLines, ...Array.from({ length: requiredEmptyRows }, () => emptyLine(sourceWarehouseId))];
}

function qtyInBase(uoms: MaterialUomDto[] | undefined, quantityUomId: string, qty: number): number {
  if (!uoms?.length || !quantityUomId.trim()) return qty;
  const u = uoms.find((x) => x.id === quantityUomId);
  if (!u) return qty;
  return qty * u.factorToBase;
}

function getWarehouseBaseStock(material: Material | undefined, warehouseId: string) {
  if (!material || !warehouseId) return 0;
  return material.materialWarehouseStocks?.find((stock) => stock.warehouseId === warehouseId)?.currentStock ?? 0;
}

export default function NewWarehouseTransferPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canTransfer = isSA || perms.includes('stock.warehouse_transfer.transfer');
  const activeCompanyId = session?.user?.activeCompanyId ?? '';

  const { data: materials = [] } = useGetMaterialsQuery(undefined, { skip: !canTransfer });
  const { data: warehouses = [] } = useGetWarehousesQuery(activeCompanyId || undefined, {
    skip: !canTransfer || !activeCompanyId,
  });
  const [warehouseTransferStock, { isLoading: submitting }] = useWarehouseTransferStockMutation();

  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [lines, setLines] = useState<Line[]>(() => normalizeLines([emptyLine()]));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const activeMaterials = useMemo(
    () => materials.filter((material) => material.isActive),
    [materials],
  );

  const gridEnabled = Boolean(
    sourceWarehouseId && destinationWarehouseId && sourceWarehouseId !== destinationWarehouseId,
  );

  useEffect(() => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => ({
          ...line,
          warehouseId: sourceWarehouseId,
          ...(line.materialId && !line.warehouseId ? {} : {}),
        })),
        sourceWarehouseId,
      ),
    );
  }, [sourceWarehouseId]);

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => {
          if (line.id !== id) return line;
          if (field === 'materialId' && !value) {
            return emptyLine(sourceWarehouseId);
          }
          return {
            ...line,
            [field]: value,
            warehouseId: sourceWarehouseId,
            ...(field === 'materialId'
              ? {
                  quantityUomId: '',
                }
              : {}),
          };
        }),
        sourceWarehouseId,
      ),
    );
  };

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceWarehouseId || !destinationWarehouseId) {
      toast.error('Select source and destination warehouses');
      return;
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      toast.error('Source and destination warehouse must be different');
      return;
    }

    const validLines = lines.filter((line) => line.materialId && line.dispatchQty);
    if (validLines.length === 0) {
      toast.error('Add at least one material line');
      return;
    }

    const materialIds = new Set<string>();
    for (const line of validLines) {
      if (materialIds.has(line.materialId)) {
        toast.error('Each material can only appear once — combine quantities on one row');
        return;
      }
      materialIds.add(line.materialId);

      const qty = Number.parseFloat(line.dispatchQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Enter a valid quantity on every line');
        return;
      }

      const mat = activeMaterials.find((m) => m.id === line.materialId);
      if (!mat) continue;

      const baseQty = qtyInBase(mat.materialUoms, line.quantityUomId, qty);
      if (!mat.allowNegativeConsumption) {
        const available = getWarehouseBaseStock(mat, sourceWarehouseId);
        if (available + 0.0005 < baseQty) {
          toast.error(
            `Insufficient stock for ${mat.name} at source warehouse. Requested: ${baseQty.toFixed(3)} ${mat.unit}, Available: ${available.toFixed(3)} ${mat.unit}`,
          );
          return;
        }
      }
    }

    try {
      const result = await warehouseTransferStock({
        sourceWarehouseId,
        destinationWarehouseId,
        date,
        notes: notes.trim() || undefined,
        lines: validLines.map((line) => ({
          materialId: line.materialId,
          quantity: Number.parseFloat(line.dispatchQty),
          quantityUomId: line.quantityUomId.trim() || undefined,
        })),
      }).unwrap();

      if ('lineCount' in result) {
        toast.success(
          `Transferred ${result.lineCount} material(s) from ${result.sourceWarehouse} to ${result.destinationWarehouse}`,
        );
      } else {
        toast.success(
          `Transferred ${result.transferredQty} of ${result.materialName} from ${result.sourceWarehouse} to ${result.destinationWarehouse}`,
        );
      }

      setSourceWarehouseId('');
      setDestinationWarehouseId('');
      setLines(normalizeLines([emptyLine()]));
      setNotes('');
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Warehouse transfer failed';
      toast.error(message);
    }
  };

  if (!canTransfer) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Warehouse transfer</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to create warehouse transfers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 overflow-x-hidden">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/warehouse-transfers"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Warehouse transfers
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Warehouse transfer worksheet</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Move multiple materials between warehouses in one entry. Company total quantity stays the same; FIFO
            layers move from source to destination.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Link
            href="/stock/warehouse-transfers"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
          >
            Cancel
          </Link>
          <Button type="submit" form="warehouse-transfer-form" size="sm" disabled={submitting}>
            {submitting ? 'Transferring…' : 'Transfer stock'}
          </Button>
        </div>
      </header>

      <form
        id="warehouse-transfer-form"
        onSubmit={(e) => void validateAndSubmit(e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="flex flex-col gap-0 overflow-x-auto rounded-lg border border-border bg-card pb-8 shadow-sm sm:pb-10"
      >
        <div className="border-b border-border p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <SearchSelect
              label="From warehouse"
              value={sourceWarehouseId}
              onChange={setSourceWarehouseId}
              placeholder="Source warehouse..."
              dropdownInPortal
              items={warehouses.map((warehouse) => ({
                id: warehouse.id,
                label: warehouse.name,
              }))}
            />
            <SearchSelect
              label="To warehouse"
              value={destinationWarehouseId}
              onChange={setDestinationWarehouseId}
              placeholder="Destination warehouse..."
              dropdownInPortal
              items={warehouses
                .filter((warehouse) => warehouse.id !== sourceWarehouseId)
                .map((warehouse) => ({
                  id: warehouse.id,
                  label: warehouse.name,
                }))}
            />
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this transfer"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        </div>

        <DispatchLineGrid
          lines={lines}
          materials={activeMaterials}
          warehouses={warehouses}
          selectedJob="warehouse-transfer"
          showWarehouseColumn={false}
          emptyMessage={
            gridEnabled
              ? 'Add materials below. Warehouse stock shows balances at the source warehouse.'
              : 'Select source and destination warehouses to add lines.'
          }
          onUpdateLine={updateLine}
          persistScope="warehouse-transfer"
          variant="warehouse-transfer"
          gridEnabled={gridEnabled}
        />
      </form>
    </div>
  );
}
