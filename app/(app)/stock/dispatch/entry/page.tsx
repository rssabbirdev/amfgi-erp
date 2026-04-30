'use client';

import { useEffect, useState, useMemo } from 'react';
import Link                               from 'next/link';
import { useSearchParams }                from 'next/navigation';
import { useSession }                     from 'next-auth/react';
import { Button }                         from '@/components/ui/Button';
import SearchSelect                       from '@/components/ui/SearchSelect';
import LineGridColumnSettings, { type LineGridColumnConfig } from '@/components/stock/LineGridColumnSettings';
import DispatchLineGrid                   from '@/components/stock/DispatchLineGrid';
import toast                              from 'react-hot-toast';
import {
  useGetMaterialsQuery,
  useGetJobsQuery,
  useGetDispatchEntryQuery,
  useGetDispatchBudgetWarningMutation,
  useGetJobMaterialsQuery,
  useGetCustomersQuery,
  useAddBatchTransactionMutation,
  useGetWarehousesQuery,
  type DispatchBudgetWarningResult,
  type MaterialUomDto,
  type Material,
} from '@/store/hooks';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/** Convert entered quantity to base UOM amount (stock is stored in base units). */
function qtyInBase(uoms: MaterialUomDto[] | undefined, quantityUomId: string, qty: number): number {
  if (!uoms?.length || !quantityUomId?.trim()) return qty;
  const u = uoms.find((x) => x.id === quantityUomId);
  if (!u) return qty;
  return qty * u.factorToBase;
}

interface Line {
  id:       string;
  jobId:    string;
  materialId: string;
  dispatchQty: string;
  returnQty:   string;
  quantityUomId: string;
  warehouseId: string;
  sourceTransactionId?: string;
  originalDispatchQty?: number; // Track original qty for editing validation
  originalWarehouseId?: string;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

const MIN_VISIBLE_ROWS = 5;
const MIN_EMPTY_ROWS = 3;

function emptyLine(jobId = ''): Line {
  return {
    id: generateId(),
    jobId,
    materialId: '',
    dispatchQty: '',
    returnQty: '',
    quantityUomId: '',
    warehouseId: '',
  };
}

function isLineEmpty(line: Line) {
  return (
    !line.materialId &&
    !line.dispatchQty &&
    !line.returnQty &&
    !line.quantityUomId &&
    !line.warehouseId
  );
}

function normalizeLines(lines: Line[], jobId = '') {
  const nonEmptyLines = lines.filter((line) => !isLineEmpty(line));
  const requiredEmptyRows = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmptyLines.length);
  return [...nonEmptyLines, ...Array.from({ length: requiredEmptyRows }, () => emptyLine(jobId))];
}

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

type DispatchGridColumnKey =
  | 'line'
  | 'material'
  | 'uom'
  | 'warehouseStock'
  | 'globalStock'
  | 'dispatchQty'
  | 'returnQty'
  | 'warehouse'
  | 'action';

const DEFAULT_GRID_COLUMNS: LineGridColumnConfig[] = [
  { key: 'line', label: '#', visible: true, width: 48, minWidth: 40, maxWidth: 72 },
  { key: 'material', label: 'Material', visible: true, width: 280, minWidth: 180, maxWidth: 420 },
  { key: 'uom', label: 'UOM', visible: true, width: 140, minWidth: 110, maxWidth: 220 },
  { key: 'warehouseStock', label: 'Warehouse Stock', visible: true, width: 150, minWidth: 120, maxWidth: 220 },
  { key: 'globalStock', label: 'Global Stock', visible: true, width: 150, minWidth: 120, maxWidth: 220 },
  { key: 'dispatchQty', label: 'Dispatch Qty', visible: true, width: 132, minWidth: 110, maxWidth: 220 },
  { key: 'returnQty', label: 'Return Qty', visible: true, width: 132, minWidth: 110, maxWidth: 220 },
  { key: 'warehouse', label: 'Warehouse', visible: true, width: 220, minWidth: 180, maxWidth: 320 }
];

function parseJobContacts(value: unknown): Array<{ name: string; number?: string; email?: string; designation?: string; label?: string }> {
  if (!Array.isArray(value)) return [];
  const contacts: Array<{ name: string; number?: string; email?: string; designation?: string; label?: string }> = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    contacts.push({
      name,
      number: typeof r.number === 'string' ? r.number.trim() : undefined,
      email: typeof r.email === 'string' ? r.email.trim() : undefined,
      designation: typeof r.designation === 'string' ? r.designation.trim() : undefined,
      label: typeof r.label === 'string' ? r.label.trim() : undefined,
    });
  }
  return contacts;
}

function parseOverrideReason(notesText: string) {
  const match = notesText.match(/\[OVERRIDE_REASON:([^\]]+)\]/);
  return match?.[1]?.trim() ?? '';
}

function stripOverrideReason(notesText: string) {
  return notesText.replace(/\[OVERRIDE_REASON:[^\]]+\]\n?/g, '').trim();
}

export default function DispatchMaterialsPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { data: materials = [] } = useGetMaterialsQuery();
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();
  const [getDispatchBudgetWarning, { isLoading: budgetWarningLoading }] = useGetDispatchBudgetWarningMutation();
  const showWarehouseColumn = true;
  const [gridColumns, setGridColumns] = useState<LineGridColumnConfig[]>(DEFAULT_GRID_COLUMNS);

  const [lines,        setLines]        = useState<Line[]>(() => normalizeLines([emptyLine()]));
  const [selectedJob,  setSelectedJob]  = useState('');
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [existingEntry, setExistingEntry] = useState<{ exists: boolean; lines: any[]; transactionIds: string[]; notes: string } | null>(null);
  const [budgetWarning, setBudgetWarning] = useState<DispatchBudgetWarningResult | null>(null);

  // Get total dispatched/returned for each material on this job across all dates
  const { data: jobMaterials = [] } = useGetJobMaterialsQuery(selectedJob, { skip: !selectedJob });
  const [changeWarningModal, setChangeWarningModal] = useState<{ open: boolean; pendingChange: PendingChange | null }>({
    open: false,
    pendingChange: null,
  });
  const visibleGridColumns = useMemo(
    () => gridColumns.filter((column) => column.visible && (showWarehouseColumn || column.key !== 'warehouse')),
    [gridColumns, showWarehouseColumn]
  );
  const gridTemplateColumns = useMemo(
    () => visibleGridColumns.map((column) => `${column.width}px`).join(' '),
    [visibleGridColumns]
  );

  // Load from query params if editing
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    const dateParam = searchParams.get('date');

    if (jobId && dateParam) {
      setSelectedJob(jobId);
      setDate(dateParam);
    }
  }, [searchParams]);

  // Check for existing entry when job or date changes
  const { data: entryData } = useGetDispatchEntryQuery(
    { jobId: selectedJob, date },
    { skip: !selectedJob || !date }
  );

  // Auto-populate form when entry data loads
  useEffect(() => {
    if (!selectedJob || !date) {
      setExistingEntry(null);
      setLines(normalizeLines([emptyLine()]));
      setNotes('');
      setOverrideReason('');
      return;
    }

    if (entryData) {
      setExistingEntry(entryData);

      if (entryData.exists) {
        const newLines = entryData.lines.map((line: any) => ({
          id: line.transactionId ?? generateId(),
          jobId: selectedJob,
          materialId: line.materialId,
          dispatchQty: line.quantity.toString(),
          returnQty: line.returnQty ? line.returnQty.toString() : '',
          quantityUomId: '',
          warehouseId: line.warehouseId ?? '',
          sourceTransactionId: line.transactionId ?? undefined,
          originalWarehouseId: line.warehouseId ?? '',
          originalDispatchQty: line.quantity,
        }));

        setLines(normalizeLines(newLines, selectedJob));
        setOverrideReason(parseOverrideReason(entryData.notes || ''));
        setNotes(stripOverrideReason(entryData.notes || ''));
      } else {
        setLines(normalizeLines([emptyLine(selectedJob)], selectedJob));
        setNotes('');
        setOverrideReason('');
      }
    }
  }, [selectedJob, date, entryData]);

  const handleJobChange = (newJobId: string) => {
    // If there's actual data in rows, show warning
    if (hasData()) {
      setChangeWarningModal({
        open: true,
        pendingChange: { type: 'job', newValue: newJobId },
      });
    } else {
      setSelectedJob(newJobId);
    }
  };

  const handleDateChange = (newDate: string) => {
    // If there's actual data in rows, show warning
    if (hasData()) {
      setChangeWarningModal({
        open: true,
        pendingChange: { type: 'date', newValue: newDate },
      });
    } else {
      setDate(newDate);
    }
  };

  const confirmChange = () => {
    if (!changeWarningModal.pendingChange) return;

    // Clear materials and notes, reset to 5 rows
    setLines(normalizeLines([emptyLine()]));
    setNotes('');
    setOverrideReason('');
    // Apply the change
    if (changeWarningModal.pendingChange.type === 'job') {
      setSelectedJob(changeWarningModal.pendingChange.newValue);
    } else {
      setDate(changeWarningModal.pendingChange.newValue);
    }

    setChangeWarningModal({ open: false, pendingChange: null });
  };

  const getMaterial = (id: string) => materials.find((m) => m.id === id);
  const getJob = (id: string) => jobs.find((j) => j.id === id);
  const selectedJobRecord = getJob(selectedJob);
  const selectedJobContacts = parseJobContacts(selectedJobRecord?.contactsJson);
  const selectableJobs = useMemo(
    () => jobs.filter((job) => Boolean(job.parentJobId) && job.status !== 'COMPLETED' && job.status !== 'CANCELLED'),
    [jobs]
  );

  const populatedLines = useMemo(
    () => lines.filter((line) => line.materialId || line.dispatchQty || line.returnQty),
    [lines]
  );
  const budgetWarningLines = useMemo(
    () =>
      lines
        .filter((line) => line.materialId && line.dispatchQty)
        .map((line) => ({
          materialId: line.materialId,
          quantity: Number.parseFloat(line.dispatchQty) || 0,
          quantityUomId: line.quantityUomId || undefined,
          returnQty: line.returnQty ? Number.parseFloat(line.returnQty) || 0 : undefined,
        }))
        .filter((line) => line.quantity > 0),
    [lines]
  );

  const totalDispatchQty = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const value = Number.parseFloat(line.dispatchQty);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [lines]
  );

  const totalReturnQty = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const value = Number.parseFloat(line.returnQty);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [lines]
  );

  const overrideSignals = useMemo(() => {
    let negativeStockLineCount = 0;
    for (const line of lines) {
      if (!line.materialId || !line.dispatchQty || !line.warehouseId) continue;
      const qty = Number.parseFloat(line.dispatchQty);
      const mat = getMaterial(line.materialId);
      if (!mat || !mat.allowNegativeConsumption || !Number.isFinite(qty) || qty <= 0) continue;
      const baseQty = qtyInBase(mat.materialUoms, line.quantityUomId, qty);
      const originalQty = line.originalDispatchQty ? parseFloat(String(line.originalDispatchQty)) : 0;
      const originalWarehouseMatches = line.originalWarehouseId && line.originalWarehouseId === line.warehouseId;
      const availableStock = getWarehouseBaseStock(mat, line.warehouseId) + (originalWarehouseMatches ? originalQty : 0);
      if (availableStock + 0.0005 < baseQty) {
        negativeStockLineCount += 1;
      }
    }

    const budgetWarningCount = budgetWarning?.warningCount ?? 0;
    return {
      negativeStockLineCount,
      budgetWarningCount,
      requiresReason: negativeStockLineCount > 0 || budgetWarningCount > 0,
    };
  }, [budgetWarning, lines, materials]);

  // Check if any line has actual data (not empty)
  const hasData = () => lines.some((l) => l.materialId || l.dispatchQty || l.returnQty);

  useEffect(() => {
    if (!selectedJob || budgetWarningLines.length === 0) {
      setBudgetWarning(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await getDispatchBudgetWarning({
            jobId: selectedJob,
            postingDate: date,
            lines: budgetWarningLines,
          }).unwrap();
          if (!cancelled) {
            setBudgetWarning(result.warningCount > 0 ? result : null);
          }
        } catch {
          if (!cancelled) {
            setBudgetWarning(null);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [budgetWarningLines, date, getDispatchBudgetWarning, selectedJob]);

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((l) => {
          if (l.id !== id) return l;
          if (field === 'materialId' && !value) {
            return emptyLine(selectedJob);
          }

          return {
            ...l,
            jobId: selectedJob,
            [field]: value,
            ...(field === 'materialId'
              ? {
                  quantityUomId: '',
                  warehouseId: materials.find((m) => m.id === value)?.warehouseId ?? '',
                }
              : {}),
          };
        }),
        selectedJob
      )
    );
  };

  const addLine = () => {
    setLines((prev) => normalizeLines([...prev, emptyLine(selectedJob)], selectedJob));
  };

  const removeLine = (id: string) => {
    setLines((prev) => normalizeLines(prev.filter((line) => line.id !== id), selectedJob));
  };

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

  // Execute the actual batch dispatch
  const executeSubmit = async (linesToSubmit: Line[]) => {
    try {
      await addBatchTransaction({
        type:  'STOCK_OUT',
        jobId: selectedJob || undefined,
        notes: notes?.trim() || undefined,
        overrideReason: overrideReason.trim() || undefined,
        date,
        existingTransactionIds: existingEntry?.transactionIds,
        lines: linesToSubmit.map((l) => ({
          materialId: l.materialId,
          quantity: parseFloat(l.dispatchQty),
          quantityUomId: l.quantityUomId.trim() || undefined,
          returnQty: l.returnQty ? parseFloat(l.returnQty) : undefined,
          warehouseId: l.warehouseId || undefined,
        })),
      }).unwrap();

      toast.success(`Dispatched ${linesToSubmit.length} item(s)`);
      setLines([]);
      setSelectedJob('');
      setNotes('');
      setOverrideReason('');
      setExistingEntry(null);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Dispatch failed');
      throw err;
    }
  };

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) { toast.error('Select a job'); return; }

    const validLines = lines.filter((l) => l.materialId && l.dispatchQty);

    if (validLines.length === 0) {
      toast.error('Add at least one material');
      return;
    }
    if (validLines.some((line) => !line.warehouseId)) {
      toast.error('Select a warehouse for each dispatch line');
      return;
    }

    if (overrideSignals.requiresReason && !overrideReason.trim()) {
      toast.error('Enter an override reason before saving this dispatch');
      return;
    }

    for (const line of validLines) {
      if (!line.materialId || !line.dispatchQty) {
        // Skip lines with empty material or qty
        continue;
      }

      const qty = parseFloat(line.dispatchQty);
      const mat = getMaterial(line.materialId);

      // First check: Material exists
      if (!mat) {
        toast.error(`Material not found: ${line.materialId}`);
        return;
      }

      // Second check: Valid dispatch quantity
      if (isNaN(qty) || qty <= 0) {
        toast.error(`Invalid dispatch quantity for ${mat.name}. Please enter a valid number greater than 0.`);
        return;
      }

      // Third check: Material has stock data
      if (mat.currentStock === undefined || mat.currentStock === null) {
        toast.error(`Stock information missing for ${mat.name}. Please try refreshing the page.`);
        return;
      }

      // Fourth check: Warehouse stock is valid
      const selectedWarehouseStock = getWarehouseBaseStock(mat, line.warehouseId);
      if (!mat.allowNegativeConsumption && selectedWarehouseStock < 0) {
        toast.error(`Invalid warehouse stock value for ${mat.name}`);
        return;
      }

      // Fifth check: Return quantity is valid
      const ret = line.returnQty ? parseFloat(line.returnQty) : 0;
      if (isNaN(ret) || ret < 0) {
        toast.error(`Invalid return quantity for ${mat.name}`);
        return;
      }

      // Sixth check: Sufficient stock (compare in base UOM)
      const baseQty = qtyInBase(mat.materialUoms, line.quantityUomId, qty);
      const originalQty = line.originalDispatchQty ? parseFloat(String(line.originalDispatchQty)) : 0;
      const originalWarehouseMatches = line.originalWarehouseId && line.originalWarehouseId === line.warehouseId;
      if (!mat.allowNegativeConsumption) {
        if (isNaN(originalQty)) {
          const availableStock = selectedWarehouseStock;
          if (availableStock < baseQty) {
            toast.error(
              `Insufficient stock for ${mat.name} in selected warehouse. Requested: ${baseQty.toFixed(3)} ${mat.unit}, Available: ${availableStock.toFixed(3)} ${mat.unit}`
            );
            return;
          }
        } else {
          const availableStock = selectedWarehouseStock + (originalWarehouseMatches ? originalQty : 0);
          if (availableStock < baseQty) {
            toast.error(
              `Insufficient stock for ${mat.name} in selected warehouse. Requested: ${baseQty.toFixed(3)} ${mat.unit}, Available: ${availableStock.toFixed(3)} ${mat.unit}`
            );
            return;
          }
        }
      }

      if (ret > 0) {
        const retBase = qtyInBase(mat.materialUoms, line.quantityUomId, ret);
        const jobMatSummary = jobMaterials.find((jm: any) => jm.materialId === line.materialId);
        if (jobMatSummary) {
          const totalReturnAfter = jobMatSummary.returned + retBase;
          if (totalReturnAfter > jobMatSummary.dispatched) {
            const maxCanReturn = jobMatSummary.dispatched - jobMatSummary.returned;
            toast.error(
              `Cannot return ${retBase.toFixed(3)} ${mat.unit} (from return entry) for ${mat.name}. Only ${maxCanReturn.toFixed(3)} ${mat.unit} can be returned for this job (Total dispatched: ${jobMatSummary.dispatched.toFixed(3)}, Already returned: ${jobMatSummary.returned.toFixed(3)})`
            );
            return;
          }
        }
      }
    }

    setSubmitting(true);
    try {
      await executeSubmit(validLines);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1240px] space-y-4 overflow-x-hidden">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="space-y-4">
          <div className="mb-1 flex items-center gap-2">
            <Link href="/stock/dispatch" className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300/80 dark:hover:text-emerald-200">
              ← Dispatch
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">Dispatch worksheet</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">Dispatch stock to a job, capture returns in the same sheet, and keep every line easier to scan.</p>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link href="/stock/dispatch">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" form="dispatch-entry-form" loading={submitting}>
              Dispatch
            </Button>
          </div>
        </div>
      </div>

      {existingEntry?.exists && (
        <div className="bg-amber-600/15 border border-amber-500/30 rounded-lg p-4">
          <p className="text-sm text-amber-300">
            ⚠️ <strong>Entry found</strong> for this job on {date}. Data has been loaded for editing. Saving will update the existing entry.
          </p>
        </div>
      )}

      {budgetWarning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-600/10 p-4">
          <p className="text-sm font-medium text-amber-300">
            Budget warning: this dispatch may exceed the variation job material budget.
          </p>
          <div className="mt-3 space-y-2">
            {budgetWarning.rows.slice(0, 4).map((row) => (
              <div key={row.materialId} className="rounded-md bg-slate-950/30 px-3 py-2 text-xs text-slate-200">
                <span className="font-semibold text-white">{row.materialName}</span>
                {' · '}
                projected {row.projectedIssuedBaseQuantity.toFixed(3)} {row.baseUnit}
                {' vs budget '}
                {row.estimatedBaseQuantity.toFixed(3)} {row.baseUnit}
                {row.quantityOverrun > 0.0005 ? ` · over by ${row.quantityOverrun.toFixed(3)} ${row.baseUnit}` : ''}
              </div>
            ))}
            {budgetWarning.warningCount > 4 && (
              <p className="text-xs text-amber-200">+{budgetWarning.warningCount - 4} more material warning(s)</p>
            )}
          </div>
          <p className="mt-3 text-xs text-amber-200/90">
            Enter an override reason below if this extra issue is intentional.
          </p>
        </div>
      )}

      {overrideSignals.negativeStockLineCount > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-600/10 p-4">
          <p className="text-sm font-medium text-red-300">
            Override required: {overrideSignals.negativeStockLineCount} line(s) exceed available warehouse FIFO stock on a negative-consumption material.
          </p>
          <p className="mt-2 text-xs text-red-200/90">
            Saving will be blocked unless you capture the reason for this stock exception.
          </p>
        </div>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
        {[
          { label: 'Rows in use', value: String(populatedLines.length), note: `${lines.length} open lines` },
          { label: 'Dispatch qty', value: totalDispatchQty.toFixed(3), note: 'Entered total' },
          { label: 'Return qty', value: totalReturnQty.toFixed(3), note: 'Entered total' },
          { label: 'Budget warnings', value: budgetWarningLoading ? '...' : String(budgetWarning?.warningCount ?? 0), note: 'Variation budget check' },
        ].map((item) => (
          <div key={item.label} className="bg-white px-4 py-3 dark:bg-slate-950/80">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{item.value}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">{item.note}</p>
          </div>
        ))}
      </section>

      <form
        id="dispatch-entry-form"
        onSubmit={validateAndSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="space-y-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
      >
        {/* Header */}
        <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
            <div>
              <SearchSelect
                label="Job"
                required
                value={selectedJob}
                onChange={(id) => handleJobChange(id)}
                placeholder="Search jobs by number or customer..."
                items={selectableJobs.map((j) => ({
                    id: j.id,
                    label: j.jobNumber,
                    searchText: customers.find((c) => c.id === j.customerId)?.name || 'Unknown',
                  }))}
                renderItem={(item) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{item.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{item.searchText}</div>
                  </div>
                )}
                dropdownInPortal
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Dispatch Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Notes / Reference
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Override Reason
              </label>
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={overrideSignals.requiresReason ? 'Required for this dispatch' : 'Only needed for exceptions'}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-900 dark:text-white ${
                  overrideSignals.requiresReason
                    ? 'border-amber-400 bg-amber-50 focus:ring-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10'
                    : 'border-slate-200 bg-white focus:ring-emerald-500 dark:border-slate-700'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <DispatchLineGrid
          lines={lines}
          materials={materials}
          warehouses={warehouses}
          selectedJob={selectedJob}
          showWarehouseColumn={showWarehouseColumn}
          emptyMessage="No materials added yet. Click + Add to start."
          onUpdateLine={updateLine}
        />
      </form>

      {/* Change Warning Modal */}
      {changeWarningModal.open && changeWarningModal.pendingChange && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setChangeWarningModal({ open: false, pendingChange: null })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Unsaved Changes</h2>
            <p className="text-slate-300 text-sm mb-4">
              You have {lines.length} material{lines.length !== 1 ? 's' : ''} added. Changing the {changeWarningModal.pendingChange.type} will clear all unsaved materials and notes.
            </p>

            <div className="bg-amber-600/15 border border-amber-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-amber-300">
                ⚠️ <strong>Save first</strong> to keep your changes, or continue to discard them.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setChangeWarningModal({ open: false, pendingChange: null })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmChange}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 text-sm font-medium transition-colors"
              >
                Discard & Change
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

