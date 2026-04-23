'use client';

import { useEffect, useState, useMemo } from 'react';
import Link                               from 'next/link';
import { useSearchParams }                from 'next/navigation';
import { Button }                         from '@/components/ui/Button';
import SearchSelect                       from '@/components/ui/SearchSelect';
import toast                              from 'react-hot-toast';
import {
  useGetMaterialsQuery,
  useGetJobsQuery,
  useGetDispatchEntryQuery,
  useGetJobMaterialsQuery,
  useGetCustomersQuery,
  useAddBatchTransactionMutation,
  type MaterialUomDto,
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
  originalDispatchQty?: number; // Track original qty for editing validation
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
  };
}

function isLineEmpty(line: Line) {
  return (
    !line.materialId &&
    !line.dispatchQty &&
    !line.returnQty &&
    !line.quantityUomId
  );
}

function normalizeLines(lines: Line[], jobId = '') {
  const nonEmptyLines = lines.filter((line) => !isLineEmpty(line));
  const requiredEmptyRows = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmptyLines.length);
  return [...nonEmptyLines, ...Array.from({ length: requiredEmptyRows }, () => emptyLine(jobId))];
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

export default function DispatchMaterialsPage() {
  const searchParams = useSearchParams();
  const { data: materials = [] } = useGetMaterialsQuery();
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();

  const [lines,        setLines]        = useState<Line[]>(() => normalizeLines([emptyLine()]));
  const [selectedJob,  setSelectedJob]  = useState('');
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [existingEntry, setExistingEntry] = useState<{ exists: boolean; lines: any[]; transactionIds: string[]; notes: string } | null>(null);

  // Get total dispatched/returned for each material on this job across all dates
  const { data: jobMaterials = [] } = useGetJobMaterialsQuery(selectedJob, { skip: !selectedJob });
  const [changeWarningModal, setChangeWarningModal] = useState<{ open: boolean; pendingChange: PendingChange | null }>({
    open: false,
    pendingChange: null,
  });

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
      return;
    }

    if (entryData) {
      setExistingEntry(entryData);

      if (entryData.exists) {
        const newLines = entryData.lines.map((line: any) => ({
          id: generateId(),
          jobId: selectedJob,
          materialId: line.materialId,
          dispatchQty: line.quantity.toString(),
          returnQty: line.returnQty ? line.returnQty.toString() : '',
          quantityUomId: '',
          originalDispatchQty: line.quantity,
        }));

        setLines(normalizeLines(newLines, selectedJob));
        setNotes(entryData.notes || '');
      } else {
        setLines(normalizeLines([emptyLine(selectedJob)], selectedJob));
        setNotes('');
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

  // Check if any line has actual data (not empty)
  const hasData = () => lines.some((l) => l.materialId || l.dispatchQty || l.returnQty);

  const removeLine = (id: string) => {
    setLines((prev) => normalizeLines(prev.filter((l) => l.id !== id), selectedJob));
  };

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
            ...(field === 'materialId' ? { quantityUomId: '' } : {}),
          };
        }),
        selectedJob
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
        date,
        existingTransactionIds: existingEntry?.transactionIds,
        lines: linesToSubmit.map((l) => ({
          materialId: l.materialId,
          quantity: parseFloat(l.dispatchQty),
          quantityUomId: l.quantityUomId.trim() || undefined,
          returnQty: l.returnQty ? parseFloat(l.returnQty) : undefined,
        })),
      }).unwrap();

      toast.success(`Dispatched ${linesToSubmit.length} item(s)`);
      setLines([]);
      setSelectedJob('');
      setNotes('');
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

      // Fourth check: Parse stock value correctly
      const currentStock = typeof mat.currentStock === 'number' ? mat.currentStock : parseFloat(String(mat.currentStock));
      if (isNaN(currentStock) || (!mat.allowNegativeConsumption && currentStock < 0)) {
        toast.error(`Invalid stock value for ${mat.name}: ${mat.currentStock}`);
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
      if (!mat.allowNegativeConsumption) {
        if (isNaN(originalQty)) {
          const availableStock = currentStock;
          if (availableStock < baseQty) {
            toast.error(
              `Insufficient stock for ${mat.name}. Requested: ${baseQty.toFixed(3)} ${mat.unit} (from entry), Available: ${availableStock.toFixed(3)} ${mat.unit}`
            );
            return;
          }
        } else {
          const availableStock = currentStock + originalQty;
          if (availableStock < baseQty) {
            toast.error(
              `Insufficient stock for ${mat.name}. Requested: ${baseQty.toFixed(3)} ${mat.unit} (from entry), Available: ${availableStock.toFixed(3)} ${mat.unit}`
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

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-3">
        {[
          { label: 'Rows in use', value: String(populatedLines.length), note: `${lines.length} open lines` },
          { label: 'Dispatch qty', value: totalDispatchQty.toFixed(3), note: 'Entered total' },
          { label: 'Return qty', value: totalReturnQty.toFixed(3), note: 'Entered total' },
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
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.25fr)_220px_minmax(220px,0.85fr)]">
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
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden border-b border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto overscroll-x-contain">
          <table className="min-w-[940px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
                <th className="w-8 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">#</th>
                <th className="min-w-[280px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Material</th>
                <th className="w-[150px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">UOM</th>
                <th className="w-[120px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">In Stock</th>
                <th className="w-[138px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Dispatch Qty</th>
                <th className="w-[138px] px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Return Qty</th>
                <th className="w-[56px] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Clr</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No materials added yet. Click &quot;+ Add&quot; to start.
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const mat = getMaterial(line.materialId);

                  return (
                    <tr key={line.id} className="align-top border-b border-slate-200 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-500">{idx + 1}</td>

                      <td className="min-w-0 px-3 py-2">
                        <div className="min-w-0">
                          <div className="min-w-0">
                            <SearchSelect
                              value={line.materialId}
                              onChange={(id) => updateLine(line.id, 'materialId', id)}
                              onBlurInputValue={(inputValue) => {
                                if (!inputValue.trim() && line.materialId) {
                                  updateLine(line.id, 'materialId', '');
                                }
                              }}
                              placeholder="Search materials..."
                              disabled={!selectedJob}
                              items={materials.filter((m) => m.isActive).map((m) => ({
                                id: m.id,
                                label: m.name,
                                searchText: `${m.currentStock} ${m.unit}`,
                              }))}
                              dropdownInPortal
                              inputProps={{ className: 'min-w-0 pr-8' }}
                              renderItem={(item) => (
                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <div className="truncate font-medium text-slate-900 dark:text-white">{item.label}</div>
                                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                                    {item.searchText}
                                  </span>
                                </div>
                              )}
                            />
                          </div>
                          {mat && line.materialId && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-2 text-center text-slate-400 text-xs">
                        {mat?.materialUoms && mat.materialUoms.length > 0 ? (
                          <select
                            value={line.quantityUomId}
                            onChange={(e) => updateLine(line.id, 'quantityUomId', e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            {mat.materialUoms.map((u: MaterialUomDto) => (
                              <option key={u.id} value={u.isBase ? '' : u.id}>
                                {u.unitName}
                                {u.isBase ? ' (base)' : ` (=${u.factorToBase} ${mat.unit})`}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{mat?.unit ?? '—'}</span>
                        )}
                      </td>

                      <td className="px-2 py-2 text-right font-mono text-sm text-emerald-700 dark:text-emerald-300">
                        {mat?.currentStock ?? '—'}
                      </td>

                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          disabled={!selectedJob || !mat || mat.currentStock === 0}
                          value={line.dispatchQty}
                          onChange={(e) => updateLine(line.id, 'dispatchQty', e.target.value)}
                          title={!mat ? '' : mat.currentStock === 0 ? 'No stock available for this material' : ''}
                          placeholder="0.00"
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>

                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.returnQty}
                          onChange={(e) => updateLine(line.id, 'returnQty', e.target.value)}
                          placeholder="0.00"
                          disabled={!selectedJob}
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>

                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          aria-label={`Clear row ${idx + 1}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Footer */}
        <div className="h-4 dark:bg-slate-950/70" />
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

