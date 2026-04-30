'use client';

import * as XLSX from 'xlsx';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import {
  mapManualStockAdjustmentImportRows,
  parseManualStockAdjustmentText,
  type ManualAdjustmentImportDraftLine,
  type ManualAdjustmentImportError,
} from '@/lib/utils/manualStockAdjustmentImport';
import {
  DEFAULT_STOCK_CONTROL_SETTINGS,
  readStockControlSettingsFromCompanySettings,
  type StockControlSettings,
} from '@/lib/stock-control/settings';
import {
  useGetMaterialsQuery,
  useGetStockExceptionApprovalsQuery,
  useGetWarehousesQuery,
  useRequestManualStockAdjustmentMutation,
} from '@/store/hooks';

type AdjustmentLineDraft = {
  id: string;
  materialId: string;
  warehouseId: string;
  quantityDelta: string;
  unitCost: string;
};

function createLine(): AdjustmentLineDraft {
  return {
    id: crypto.randomUUID(),
    materialId: '',
    warehouseId: '',
    quantityDelta: '',
    unitCost: '',
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatEvidenceType(value: string | null | undefined) {
  switch (value) {
    case 'PHYSICAL_COUNT':
      return 'Physical count';
    case 'DAMAGE_REPORT':
      return 'Damage report';
    case 'SUPPLIER_CLAIM':
      return 'Supplier claim';
    case 'CUSTOMER_RETURN':
      return 'Customer return';
    case 'OTHER':
      return 'Other';
    default:
      return value || '-';
  }
}

function totalDelta(lines: AdjustmentLineDraft[]) {
  return lines.reduce((sum, line) => {
    const quantity = Number(line.quantityDelta);
    return sum + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);
}

function largestNegativeQty(lines: AdjustmentLineDraft[]) {
  return lines.reduce((max, line) => {
    const quantity = Number(line.quantityDelta);
    if (!Number.isFinite(quantity) || quantity >= 0) return max;
    return Math.max(max, Math.abs(quantity));
  }, 0);
}

export default function ManualStockAdjustmentsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canAdjust = isSA || perms.includes('transaction.adjust');

  const { data: materials = [] } = useGetMaterialsQuery(undefined, {
    skip: !canAdjust,
  });
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, {
    skip: !canAdjust,
  });
  const { data: approvalsData, refetch: refetchApprovals } = useGetStockExceptionApprovalsQuery(undefined, {
    skip: !canAdjust,
  });
  const [requestAdjustment, { isLoading }] = useRequestManualStockAdjustmentMutation();

  const [lines, setLines] = useState<AdjustmentLineDraft[]>([createLine(), createLine()]);
  const [reason, setReason] = useState('');
  const [evidenceType, setEvidenceType] = useState<'PHYSICAL_COUNT' | 'DAMAGE_REPORT' | 'SUPPLIER_CLAIM' | 'CUSTOMER_RETURN' | 'OTHER'>('PHYSICAL_COUNT');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [stockControlSettings, setStockControlSettings] = useState<StockControlSettings>(DEFAULT_STOCK_CONTROL_SETTINGS);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importLines, setImportLines] = useState<ManualAdjustmentImportDraftLine[]>([]);
  const [importErrors, setImportErrors] = useState<ManualAdjustmentImportError[]>([]);

  const activeMaterials = useMemo(
    () => materials.filter((material) => material.isActive),
    [materials]
  );
  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.isActive),
    [warehouses]
  );
  const manualRows = useMemo(
    () =>
      (approvalsData?.rows ?? [])
        .filter((row) => row.exceptionType === 'MANUAL_STOCK_ADJUSTMENT')
        .slice(0, 12),
    [approvalsData]
  );
  const maxNegativeQty = useMemo(() => largestNegativeQty(lines), [lines]);

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const loadCompanySettings = async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setStockControlSettings(readStockControlSettingsFromCompanySettings(data?.data?.jobCostingSettings));
      } catch {
        // keep defaults
      }
    };
    void loadCompanySettings();
  }, [session?.user?.activeCompanyId]);

  function updateLine(id: string, key: keyof Omit<AdjustmentLineDraft, 'id'>, value: string) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, [key]: value } : line))
    );
  }

  function addLine() {
    setLines((current) => [...current, createLine()]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current));
  }

  function closeImportModal() {
    setIsImportOpen(false);
    setImportText('');
    setImportFileName('');
    setImportLines([]);
    setImportErrors([]);
  }

  function applyImportedLines(mode: 'append' | 'replace') {
    if (importLines.length === 0) {
      toast.error('No valid rows to apply.');
      return;
    }

    const nextLines = importLines.map((line) => ({
      id: crypto.randomUUID(),
      materialId: line.materialId,
      warehouseId: line.warehouseId,
      quantityDelta: line.quantityDelta,
      unitCost: line.unitCost,
    }));

    setLines((current) =>
      mode === 'replace'
        ? nextLines.length > 0
          ? nextLines
          : [createLine(), createLine()]
        : [...current.filter((line) => line.materialId || line.warehouseId || line.quantityDelta || line.unitCost), ...nextLines]
    );
    toast.success(
      mode === 'replace'
        ? `${importLines.length} imported line(s) loaded into the grid.`
        : `${importLines.length} imported line(s) appended to the grid.`
    );
    closeImportModal();
  }

  function previewImportedRows(args: { headers: string[]; rows: string[][] }) {
    const mapped = mapManualStockAdjustmentImportRows({
      headers: args.headers,
      rows: args.rows,
      materials: activeMaterials.map((material) => ({ id: material.id, name: material.name })),
      warehouses: activeWarehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
    });

    setImportLines(mapped.lines);
    setImportErrors(mapped.errors);

    if (mapped.lines.length === 0 && mapped.errors.length === 0) {
      toast.error('No import rows were found.');
      return;
    }

    if (mapped.errors.length > 0) {
      toast.error(`${mapped.errors.length} import row(s) need correction.`);
      return;
    }

    toast.success(`${mapped.lines.length} import row(s) are ready.`);
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as Array<Array<string | number | boolean | null>>;
      const normalizedRows = rawRows
        .map((row) => row.map((value) => String(value ?? '').trim()))
        .filter((row) => row.some((value) => value.length > 0));

      if (normalizedRows.length < 2) {
        toast.error('The file needs a header row and at least one data row.');
        return;
      }

      setImportFileName(file.name);
      previewImportedRows({
        headers: normalizedRows[0] ?? [],
        rows: normalizedRows.slice(1),
      });
    } catch {
      toast.error('Failed to read the selected file.');
    } finally {
      event.target.value = '';
    }
  }

  function handlePreviewPaste() {
    const parsed = parseManualStockAdjustmentText(importText);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error('Paste a tab or CSV table with headers first.');
      return;
    }

    setImportFileName('');
    previewImportedRows(parsed);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const preparedLines = lines
      .filter((line) => line.materialId || line.warehouseId || line.quantityDelta || line.unitCost)
      .map((line) => ({
        materialId: line.materialId,
        warehouseId: line.warehouseId,
        quantityDelta: Number(line.quantityDelta),
        unitCost: line.unitCost.trim() ? Number(line.unitCost) : undefined,
      }));

    if (preparedLines.length === 0) {
      toast.error('Add at least one adjustment line.');
      return;
    }

    const invalidLine = preparedLines.find(
      (line) =>
        !line.materialId ||
        !line.warehouseId ||
        !Number.isFinite(line.quantityDelta) ||
        Math.abs(line.quantityDelta) < 0.001 ||
        (line.unitCost !== undefined && !Number.isFinite(line.unitCost))
    );
    if (invalidLine) {
      toast.error('Complete every adjustment line with material, warehouse, and a non-zero quantity.');
      return;
    }

    const missingPositiveUnitCost = preparedLines.find(
      (line) => line.quantityDelta > 0 && (!Number.isFinite(line.unitCost) || Number(line.unitCost) <= 0)
    );
    if (missingPositiveUnitCost) {
      toast.error('Positive adjustment lines require an explicit unit cost.');
      return;
    }

    const maxNegative = preparedLines.reduce((max, line) => {
      if (line.quantityDelta >= 0) return max;
      return Math.max(max, Math.abs(line.quantityDelta));
    }, 0);
    if (maxNegative >= stockControlSettings.negativeEvidenceQtyThreshold) {
      if (evidenceType === 'OTHER') {
        toast.error('Large negative adjustments require a specific evidence type.');
        return;
      }
      if (evidenceNotes.trim().length < 12) {
        toast.error('Large negative adjustments require detailed evidence notes.');
        return;
      }
    }

    try {
      const result = await requestAdjustment({
        lines: preparedLines,
        reason,
        evidenceType,
        evidenceReference,
        ...(evidenceNotes.trim() ? { evidenceNotes } : {}),
        ...(notes.trim() ? { notes } : {}),
      }).unwrap();

      toast.success(
        result.status === 'APPROVED'
          ? 'Bulk stock adjustment posted.'
          : 'Bulk stock adjustment request submitted for approval.'
      );
      setLines([createLine(), createLine()]);
      setReason('');
      setEvidenceType('PHYSICAL_COUNT');
      setEvidenceReference('');
      setEvidenceNotes('');
      setNotes('');
      await refetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit bulk stock adjustment');
    }
  }

  if (!canAdjust) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manual stock adjustments</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            You do not have permission to create manual stock adjustments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300/80">
            Stock control
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Bulk manual stock adjustments
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            Submit one approval request with multiple stock correction lines. Positive lines create new batches. Negative
            lines consume open FIFO stock only after approval.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
            Positive lines require unit cost. Negative lines at or above {stockControlSettings.negativeEvidenceQtyThreshold} require
            detailed evidence, and lines at or above {stockControlSettings.negativeDecisionNoteQtyThreshold} require the approver
            to leave a decision note.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <th className="px-3 py-3">Material</th>
                  <th className="px-3 py-3">Warehouse</th>
                  <th className="px-3 py-3">Qty delta</th>
                  <th className="px-3 py-3">Unit cost</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                  >
                    <td className="px-3 py-2.5">
                      <select
                        value={line.materialId}
                        onChange={(event) => updateLine(line.id, 'materialId', event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Select material</option>
                        {activeMaterials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={line.warehouseId}
                        onChange={(event) => updateLine(line.id, 'warehouseId', event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Select warehouse</option>
                        {activeWarehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.001"
                        value={line.quantityDelta}
                        onChange={(event) => updateLine(line.id, 'quantityDelta', event.target.value)}
                        placeholder="Use positive to add, negative to remove"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={line.unitCost}
                        onChange={(event) => updateLine(line.id, 'unitCost', event.target.value)}
                        placeholder="Required for positive lines"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addLine}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Add line
              </button>
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Paste / Import
              </button>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {lines.length} lines, net delta {totalDelta(lines).toFixed(3)}
            </div>
          </div>

          {maxNegativeQty >= stockControlSettings.negativeEvidenceQtyThreshold ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              Largest negative line: {maxNegativeQty.toFixed(3)}. This request needs detailed evidence notes and a specific evidence type.
              {maxNegativeQty >= stockControlSettings.negativeDecisionNoteQtyThreshold
                ? ' Approval will also require a decision note.'
                : ''}
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              required
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Evidence type</label>
              <select
                value={evidenceType}
                onChange={(event) =>
                  setEvidenceType(
                    event.target.value as 'PHYSICAL_COUNT' | 'DAMAGE_REPORT' | 'SUPPLIER_CLAIM' | 'CUSTOMER_RETURN' | 'OTHER'
                  )
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                required
              >
                <option value="PHYSICAL_COUNT">Physical count</option>
                <option value="DAMAGE_REPORT">Damage report</option>
                <option value="SUPPLIER_CLAIM">Supplier claim</option>
                <option value="CUSTOMER_RETURN">Customer return</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Evidence reference</label>
              <input
                type="text"
                value={evidenceReference}
                onChange={(event) => setEvidenceReference(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Count sheet no, claim no, memo no..."
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Evidence notes</label>
            <textarea
              value={evidenceNotes}
              onChange={(event) => setEvidenceNotes(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              placeholder="Short evidence summary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              placeholder="Optional context for the correction trail"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={isLoading}>
              {isSA ? 'Post Bulk Adjustment' : 'Submit Bulk Request'}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent bulk adjustment requests</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Use the stock exception dashboard for full approval queue actions.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Lines</th>
                <th className="px-3 py-3">Net delta</th>
                <th className="px-3 py-3">Evidence</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3">Requester</th>
              </tr>
            </thead>
            <tbody>
              {manualRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    No manual adjustment requests yet.
                  </td>
                </tr>
              ) : (
                manualRows.map((row) => {
                  const payloadLines = Array.isArray(row.payload?.lines) ? row.payload.lines : [];
                  const netDelta = payloadLines.reduce((sum, item) => sum + Number(item?.quantityDelta ?? 0), 0);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                    >
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-900 dark:text-white">{row.referenceNumber || row.referenceId}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          label={row.status}
                          variant={row.status === 'APPROVED' ? 'green' : row.status === 'REJECTED' ? 'red' : 'yellow'}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{payloadLines.length}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{netDelta.toFixed(3)}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {formatEvidenceType(typeof row.payload?.evidenceType === 'string' ? row.payload.evidenceType : null)}
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                          {typeof row.payload?.evidenceReference === 'string' ? row.payload.evidenceReference : '-'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.reason}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.createdByName || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={isImportOpen}
        onClose={closeImportModal}
        title="Paste or Import Adjustment Lines"
        size="xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            Use headers like `Material`, `Warehouse`, `Qty Delta`, and `Unit Cost`. Material and warehouse can be either IDs or exact names.
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Paste tab or CSV table</label>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={10}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder={`Material\tWarehouse\tQty Delta\tUnit Cost\nGlass Mat\tMain Warehouse\t-5\t\nResin\tMain Warehouse\t4\t6.5`}
              />
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handlePreviewPaste}>
                  Preview Paste
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Import Excel or CSV</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                {importFileName ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">Previewing: {importFileName}</p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Valid rows</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{importLines.length}</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-red-700 dark:text-red-300">Errors</p>
                  <p className="mt-2 text-xl font-semibold text-red-900 dark:text-red-100">{importErrors.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Current grid</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{lines.length}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => applyImportedLines('append')} disabled={importLines.length === 0}>
                  Append Valid Rows
                </Button>
                <Button type="button" onClick={() => applyImportedLines('replace')} disabled={importLines.length === 0}>
                  Replace Grid
                </Button>
              </div>
            </div>
          </div>

          {importErrors.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-red-200 dark:border-red-900/40">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-red-200 bg-red-50 text-left text-xs font-semibold uppercase tracking-wide text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    <th className="px-3 py-3">Row</th>
                    <th className="px-3 py-3">Issue</th>
                    <th className="px-3 py-3">Values</th>
                  </tr>
                </thead>
                <tbody>
                  {importErrors.slice(0, 8).map((error) => (
                    <tr key={`${error.rowNumber}-${error.message}`} className="border-b border-red-100 dark:border-red-900/20">
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{error.rowNumber}</td>
                      <td className="px-3 py-2.5 text-red-700 dark:text-red-300">{error.message}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{error.values.join(' | ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {importLines.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="px-3 py-3">Material</th>
                    <th className="px-3 py-3">Warehouse</th>
                    <th className="px-3 py-3">Qty delta</th>
                    <th className="px-3 py-3">Unit cost</th>
                  </tr>
                </thead>
                <tbody>
                  {importLines.slice(0, 8).map((line, index) => (
                    <tr key={`${line.materialId}-${line.warehouseId}-${index}`} className="border-b border-slate-100 dark:border-slate-800/80">
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {activeMaterials.find((material) => material.id === line.materialId)?.name || line.materialId}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {activeWarehouses.find((warehouse) => warehouse.id === line.warehouseId)?.name || line.warehouseId}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{line.quantityDelta}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{line.unitCost || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
