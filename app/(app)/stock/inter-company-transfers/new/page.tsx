'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import SearchSelect from '@/components/ui/SearchSelect';
import {
  useGetCompaniesQuery,
  useGetCrossCompanyMaterialsQuery,
  useGetMaterialsQuery,
  useGetWarehousesQuery,
  useTransferStockMutation,
  type MaterialUomDto,
} from '@/store/hooks';

interface TransferLine {
  id: string;
  materialId: string;
  quantity: string;
  quantityUomId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
}

function createLine(): TransferLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    materialId: '',
    quantity: '',
    quantityUomId: '',
    sourceWarehouseId: '',
    destinationWarehouseId: '',
  };
}

function isLineEmpty(line: TransferLine) {
  return !line.materialId && !line.quantity && !line.quantityUomId && !line.sourceWarehouseId && !line.destinationWarehouseId;
}

function normalizeLines(lines: TransferLine[]) {
  const filled = lines.filter((line) => !isLineEmpty(line));
  const minVisible = 5;
  const minEmpty = 3;
  const requiredEmpty = Math.max(minEmpty, minVisible - filled.length);
  return [...filled, ...Array.from({ length: requiredEmpty }, () => createLine())];
}

function sameLineValues(a: TransferLine[], b: TransferLine[]) {
  if (a.length !== b.length) return false;
  return a.every((line, index) => {
    const other = b[index];
    return (
      line.id === other.id &&
      line.materialId === other.materialId &&
      line.quantity === other.quantity &&
      line.quantityUomId === other.quantityUomId &&
      line.sourceWarehouseId === other.sourceWarehouseId &&
      line.destinationWarehouseId === other.destinationWarehouseId
    );
  });
}

type SelectMaterial = {
  id: string;
  name: string;
  unit: string;
  warehouse?: string;
  warehouseId?: string | null;
  currentStock: number;
  materialUoms?: MaterialUomDto[];
  isActive: boolean;
};

export default function MultiInterCompanyTransferPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canTransfer = isSA || perms.includes('transaction.transfer');
  const activeCompanyId = session?.user?.activeCompanyId ?? '';

  const { data: companies = [] } = useGetCompaniesQuery(undefined, { skip: !canTransfer });
  const { data: ownMaterials = [] } = useGetMaterialsQuery(undefined, { skip: !canTransfer || !activeCompanyId });
  const [transferStock] = useTransferStockMutation();

  const [sourceCompanyId, setSourceCompanyId] = useState('');
  const [destinationCompanyId, setDestinationCompanyId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<TransferLine[]>(() => normalizeLines([createLine()]));
  const [submitting, setSubmitting] = useState(false);

  const usingOwnMaterials = sourceCompanyId === activeCompanyId;
  const sourceIsReady = Boolean(sourceCompanyId);
  const { data: externalSourceMaterials = [] } = useGetCrossCompanyMaterialsQuery(sourceCompanyId, {
    skip: !canTransfer || !sourceCompanyId || usingOwnMaterials,
  });
  const { data: destinationWarehouses = [] } = useGetWarehousesQuery(destinationCompanyId || undefined, {
    skip: !canTransfer || !destinationCompanyId,
  });
  const { data: sourceWarehouses = [] } = useGetWarehousesQuery(sourceCompanyId || undefined, {
    skip: !canTransfer || !sourceCompanyId,
  });

  const selectableCompanies = useMemo(
    () => companies.filter((company) => company.isActive),
    [companies]
  );
  const showSourceWarehouseColumn = true;
  const showDestinationWarehouseColumn = true;

  const sourceMaterials = useMemo<SelectMaterial[]>(() => {
    if (!sourceIsReady) return [];
    if (usingOwnMaterials) return ownMaterials.filter((material) => material.isActive);
    return externalSourceMaterials.filter((material) => material.isActive);
  }, [externalSourceMaterials, ownMaterials, sourceIsReady, usingOwnMaterials]);

  const sourceCompanyName = selectableCompanies.find((company) => company.id === sourceCompanyId)?.name || '';
  const destinationCompanyName = selectableCompanies.find((company) => company.id === destinationCompanyId)?.name || '';

  const updateLine = (id: string, field: keyof TransferLine, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((line) => {
          if (line.id !== id) return line;
          if (field === 'materialId' && !value) return createLine();
          if (field === 'materialId') {
            const nextMaterial = sourceMaterials.find((material) => material.id === value);
            return {
              ...line,
              materialId: value,
              quantityUomId: '',
              sourceWarehouseId: nextMaterial?.warehouseId ?? '',
              destinationWarehouseId: '',
            };
          }
          return {
            ...line,
            [field]: value,
          };
        })
      )
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => normalizeLines(prev.filter((line) => line.id !== id)));
  };

  const getMaterial = (materialId: string) => sourceMaterials.find((material) => material.id === materialId);

  useEffect(() => {
    setLines((prev) => {
      const next = prev.map((line) => {
        if (!line.materialId) {
          return line.sourceWarehouseId || line.destinationWarehouseId
            ? { ...line, sourceWarehouseId: '', destinationWarehouseId: '' }
            : line;
        }
        const material = sourceMaterials.find((item) => item.id === line.materialId);
        const nextSourceWarehouseId =
          material?.warehouseId && sourceWarehouses.some((warehouse) => warehouse.id === material.warehouseId)
            ? material.warehouseId
            : '';

        const sourceWarehouseValid =
          !line.sourceWarehouseId || sourceWarehouses.some((warehouse) => warehouse.id === line.sourceWarehouseId);
        const destinationWarehouseValid =
          !line.destinationWarehouseId ||
          destinationWarehouses.some((warehouse) => warehouse.id === line.destinationWarehouseId);

        if (
          line.sourceWarehouseId === nextSourceWarehouseId &&
          sourceWarehouseValid &&
          destinationWarehouseValid
        ) {
          return line;
        }

        return {
          ...line,
          sourceWarehouseId: sourceWarehouseValid ? line.sourceWarehouseId || nextSourceWarehouseId : nextSourceWarehouseId,
          destinationWarehouseId: destinationWarehouseValid ? line.destinationWarehouseId : '',
        };
      });
      return sameLineValues(prev, next) ? prev : next;
    });
  }, [destinationWarehouses, sourceMaterials, sourceWarehouses]);

  const validLines = useMemo(
    () => lines.filter((line) => line.materialId && Number.parseFloat(line.quantity) > 0),
    [lines]
  );

  const totalQty = useMemo(
    () => validLines.reduce((sum, line) => sum + (Number.parseFloat(line.quantity) || 0), 0),
    [validLines]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceCompanyId || !destinationCompanyId) {
      toast.error('Select both source and destination companies');
      return;
    }
    if (sourceCompanyId === destinationCompanyId) {
      toast.error('Source and destination must be different');
      return;
    }
    if (validLines.length === 0) {
      toast.error('Add at least one material line');
      return;
    }
    if (validLines.some((line) => !line.destinationWarehouseId)) {
      toast.error('Select a destination warehouse for each material');
      return;
    }
    if (validLines.some((line) => !line.sourceWarehouseId)) {
      toast.error('Select a source warehouse for each material');
      return;
    }

    setSubmitting(true);
    try {
      for (const line of validLines) {
        await transferStock({
          sourceCompanyId,
          sourceWarehouseId: line.sourceWarehouseId || undefined,
          destinationCompanyId,
          destinationWarehouseId: line.destinationWarehouseId || undefined,
          destinationWarehouse:
            destinationWarehouses.find((warehouse) => warehouse.id === line.destinationWarehouseId)?.name || undefined,
          materialId: line.materialId,
          quantity: Number.parseFloat(line.quantity),
          quantityUomId: line.quantityUomId.trim() || undefined,
          notes: notes.trim() || undefined,
          date,
        }).unwrap();
      }

      toast.success(`Transferred ${validLines.length} item(s) successfully`);
      setLines(normalizeLines([createLine()]));
      setNotes('');
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Transfer failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canTransfer) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Multi transfer</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            You do not have permission to create inter-company transfers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 dark:text-blue-300/80">
                Multi Transfer
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Move multiple items between companies
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Choose the source company and destination company, then route stock through required source and destination warehouses.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/stock/inter-company-transfers">
                <Button variant="ghost">Back to ledger</Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Source', value: sourceCompanyName || 'Choose', note: 'Company stock will be reduced' },
            { label: 'Destination', value: destinationCompanyName || 'Choose', note: `${validLines.filter((line) => line.destinationWarehouseId).length} destination warehouse selections ready` },
            { label: 'Prepared lines', value: String(validLines.length), note: 'Rows with material and quantity' },
            { label: 'Entered qty', value: totalQty.toFixed(3), note: 'Raw entered transfer quantity' },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-950/80">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="space-y-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
      >
        <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_minmax(220px,0.9fr)]">
            <SearchSelect
              label="Source company"
              value={sourceCompanyId}
              onChange={setSourceCompanyId}
              placeholder="Select source company..."
              dropdownInPortal
              items={selectableCompanies.map((company) => ({
                id: company.id,
                label: company.name,
                searchText: company.slug,
              }))}
            />
            <SearchSelect
              label="Destination company"
              value={destinationCompanyId}
              onChange={setDestinationCompanyId}
              placeholder="Select destination company..."
              dropdownInPortal
              items={selectableCompanies
                .filter((company) => company.id !== sourceCompanyId)
                .map((company) => ({
                  id: company.id,
                  label: company.name,
                searchText: company.slug,
                }))}
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Transfer date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Notes
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional transfer note"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="overflow-hidden border-b border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
                  <th className="w-10 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">#</th>
                  <th className="min-w-[320px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Material</th>
                  <th className="w-[170px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">UOM</th>
                  {showSourceWarehouseColumn ? (
                    <th className="w-[190px] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Source Warehouse</th>
                  ) : null}
                  {showDestinationWarehouseColumn ? (
                    <th className="w-[190px] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Dest Warehouse</th>
                  ) : null}
                  <th className="w-[120px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Available</th>
                  <th className="w-[150px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Transfer Qty</th>
                  <th className="w-[56px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Clr</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const material = getMaterial(line.materialId);
                  return (
                    <tr key={line.id} className="border-b border-slate-200 dark:border-slate-800">
                      <td className="px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <SearchSelect
                          value={line.materialId}
                          onChange={(id) => updateLine(line.id, 'materialId', id)}
                          onBlurInputValue={(inputValue) => {
                            if (!inputValue.trim() && line.materialId) {
                              updateLine(line.id, 'materialId', '');
                            }
                          }}
                          placeholder={sourceCompanyId ? 'Search source materials...' : 'Select source company first...'}
                          disabled={!sourceCompanyId}
                          dropdownInPortal
                          items={sourceMaterials.map((material) => ({
                            id: material.id,
                            label: material.name,
                            searchText: `${material.currentStock} ${material.unit}`,
                          }))}
                          renderItem={(item) => (
                            <div className="flex w-full min-w-0 items-center justify-between gap-3">
                              <div className="truncate font-medium text-slate-900 dark:text-white">{item.label}</div>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{item.searchText}</span>
                            </div>
                          )}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {material?.materialUoms && material.materialUoms.length > 0 ? (
                          <select
                            value={line.quantityUomId}
                            onChange={(e) => updateLine(line.id, 'quantityUomId', e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            {material.materialUoms.map((uom) => (
                              <option key={uom.id} value={uom.isBase ? '' : uom.id}>
                                {uom.unitName}
                                {uom.isBase ? ' (base)' : ` (=${uom.factorToBase} ${material.unit})`}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">{material?.unit ?? '-'}</span>
                        )}
                      </td>
                      {showSourceWarehouseColumn ? (
                        <td className="px-2 py-2">
                          <select
                            value={line.sourceWarehouseId}
                            onChange={(e) => updateLine(line.id, 'sourceWarehouseId', e.target.value)}
                            disabled={!sourceCompanyId || sourceWarehouses.length === 0}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="">Select warehouse...</option>
                            {sourceWarehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                      {showDestinationWarehouseColumn ? (
                        <td className="px-2 py-2">
                          <select
                            value={line.destinationWarehouseId}
                            onChange={(e) => updateLine(line.id, 'destinationWarehouseId', e.target.value)}
                            disabled={!destinationCompanyId || destinationWarehouses.length === 0}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="">
                              {!destinationCompanyId ? 'Select destination company' : 'Select warehouse...'}
                            </option>
                            {destinationWarehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                          {material?.warehouse && (
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Material default: {material.warehouse}
                            </p>
                          )}
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right font-mono text-sm text-slate-900 dark:text-white">
                        {material ? material.currentStock.toFixed(3) : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                          disabled={!material}
                          placeholder="0.00"
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Source stock is reduced first, then the destination company is credited automatically.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/stock/inter-company-transfers">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" loading={submitting}>
              Post transfer
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
