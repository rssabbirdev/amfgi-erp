'use client';

import { useEffect, useState, useMemo } from 'react';
import Link                               from 'next/link';
import { useSearchParams }                from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import SearchSelect from '@/components/ui/SearchSelect';
import DispatchLineGrid from '@/components/stock/DispatchLineGrid';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  useGetMaterialsQuery,
  useGetJobsQuery,
  useGetDispatchEntryQuery,
  useGetDispatchEntryRevisionsQuery,
  useGetDispatchBudgetWarningMutation,
  useGetJobMaterialsQuery,
  useGetCustomersQuery,
  useAddBatchTransactionMutation,
  useGetWarehousesQuery,
  type DispatchBudgetWarningResult,
  type MaterialUomDto,
  type Material,
  type DispatchRevisionLineDto,
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
  targetWarehouseId?: string;
  materialLineId?: string;
  issuedQty?: number;
  receivedQty?: number;
  outstandingQty?: number;
  receiveQty?: string;
  receiveDestWarehouseId?: string;
  sourceTransactionId?: string;
  originalDispatchQty?: number; // Track original qty for editing validation
  originalWarehouseId?: string;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

interface OverrideExistingModalState {
  open: boolean;
  pendingLines: Line[] | null;
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

function formatDispatchRevisionTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function asDispatchRevisionLines(v: unknown): DispatchRevisionLineDto[] {
  if (!Array.isArray(v)) return [];
  return v as DispatchRevisionLineDto[];
}

function formatDispatchRevisionLine(row: DispatchRevisionLineDto) {
  const wh = row.warehouseName || row.warehouseId || '—';
  const ret =
    row.returnQtyBase > 0.0005 ? ` · return ${row.returnQtyBase.toFixed(3)} ${row.materialUnit}` : '';
  return `${row.materialName}: ${row.quantityBase.toFixed(3)} ${row.materialUnit} @ ${wh}${ret}`;
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

  const [lines,        setLines]        = useState<Line[]>(() => normalizeLines([emptyLine()]));
  const [selectedJob,  setSelectedJob]  = useState('');
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [existingEntry, setExistingEntry] = useState<{ exists: boolean; lines: any[]; transactionIds: string[]; notes: string } | null>(null);
  const [budgetWarning, setBudgetWarning] = useState<DispatchBudgetWarningResult | null>(null);
  const [budgetWarningValidatedForKey, setBudgetWarningValidatedForKey] = useState<string | null>(null);

  // Get total dispatched/returned for each material on this job across all dates
  const { data: jobMaterials = [] } = useGetJobMaterialsQuery(selectedJob, { skip: !selectedJob });
  const [changeWarningModal, setChangeWarningModal] = useState<{ open: boolean; pendingChange: PendingChange | null }>({
    open: false,
    pendingChange: null,
  });
  const [overrideExistingModal, setOverrideExistingModal] = useState<OverrideExistingModalState>({
    open: false,
    pendingLines: null,
  });

  useEffect(() => {
    setOverrideExistingModal({ open: false, pendingLines: null });
    setBudgetWarning(null);
    setBudgetWarningValidatedForKey(null);
  }, [selectedJob, date]);

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
  const { data: revisionData, isFetching: revisionsFetching } = useGetDispatchEntryRevisionsQuery(
    { jobId: selectedJob, date },
    { skip: !selectedJob || !date }
  );
  const revisions = revisionData?.revisions ?? [];

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

  const budgetWarningLinesKey = useMemo(() => JSON.stringify(budgetWarningLines), [budgetWarningLines]);

  /** Lines + job + date so a stale in-flight response cannot match after job/date switch. */
  const budgetWarningScopeKey = useMemo(
    () => `${selectedJob}::${date}::${budgetWarningLinesKey}`,
    [selectedJob, date, budgetWarningLinesKey]
  );

  const budgetWarningAppliesToCurrentLines = useMemo(
    () =>
      Boolean(
        budgetWarning &&
          budgetWarningValidatedForKey === budgetWarningScopeKey &&
          budgetWarning.applicable === true &&
          (budgetWarning.warningCount ?? 0) > 0
      ),
    [budgetWarning, budgetWarningScopeKey, budgetWarningValidatedForKey]
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

    const budgetWarningCount = budgetWarningAppliesToCurrentLines ? (budgetWarning?.warningCount ?? 0) : 0;
    return {
      negativeStockLineCount,
      budgetWarningCount,
      requiresReason: negativeStockLineCount > 0 || budgetWarningCount > 0,
    };
  }, [budgetWarning, budgetWarningAppliesToCurrentLines, lines, materials]);

  const budgetWarningMaterialIds = useMemo(
    () => (budgetWarningAppliesToCurrentLines ? budgetWarning?.rows.map((row) => row.materialId) ?? [] : []),
    [budgetWarning, budgetWarningAppliesToCurrentLines]
  );

  // Check if any line has actual data (not empty)
  const hasData = () => lines.some((l) => l.materialId || l.dispatchQty || l.returnQty);

  useEffect(() => {
    if (!selectedJob || budgetWarningLines.length === 0) {
      setBudgetWarning(null);
      setBudgetWarningValidatedForKey(null);
      return;
    }

    setBudgetWarningValidatedForKey(null);

    let cancelled = false;
    const requestScopeKey = budgetWarningScopeKey;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await getDispatchBudgetWarning({
            jobId: selectedJob,
            postingDate: date,
            lines: budgetWarningLines,
          }).unwrap();
          if (!cancelled) {
            setBudgetWarningValidatedForKey(requestScopeKey);
            setBudgetWarning(result.warningCount > 0 ? result : null);
          }
        } catch {
          if (!cancelled) {
            setBudgetWarning(null);
            setBudgetWarningValidatedForKey(null);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [budgetWarningLines, budgetWarningScopeKey, date, getDispatchBudgetWarning, selectedJob]);

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

  const confirmOverrideExistingSubmit = async () => {
    const pending = overrideExistingModal.pendingLines;
    if (!pending?.length) {
      setOverrideExistingModal({ open: false, pendingLines: null });
      return;
    }
    setOverrideExistingModal({ open: false, pendingLines: null });
    setSubmitting(true);
    try {
      await executeSubmit(pending);
    } finally {
      setSubmitting(false);
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

    if (existingEntry?.exists) {
      setOverrideExistingModal({ open: true, pendingLines: validLines });
      return;
    }

    setSubmitting(true);
    try {
      await executeSubmit(validLines);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 overflow-x-hidden">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/dispatch"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Dispatch
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Dispatch worksheet</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Dispatch stock to a job, capture returns in the same sheet, and keep every line easier to scan.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {budgetWarningLoading ? (
            <span className="text-xs tabular-nums text-muted-foreground">Checking budget…</span>
          ) : budgetWarningAppliesToCurrentLines && budgetWarning ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
              title="Variation job material budget — see breakdown below the line grid"
            >
              {budgetWarning.warningCount} budget warning{budgetWarning.warningCount === 1 ? '' : 's'}
            </Badge>
          ) : null}
          <Link href="/stock/dispatch" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Cancel
          </Link>
          <Button type="submit" form="dispatch-entry-form" size="sm" disabled={submitting}>
            {submitting ? 'Saving…' : 'Dispatch'}
          </Button>
        </div>
      </header>

      {existingEntry?.exists && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-foreground">
            ⚠️ <strong>Entry found</strong> for this job on {date}. Data has been loaded for editing. Saving will update the existing entry.
          </p>
        </div>
      )}

      {overrideSignals.negativeStockLineCount > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Override required: {overrideSignals.negativeStockLineCount} line(s) exceed available warehouse FIFO stock on a negative-consumption material.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Saving will be blocked unless you capture the reason for this stock exception.
          </p>
        </div>
      )}

      <form
        id="dispatch-entry-form"
        onSubmit={validateAndSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="flex flex-col gap-0 overflow-x-auto rounded-lg border border-border bg-card pb-8 shadow-sm sm:pb-10"
      >
        {/* Header */}
        <div className="border-b border-border p-4 sm:p-5">
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
                    <div className="font-medium text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.searchText}</div>
                  </div>
                )}
                dropdownInPortal
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dispatch Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes / Reference
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Override Reason
              </label>
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={overrideSignals.requiresReason ? 'Required for this dispatch' : 'Only needed for exceptions'}
                className={`w-full rounded-md border px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                  overrideSignals.requiresReason
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-border bg-background'
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
          persistScope="dispatch-entry"
          budgetWarningMaterialIds={budgetWarningMaterialIds}
        />

        {budgetWarningAppliesToCurrentLines && budgetWarning ? (
          <div className="border-t border-border bg-amber-500/5 px-4 py-4 sm:px-5">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-foreground">
                Budget warning: this dispatch may exceed the variation job material budget.
              </p>
              <div className="mt-3 space-y-2">
                {budgetWarning.rows.slice(0, 4).map((row) => (
                  <div
                    key={row.materialId}
                    className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
                  >
                    <span className="font-semibold">{row.materialName}</span>
                    {' · '}
                    projected {row.projectedIssuedBaseQuantity.toFixed(3)} {row.baseUnit}
                    {' vs budget '}
                    {row.estimatedBaseQuantity.toFixed(3)} {row.baseUnit}
                    {row.quantityOverrun > 0.0005 ? ` · over by ${row.quantityOverrun.toFixed(3)} ${row.baseUnit}` : ''}
                  </div>
                ))}
                {budgetWarning.warningCount > 4 && (
                  <p className="text-xs text-muted-foreground">
                    +{budgetWarning.warningCount - 4} more material warning(s)
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Enter an override reason above if this extra issue is intentional.
              </p>
            </div>
          </div>
        ) : null}
      </form>

      {selectedJob && date ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Dispatch revision history</h2>
            {revisionsFetching ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : (
              <span className="text-xs text-muted-foreground">{revisions.length} saved version(s)</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Each save records who posted it, whether it was a new worksheet or a replacement, and line-level
            quantities (base UOM) so changes stay auditable.
          </p>
          {!revisionsFetching && revisions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No revision events yet for this job and date. History appears after the first successful save.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {revisions.map((rev) => {
                const linesAfter = asDispatchRevisionLines(rev.linesAfter);
                const linesBefore = asDispatchRevisionLines(rev.linesBefore);
                const cs = rev.changeSummary as Record<string, unknown> | null;
                const diff =
                  cs && typeof cs === 'object' && 'added' in cs && Array.isArray(cs.added)
                    ? (cs as {
                        added: DispatchRevisionLineDto[];
                        removed: DispatchRevisionLineDto[];
                        changed: Array<{
                          materialName: string;
                          changes: Array<{ field: string; before: number; after: number }>;
                        }>;
                      })
                    : null;

                return (
                  <li key={rev.id} className="rounded-md border border-border bg-muted/25">
                    <details className="group">
                      <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {rev.action}
                          </Badge>
                          <span className="font-medium text-foreground">{rev.actorName}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDispatchRevisionTime(rev.createdAt)}
                          </span>
                          {rev.source !== 'WORKSHEET' ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {rev.source}
                            </Badge>
                          ) : null}
                        </div>
                      </summary>
                      <div className="space-y-3 border-t border-border px-3 pb-3 pt-2 text-xs text-foreground">
                        {rev.notesSnippet ? (
                          <p>
                            <span className="font-medium text-muted-foreground">Notes (snippet): </span>
                            {rev.notesSnippet}
                          </p>
                        ) : null}
                        {rev.action === 'UPDATE' && linesBefore.length > 0 ? (
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">Before (replaced snapshot)</p>
                            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                              {linesBefore.map((row) => (
                                <li key={`${rev.id}-b-${row.transactionId}`}>{formatDispatchRevisionLine(row)}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div>
                          <p className="mb-1 font-medium text-muted-foreground">After this save</p>
                          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                            {linesAfter.length === 0 ? (
                              <li className="list-none">No material lines (e.g. custom delivery note only).</li>
                            ) : (
                              linesAfter.map((row) => (
                                <li key={`${rev.id}-a-${row.transactionId}`}>{formatDispatchRevisionLine(row)}</li>
                              ))
                            )}
                          </ul>
                        </div>
                        {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) ? (
                          <div className="rounded-md border border-border bg-background/80 p-2">
                            <p className="mb-1 font-medium text-muted-foreground">What changed</p>
                            {diff.added.length > 0 ? (
                              <div className="mb-2">
                                <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                  Added lines
                                </p>
                                <ul className="mt-0.5 list-inside list-disc space-y-0.5">
                                  {diff.added.map((row, i) => (
                                    <li key={`${rev.id}-add-${i}`}>{formatDispatchRevisionLine(row)}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {diff.removed.length > 0 ? (
                              <div className="mb-2">
                                <p className="text-[10px] uppercase tracking-wide text-destructive">Removed lines</p>
                                <ul className="mt-0.5 list-inside list-disc space-y-0.5">
                                  {diff.removed.map((row, i) => (
                                    <li key={`${rev.id}-rem-${i}`}>{formatDispatchRevisionLine(row)}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {diff.changed.length > 0 ? (
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                  Quantity / return changes
                                </p>
                                <ul className="mt-0.5 space-y-1">
                                  {diff.changed.map((c, i) => (
                                    <li key={`${rev.id}-chg-${i}`}>
                                      <span className="font-medium">{c.materialName}</span>
                                      {c.changes.map((ch, j) => (
                                        <span key={j} className="text-muted-foreground">
                                          {' '}
                                          · {ch.field}: {String(ch.before)} → {String(ch.after)}
                                        </span>
                                      ))}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {/* Replace existing dispatch — confirmation */}
      {overrideExistingModal.open && overrideExistingModal.pendingLines && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={() => {
              if (!submitting) setOverrideExistingModal({ open: false, pendingLines: null });
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-existing-dispatch-title"
            className="fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <h2 id="override-existing-dispatch-title" className="text-lg font-semibold text-foreground">
              Replace existing dispatch?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              There is already a saved dispatch for{' '}
              <span className="font-medium text-foreground">
                {selectedJobRecord?.jobNumber ?? 'this job'}
              </span>{' '}
              on <span className="font-medium text-foreground">{date}</span>. Saving will overwrite that entry with the
              lines in this worksheet ({overrideExistingModal.pendingLines.length} material line
              {overrideExistingModal.pendingLines.length === 1 ? '' : 's'}).
            </p>
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-foreground">
                This cannot be undone from this screen. If you are unsure, cancel and verify the existing entry first.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => setOverrideExistingModal({ open: false, pendingLines: null })}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={submitting} onClick={() => void confirmOverrideExistingSubmit()}>
                {submitting ? 'Saving…' : 'Replace & save'}
              </Button>
            </div>
          </div>
        </>
      )}

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

