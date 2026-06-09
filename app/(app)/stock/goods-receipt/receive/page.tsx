'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import ScheduleSearchSelect from '@/components/hr/ScheduleSearchSelect';
import GoodsReceiptLineGrid from '@/components/stock/GoodsReceiptLineGrid';
import {
  usePagedMaterialSearch,
  usePagedSupplierSearch,
  type SupplierSelectItem,
} from '@/lib/stock/pagedSelectSearch';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import {
  useAddBatchTransactionMutation,
  useDeleteReceiptEntryMutation,
  useGetReceiptEntryQuery,
  useGetWarehousesQuery,
  type Material,
} from '@/store/hooks';
import {
  convertLineQuantity,
  convertLineUnitCost,
  defaultDisplayUnitCost,
} from '@/lib/stock/uomLineDisplay';
import { cn } from '@/lib/utils';

interface LineItem {
  id: string;
  materialId: string;
  quantity: string;
  quantityUomId: string;
  unitCost: string;
  warehouseId: string;
}

const TAX_RATE = 0.05;
const MIN_VISIBLE_ROWS = 5;
const MIN_EMPTY_ROWS = 3;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function buildDraftReceiptNumber() {
  // const now = new Date();
  // const yyyy = now.getFullYear();
  // const mm = String(now.getMonth() + 1).padStart(2, '0');
  // const dd = String(now.getDate()).padStart(2, '0');
  // const rand = Math.floor(Math.random() * 900 + 100);
  // return `GRN-${yyyy}${mm}${dd}-${rand}`;
  return ""
}

function emptyLine(): LineItem {
  return { id: uid(), materialId: '', quantity: '', quantityUomId: '', unitCost: '', warehouseId: '' };
}

function isLineEmpty(line: LineItem) {
  return !line.materialId && !line.quantity && !line.quantityUomId && !line.unitCost;
}

function normalizeLines(lines: LineItem[]) {
  const nonEmptyLines = lines.filter((line) => !isLineEmpty(line));
  const requiredEmptyRows = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmptyLines.length);
  return [...nonEmptyLines, ...Array.from({ length: requiredEmptyRows }, () => emptyLine())];
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

function sectionHeadingClassName() {
  return 'text-sm font-semibold uppercase tracking-wide text-muted-foreground';
}

function ReceiptEditor({
  initialReceiptNumber,
  initialSupplierName,
  initialDate,
  initialNotes,
  initialLines,
  isEditMode,
  editReceiptNumber,
}: {
  initialReceiptNumber: string;
  initialSupplierName: string;
  initialDate: string;
  initialNotes: string;
  initialLines: LineItem[];
  isEditMode: boolean;
  editReceiptNumber: string | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const { search: searchMaterials, resolveById: resolveMaterialById } = usePagedMaterialSearch();
  const { search: searchSuppliers, resolveById: resolveSupplierById, resolveByName: resolveSupplierByName } =
    usePagedSupplierSearch();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();
  const [deleteReceiptEntry] = useDeleteReceiptEntryMutation();

  const [lines, setLines] = useState<LineItem[]>(() =>
    normalizeLines(initialLines.length > 0 ? initialLines : [emptyLine()])
  );
  const [receiptNumber, setReceiptNumber] = useState(initialReceiptNumber);
  const [supplierId, setSupplierId] = useState('');
  const [supplierKnownItem, setSupplierKnownItem] = useState<SupplierSelectItem | null>(null);
  const [date, setDate] = useState(initialDate);
  const [notes, setNotes] = useState(initialNotes);
  const [includeTax, setIncludeTax] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [materialsById, setMaterialsById] = useState<Record<string, Material>>({});

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canPost = isSA || perms.includes('transaction.stock_in');
  const showWarehouseColumn = true;

  const getMaterial = useCallback((id: string) => materialsById[id], [materialsById]);

  const rememberMaterial = useCallback((material: Material) => {
    setMaterialsById((prev) => (prev[material.id] === material ? prev : { ...prev, [material.id]: material }));
  }, []);

  useEffect(() => {
    const ids = [...new Set(initialLines.map((line) => line.materialId).filter(Boolean))];
    if (ids.length === 0) return;

    let cancelled = false;
    void Promise.all(ids.map((id) => resolveMaterialById(id))).then((items) => {
      if (cancelled) return;
      const next: Record<string, Material> = {};
      for (const item of items) {
        if (item) next[item.material.id] = item.material;
      }
      if (Object.keys(next).length > 0) {
        setMaterialsById((prev) => ({ ...prev, ...next }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialLines, resolveMaterialById]);

  useEffect(() => {
    if (!initialSupplierName.trim()) return;

    let cancelled = false;
    void resolveSupplierByName(initialSupplierName).then((item) => {
      if (cancelled || !item) return;
      setSupplierId(item.id);
      setSupplierKnownItem(item);
    });

    return () => {
      cancelled = true;
    };
  }, [initialSupplierName, resolveSupplierByName]);

  const getSupplierName = () => supplierKnownItem?.label ?? '';

  const applyMaterialDefaults = (line: LineItem, material: Material): LineItem => ({
    ...line,
    materialId: material.id,
    quantityUomId: line.quantityUomId,
    unitCost: line.unitCost || defaultDisplayUnitCost(material, line.quantityUomId),
    warehouseId:
      material.warehouseId && warehouses.some((warehouse) => warehouse.id === material.warehouseId)
        ? material.warehouseId
        : line.warehouseId,
  });

  const handleMaterialResolved = useCallback(
    (lineId: string, material: Material) => {
      rememberMaterial(material);
      setLines((prev) =>
        normalizeLines(
          prev.map((line) => (line.id === lineId ? applyMaterialDefaults(line, material) : line))
        )
      );
    },
    [rememberMaterial, warehouses]
  );

  const updateLine = (id: string, field: keyof LineItem, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => {
          if (line.id !== id) return line;
          const updated = { ...line, [field]: value };

          if (field === 'materialId') {
            if (!value) {
              updated.quantity = '';
              updated.quantityUomId = '';
              updated.unitCost = '';
              updated.warehouseId = '';
            } else {
              const material = getMaterial(value);
              if (material) {
                return applyMaterialDefaults(updated, material);
              }
            }
          }

          if (field === 'quantityUomId') {
            const material = getMaterial(line.materialId);
            if (material) {
              updated.unitCost = convertLineUnitCost(
                line.unitCost,
                material,
                line.quantityUomId,
                value
              );
              updated.quantity = convertLineQuantity(
                line.quantity,
                material,
                line.quantityUomId,
                value
              );
            }
          }

          return updated;
        })
      )
    );
  };

  const lineTotal = (line: LineItem) => {
    const quantity = parseFloat(line.quantity) || 0;
    const unitCost = parseFloat(line.unitCost) || 0;
    return quantity * unitCost;
  };

  const validLines = useMemo(
    () => lines.filter((line) => line.materialId && parseFloat(line.quantity) > 0),
    [lines]
  );

  const duplicateMaterials = useMemo(
    () =>
      validLines
        .map((line) => line.materialId)
        .filter((id, index, array) => array.indexOf(id) !== index),
    [validLines]
  );

  const subTotal = useMemo(
    () => lines.reduce((sum, line) => sum + lineTotal(line), 0),
    [lines]
  );
  const taxAmount = includeTax ? subTotal * TAX_RATE : 0;
  const billAmount = subTotal + taxAmount;
  const totalQtyLines = validLines.length;
  const totalUnits = useMemo(
    () => validLines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0), 0),
    [validLines]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canPost) {
      toast.error('You do not have permission to post receipts');
      return;
    }

    if (validLines.length === 0) {
      toast.error('Add at least one line item with material and quantity');
      return;
    }

    const normalizedReceiptNumber = receiptNumber.trim();
    if (!normalizedReceiptNumber) {
      toast.error('Receipt number is required');
      return;
    }

    if (duplicateMaterials.length > 0) {
      toast.error('Duplicate materials found. Merge them into one row.');
      return;
    }
    if (validLines.some((line) => !line.warehouseId)) {
      toast.error('Select a warehouse for each receipt line');
      return;
    }

    setSubmitting(true);

    try {
      if (isEditMode && editReceiptNumber) {
        await deleteReceiptEntry(editReceiptNumber).unwrap();
      }

      await addBatchTransaction({
        type: 'STOCK_IN',
        receiptNumber: normalizedReceiptNumber,
        supplier: getSupplierName() || undefined,
        supplierId: supplierId || undefined,
        notes: notes || undefined,
        date,
        billAmount,
        includeTax,
        taxAmount,
        lines: validLines.map((line) => ({
          materialId: line.materialId,
          quantity: parseFloat(line.quantity),
          quantityUomId: line.quantityUomId.trim() || undefined,
          unitCost: line.unitCost ? parseFloat(line.unitCost) : undefined,
          warehouseId: line.warehouseId || undefined,
        })),
        materialUpdates: validLines
          .filter((line) => line.unitCost)
          .map((line) => ({
            materialId: line.materialId,
            unitCost: parseFloat(line.unitCost),
            quantityUomId: line.quantityUomId.trim() || undefined,
          })),
      }).unwrap();

      toast.success(
        isEditMode
          ? `Receipt updated. ${validLines.length} item(s) processed`
          : `Receipt posted. ${validLines.length} item(s) received`
      );
      router.push('/stock/goods-receipt');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/goods-receipt"
            className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto p-0 text-xs font-medium uppercase tracking-wide')}
          >
            Receiving ledger
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isEditMode ? 'Edit goods receipt' : 'Receive stock'}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isEditMode
              ? 'Adjust the receipt header, quantities, and costs before reposting inventory.'
              : 'Build one receipt with all incoming lines, then post stock and cost updates together.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/stock/goods-receipt" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Back to history
          </Link>
          <Button type="submit" form="goods-receipt-receive-form" size="sm" disabled={submitting}>
            {submitting ? 'Posting…' : isEditMode ? 'Update receipt' : 'Post receipt'}
          </Button>
        </div>
      </header>

      <form
        id="goods-receipt-receive-form"
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.defaultPrevented) {
            const target = e.target as HTMLElement;
            if (target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }
        }}
        className="flex flex-col gap-0 overflow-x-auto rounded-lg border border-border bg-card pb-8 shadow-sm sm:pb-10"
      >
        <div className="border-b border-border p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_220px_220px]">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Supplier / vendor
              </label>
              <ScheduleSearchSelect<SupplierSelectItem>
                value={supplierId}
                knownItem={supplierKnownItem}
                onChange={(id) => {
                  setSupplierId(id);
                  if (!id) setSupplierKnownItem(null);
                }}
                onResolved={(item) => {
                  if (item) setSupplierKnownItem(item);
                }}
                search={searchSuppliers}
                resolveById={resolveSupplierById}
                placeholder="Type to search supplier…"
                minCharactersToSearch={1}
                dropdownInPortal
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Receipt date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Receipt No.
              </label>
              <input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                required
                disabled={isEditMode}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes / remarks
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional comments, bill reference, or receiving note"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {totalQtyLines} active line{totalQtyLines === 1 ? '' : 's'} · {totalUnits.toFixed(2)} total quantity · draft
            rows stay ready while you work
          </p>
        </div>

        <GoodsReceiptLineGrid
          lines={lines}
          getMaterial={getMaterial}
          searchMaterials={searchMaterials}
          resolveMaterialById={resolveMaterialById}
          onMaterialResolved={handleMaterialResolved}
          warehouses={warehouses}
          showWarehouseColumn={showWarehouseColumn}
          emptyMessage="No receipt lines yet. Search for a material on the first row to start."
          duplicateMaterialIds={duplicateMaterials}
          onUpdateLine={updateLine}
        />

        <div className="border-t border-border">
          <div className="border-b border-border px-5 py-3">
            <h2 className={sectionHeadingClassName()}>Posting summary</h2>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-start">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subtotal</p>
                  <p className="mt-1 text-sm font-medium text-foreground">AED {subTotal.toFixed(2)}</p>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={includeTax}
                    onChange={(e) => setIncludeTax(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">Include 5% VAT</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Tax is {includeTax ? 'added to' : 'excluded from'} the bill amount.
                    </span>
                  </span>
                </label>

                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-mono text-foreground">AED {taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                    <span className="font-medium text-foreground">Bill amount</span>
                    <span className="font-mono text-lg font-semibold text-primary">AED {billAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:min-w-40">
                <Button type="submit" size="sm" disabled={submitting || !canPost}>
                  {submitting ? 'Posting…' : isEditMode ? 'Update receipt' : 'Post receipt'}
                </Button>
                <Link
                  href="/stock/goods-receipt"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full justify-center')}
                >
                  Cancel
                </Link>
              </div>
            </div>
        </div>
      </form>
    </div>
  );
}

export default function ReceiveStockPage() {
  const searchParams = useSearchParams();

  const editReceiptNumber = searchParams.get('edit');
  const isEditMode = Boolean(editReceiptNumber);
  const { data: receiptEntry, isLoading } = useGetReceiptEntryQuery(editReceiptNumber ?? '', {
    skip: !isEditMode || !editReceiptNumber,
  });

  const initialLines = useMemo<LineItem[]>(() => {
    if (!receiptEntry?.materials?.length) return [emptyLine()];
    return receiptEntry.materials.map((line, index) => ({
      id: `line-${index}`,
      materialId: line.materialId || '',
      quantity: String(line.displayQuantity ?? line.quantityReceived ?? ''),
      quantityUomId: line.quantityUomId ?? '',
      unitCost: String(line.displayUnitCost ?? line.unitCost ?? ''),
      warehouseId: line.warehouseId || '',
    }));
  }, [receiptEntry]);

  if (isEditMode && isLoading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <p className="text-sm text-muted-foreground">Loading receipt…</p>
      </div>
    );
  }

  if (isEditMode && editReceiptNumber && !receiptEntry) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert variant="destructive">
          <AlertDescription>Receipt not found.</AlertDescription>
        </Alert>
        <Link href="/stock/goods-receipt" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-fit')}>
          Back to history
        </Link>
      </div>
    );
  }

  if (isEditMode && receiptEntry?.status === 'cancelled') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertTitle>Receipt cancelled</AlertTitle>
          <AlertDescription>
            This receipt was already cancelled and can no longer be edited. Open the receipt history if you need to review
            the reversal trail.
          </AlertDescription>
        </Alert>
        <Link href="/stock/goods-receipt" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}>
          Back to history
        </Link>
      </div>
    );
  }

  return (
    <ReceiptEditor
      key={editReceiptNumber ?? 'new'}
      initialReceiptNumber={receiptEntry?.receiptNumber || buildDraftReceiptNumber()}
      initialSupplierName={receiptEntry?.supplier ?? ''}
      initialDate={receiptEntry ? new Date(receiptEntry.receivedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
      initialNotes={receiptEntry?.notes || ''}
      initialLines={initialLines}
      isEditMode={isEditMode}
      editReceiptNumber={editReceiptNumber}
    />
  );
}
