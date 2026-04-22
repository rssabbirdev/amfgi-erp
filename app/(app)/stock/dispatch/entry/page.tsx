'use client';

import { useEffect, useState, useCallback }       from 'react';
import Link                               from 'next/link';
import { useSession }                     from 'next-auth/react';
import { useSearchParams }                from 'next/navigation';
import { Button }                         from '@/components/ui/Button';
import { Badge }                          from '@/components/ui/Badge';
import SearchSelect                       from '@/components/ui/SearchSelect';
import Modal                              from '@/components/ui/Modal';
import toast                              from 'react-hot-toast';
import {
  useGetMaterialsQuery,
  useGetJobsQuery,
  useGetDispatchEntryQuery,
  useGetJobMaterialsQuery,
  useGetCustomersQuery,
  useAddBatchTransactionMutation,
  useGetCompaniesQuery,
  useGetCrossCompanyMaterialsQuery,
  useTransferStockMutation,
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
  sourceCompanyId?:   string;   // undefined = own company; '' = toggled but unpicked
  sourceCompanyName?: string;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

interface CrossCompanyMaterial {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  isActive: boolean;
  materialUoms?: MaterialUomDto[];
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

// Sub-component to avoid conditional hook calls
function CrossCompanyMaterialLoader({
  companyId,
  onLoaded,
}: {
  companyId: string;
  onLoaded: (companyId: string, materials: CrossCompanyMaterial[]) => void;
}) {
  const { data = [] } = useGetCrossCompanyMaterialsQuery(companyId, { skip: !companyId });
  useEffect(() => {
    onLoaded(companyId, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, data]);
  return null;
}

export default function DispatchMaterialsPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { data: materials = [] } = useGetMaterialsQuery();
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: allCompanies = [] } = useGetCompaniesQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();
  const [transferStock] = useTransferStockMutation();

  // Permission check for cross-company transfers
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canTransfer = isSA || perms.includes('transaction.transfer');

  // Companies other than the active one
  const otherCompanies = allCompanies.filter((c) => c.id !== session?.user?.activeCompanyId);

  // Cross-company materials storage
  const [crossCompanyMaterialsMap, setCrossCompanyMaterialsMap] = useState<Record<string, any[]>>({});
  const handleCrossCompanyMaterialsLoaded = useCallback(
    (companyId: string, mats: any[]) => {
      setCrossCompanyMaterialsMap((prev) => ({ ...prev, [companyId]: mats }));
    },
    []
  );

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; crossCompanyLines: Line[] } | null>(null);

  const [lines,        setLines]        = useState<Line[]>(() => [
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
  ]);
  const [selectedJob,  setSelectedJob]  = useState('');
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [existingEntry, setExistingEntry] = useState<{ exists: boolean; lines: any[]; transactionIds: string[]; notes: string } | null>(null);
  const [allowInterCompanyTransfers, setAllowInterCompanyTransfers] = useState(false);

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
      setLines(
        Array.from({ length: 5 }, () => ({
          id: generateId(),
          jobId: '',
          materialId: '',
          dispatchQty: '',
          returnQty: '',
          quantityUomId: '',
        }))
      );
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

        const paddedLines =
          newLines.length < 5
            ? [
                ...newLines,
                ...Array.from({ length: 5 - newLines.length }, () => ({
                  id: generateId(),
                  jobId: selectedJob,
                  materialId: '',
                  dispatchQty: '',
                  returnQty: '',
                  quantityUomId: '',
                })),
              ]
            : newLines;

        setLines(paddedLines);
        setNotes(entryData.notes || '');
      } else {
        setLines(
          Array.from({ length: 5 }, () => ({
            id: generateId(),
            jobId: selectedJob,
            materialId: '',
            dispatchQty: '',
            returnQty: '',
            quantityUomId: '',
          }))
        );
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
    setLines(
      Array.from({ length: 5 }, () => ({
        id: generateId(),
        jobId: '',
        materialId: '',
        dispatchQty: '',
        returnQty: '',
        quantityUomId: '',
      }))
    );
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
  const selectedPrimaryContactName = selectedJobRecord?.contactPerson?.trim() || selectedJobContacts[0]?.name || '';
  const selectedPrimaryContact =
    selectedJobContacts.find((c) => c.name === selectedPrimaryContactName) ?? selectedJobContacts[0];

  // Get material from correct source (own company or cross-company)
  const getEffectiveMaterial = (line: Line) => {
    if (line.sourceCompanyId) {
      return (crossCompanyMaterialsMap[line.sourceCompanyId] ?? []).find((m) => m.id === line.materialId);
    }
    return getMaterial(line.materialId);
  };

  // Check if any line has actual data (not empty)
  const hasData = () => lines.some((l) => l.materialId || l.dispatchQty || l.returnQty);

  const addLine = () => {
    setLines((prev) => [...prev, {
      id:            generateId(),
      jobId:         selectedJob,
      materialId:    '',
      dispatchQty:   '',
      returnQty:     '',
      quantityUomId: '',
    }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              [field]: value,
              ...(field === 'materialId' ? { quantityUomId: '' } : {}),
            }
          : l
      )
    );
  };

  const toggleSourceMode = (lineId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              sourceCompanyId:   l.sourceCompanyId !== undefined ? undefined : '',
              sourceCompanyName: undefined,
              materialId:        '',  // reset material when toggling mode
            }
          : l
      )
    );
  };

  const setLineSourceCompany = (lineId: string, companyId: string) => {
    const co = allCompanies.find((c) => c.id === companyId);
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              sourceCompanyId:   companyId,
              sourceCompanyName: co?.name,
              materialId:        '',  // reset material when changing company
            }
          : l
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

  // Handle confirmation modal confirm button
  const handleConfirmTransfer = async () => {
    if (!confirmModal) return;
    setConfirmModal(null);
    setSubmitting(true);
    try {
      // Step 1: Execute transfers sequentially
      const transferResults: Array<{ lineId: string; destMaterialId: string }> = [];
      for (const line of confirmModal.crossCompanyLines) {
        const result = await transferStock({
          sourceCompanyId:      line.sourceCompanyId,
          destinationCompanyId: session!.user!.activeCompanyId!,
          materialId:           line.materialId,
          quantity:             parseFloat(line.dispatchQty),
          quantityUomId:        line.quantityUomId.trim() || undefined,
          notes:                `Cross-company sourcing for dispatch`,
          date,
        }).unwrap();
        transferResults.push({ lineId: line.id, destMaterialId: result.destMaterialId });
      }

      // Step 2: Remap cross-company lines to use local material IDs
      const crossCompanyLines = lines.filter((l) => l.sourceCompanyId);
      const ownLines = lines.filter((l) => !l.sourceCompanyId);
      const remappedCrossLines = crossCompanyLines.map((line) => {
        const mapping = transferResults.find((r) => r.lineId === line.id);
        return { ...line, materialId: mapping?.destMaterialId ?? line.materialId };
      });

      // Step 3: Submit batch dispatch with all lines
      await executeSubmit([...ownLines, ...remappedCrossLines]);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Transfer or dispatch failed');
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

    // Partition lines
    const crossCompanyLines = validLines.filter((l) => l.sourceCompanyId);
    const ownLines = validLines.filter((l) => !l.sourceCompanyId);

    // If cross-company and !canTransfer, error
    if (crossCompanyLines.length > 0 && !canTransfer) {
      toast.error('You do not have permission to source from other companies');
      return;
    }

    // Validate own-company quantities
    for (const line of ownLines) {
      if (!line.materialId || !line.dispatchQty) {
        // Skip lines with empty material or qty
        continue;
      }

      let qty = parseFloat(line.dispatchQty);
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
      if (isNaN(currentStock) || currentStock < 0) {
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

    // Validate cross-company quantities
    for (const line of crossCompanyLines) {
      if (!line.sourceCompanyId || line.sourceCompanyId === '') {
        toast.error('Select a source company for all cross-company rows');
        return;
      }
      if (line.sourceCompanyId === session?.user?.activeCompanyId) {
        toast.error('Cannot transfer from your own company. Select a different company.');
        return;
      }
      const ccMat = (crossCompanyMaterialsMap[line.sourceCompanyId] ?? []).find((m) => m.id === line.materialId);
      if (!ccMat) { toast.error(`Cross-company material not found for ${line.materialId}`); return; }
      const qty = parseFloat(line.dispatchQty);
      if (isNaN(qty)) { toast.error('Invalid dispatch quantity'); return; }

      const ccStock = typeof ccMat.currentStock === 'number' ? ccMat.currentStock : (typeof ccMat.currentStock === 'string' ? parseFloat(ccMat.currentStock) : 0);
      if (isNaN(ccStock)) {
        toast.error(`Invalid stock value for ${ccMat.name} at ${line.sourceCompanyName}`);
        return;
      }

      const ccBaseQty = qtyInBase(ccMat.materialUoms, line.quantityUomId, qty);
      if (ccStock < ccBaseQty) {
        toast.error(
          `Insufficient stock for ${ccMat.name} at ${line.sourceCompanyName}. Requested: ${ccBaseQty.toFixed(3)} ${ccMat.unit} (from entry), Available: ${ccStock.toFixed(3)} ${ccMat.unit}`
        );
        return;
      }
      const ret = line.returnQty ? parseFloat(line.returnQty) : 0;
      if (ret > 0) {
        const retBase = qtyInBase(ccMat.materialUoms, line.quantityUomId, ret);
        const jobMatSummary = jobMaterials.find((jm: any) => jm.materialId === line.materialId);
        if (jobMatSummary) {
          const totalReturnAfter = jobMatSummary.returned + retBase;
          if (totalReturnAfter > jobMatSummary.dispatched) {
            const maxCanReturn = jobMatSummary.dispatched - jobMatSummary.returned;
            toast.error(
              `Cannot return ${retBase.toFixed(3)} ${ccMat.unit} (from return entry) for ${ccMat.name}. Only ${maxCanReturn.toFixed(3)} ${ccMat.unit} can be returned for this job`
            );
            return;
          }
        }
      }
    }

    // If cross-company lines exist, show confirmation modal
    if (crossCompanyLines.length > 0) {
      setConfirmModal({ open: true, crossCompanyLines });
      return;
    }

    // Otherwise, submit directly
    setSubmitting(true);
    try {
      await executeSubmit(validLines);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link href="/stock/dispatch" className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 transition-colors hover:text-emerald-600 dark:text-emerald-300/80 dark:hover:text-emerald-200">
              ← Dispatch
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">Dispatch worksheet</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">Dispatch stock to a job, track returns in the same sheet, and keep issue rows easy to scan.</p>
        </div>
      </div>

      {existingEntry?.exists && (
        <div className="bg-amber-600/15 border border-amber-500/30 rounded-lg p-4">
          <p className="text-sm text-amber-300">
            ⚠️ <strong>Entry found</strong> for this job on {date}. Data has been loaded for editing. Saving will update the existing entry.
          </p>
        </div>
      )}

      {/* Load cross-company materials for all other companies upfront */}
      {allowInterCompanyTransfers && otherCompanies.map((company) => (
        <CrossCompanyMaterialLoader
          key={company.id}
          companyId={company.id}
          onLoaded={handleCrossCompanyMaterialsLoaded}
        />
      ))}

      <form id="dispatch-entry-form" onSubmit={validateAndSubmit} className="space-y-0">
        {/* Header */}
        <div className="rounded-t-3xl border border-slate-200 border-b-0 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/70">
          {/* Toggle for inter-company transfers */}
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Inter-company sourcing</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">Enable sourcing from other company stock when local stock is not the source.</p>
            </div>
            <button
              type="button"
              disabled={existingEntry?.exists ?? false}
              onClick={() => setAllowInterCompanyTransfers(!allowInterCompanyTransfers)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                existingEntry?.exists
                  ? 'opacity-50 cursor-not-allowed bg-slate-400 dark:bg-slate-700'
                  : allowInterCompanyTransfers
                  ? 'bg-emerald-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  allowInterCompanyTransfers ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <div>
              <SearchSelect
                label="Job"
                required
                value={selectedJob}
                onChange={(id) => handleJobChange(id)}
                placeholder="Search jobs by number or customer..."
                items={jobs
                  .filter((j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED')
                  .map((j) => ({
                    id: j.id,
                    label: j.jobNumber,
                    searchText: customers.find((c) => c.id === j.customerId)?.name || 'Unknown',
                  }))}
                renderItem={(item) => (
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-slate-400">{item.searchText}</div>
                  </div>
                )}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
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
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
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
          {selectedJob && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-500">Job Contact</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">{selectedPrimaryContactName || 'No contact assigned'}</p>
              {selectedPrimaryContact?.designation && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{selectedPrimaryContact.designation}</p>
              )}
              {selectedPrimaryContact?.number && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{selectedPrimaryContact.number}</p>
              )}
              {selectedPrimaryContact?.email && (
                <p className="mt-0.5 break-all text-xs text-slate-500 dark:text-slate-400">{selectedPrimaryContact.email}</p>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-200 border-b-0 bg-white dark:border-slate-800 dark:bg-slate-950/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
                <th className="w-8 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">#</th>
                <th className="min-w-[220px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Material</th>
                <th className="min-w-[128px] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">UOM</th>
                <th className="w-28 px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">In Stock</th>
                <th className="w-32 px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Dispatch Qty</th>
                <th className="w-32 px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">Return Qty</th>
                <th className="px-2 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No materials added yet. Click "+ Add" to start.
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const mat = getEffectiveMaterial(line);
                  const dispatchQty = parseFloat(line.dispatchQty) || 0;
                  const returnQty = parseFloat(line.returnQty) || 0;
                  const netQty = dispatchQty - returnQty;

                  return (
                    <tr key={line.id} className="align-top border-b border-slate-200 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-500">{idx + 1}</td>

                      <td className="px-4 py-2">
                        {/* Cross-company toggle and selector - only show if inter-company transfers enabled */}
                        {allowInterCompanyTransfers && canTransfer && (
                          <>
                            <div className="flex items-center gap-2 mb-1.5">
                              <button
                                type="button"
                                onClick={() => toggleSourceMode(line.id)}
                                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                  line.sourceCompanyId !== undefined
                                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                                    : 'bg-slate-700/40 border-slate-600 text-slate-400 hover:text-slate-300'
                                }`}
                              >
                                {line.sourceCompanyId !== undefined ? 'Other company' : 'Own stock'}
                              </button>
                              {line.sourceCompanyId && line.sourceCompanyId !== '' && (
                                <Badge label={line.sourceCompanyName ?? 'External'} variant="blue" />
                              )}
                            </div>

                            {/* Company selector (shown only when cross-company toggled) */}
                            {line.sourceCompanyId !== undefined && (
                              <select
                                value={line.sourceCompanyId}
                                onChange={(e) => setLineSourceCompany(line.id, e.target.value)}
                                className="mb-1.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              >
                                <option value="">Select company...</option>
                                {otherCompanies.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </>
                        )}

                        {/* Material selection with inline stock display */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            {line.sourceCompanyId && !line.sourceCompanyId && (
                              <div className="mb-1 text-xs text-amber-600 dark:text-yellow-400">Select a company first</div>
                            )}
                            <SearchSelect
                              value={line.materialId}
                              onChange={(id) => updateLine(line.id, 'materialId', id)}
                              placeholder={
                                line.sourceCompanyId && !line.sourceCompanyId
                                  ? 'Select a company first...'
                                  : 'Search materials...'
                              }
                              disabled={!selectedJob || (line.sourceCompanyId !== undefined && !line.sourceCompanyId)}
                              items={(
                                line.sourceCompanyId && line.sourceCompanyId !== ''
                                  ? (crossCompanyMaterialsMap[line.sourceCompanyId] ?? []).filter(
                                      (m) => m.isActive && m.currentStock > 0
                                    )
                                  : line.sourceCompanyId === undefined
                                  ? materials.filter((m) => m.isActive)
                                  : []
                              ).map((m) => ({
                                id: m.id,
                                label: m.name,
                                searchText: `${m.currentStock} ${m.unit}`,
                              }))}
                              renderItem={(item) => (
                                <div className="flex items-center justify-between w-full">
                                  <div className="font-medium text-white">{item.label}</div>
                                  <Badge label={item.searchText} variant="blue" />
                                </div>
                              )}
                            />
                          </div>
                          {/* Inline stock badge next to material name */}
                          {mat && line.materialId && (
                            <Badge
                              label={`${mat.currentStock.toFixed(3)} ${mat.unit}`}
                              variant="blue"
                            />
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-center text-slate-400 text-xs min-w-[120px]">
                        {mat?.materialUoms && mat.materialUoms.length > 0 ? (
                          <select
                            value={line.quantityUomId}
                            onChange={(e) => updateLine(line.id, 'quantityUomId', e.target.value)}
                            className="w-full max-w-44 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
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

                      <td className="px-3 py-2 text-right font-mono text-sm text-emerald-700 dark:text-emerald-300">
                        {mat?.currentStock ?? '—'}
                      </td>

                      <td className="px-3 py-2">
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

                      <td className="px-3 py-2">
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

                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="p-1 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
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

        {/* Footer */}
        <div className="flex justify-between gap-3 rounded-b-3xl border border-slate-200 border-t-0 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
          <Button
            type="button"
            variant="secondary"
            onClick={addLine}
            disabled={!selectedJob || !date}
            title={!selectedJob || !date ? 'Select a job and date first' : ''}
          >
            + Add Material
          </Button>
          <div className="flex gap-3">
            <Link href="/stock/dispatch">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" loading={submitting}>
              Dispatch
            </Button>
          </div>
        </div>
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

      {/* Confirmation Modal — Cross-Company Transfer */}
      <Modal
        isOpen={!!confirmModal?.open}
        onClose={() => setConfirmModal(null)}
        title="Confirm Cross-Company Sourcing"
        size="sm"
      >
        <p className="text-slate-300 text-sm mb-4">
          The following {confirmModal?.crossCompanyLines.length} material(s) will be sourced from other
          companies. Stock will first be <strong>transferred to your company</strong>, then dispatched.
        </p>

        <ul className="space-y-2 mb-5">
          {confirmModal?.crossCompanyLines.map((line) => {
            const mat = (crossCompanyMaterialsMap[line.sourceCompanyId!] ?? []).find(
              (m) => m.id === line.materialId
            );
            return (
              <li key={line.id} className="flex items-center justify-between bg-slate-700/40 rounded-lg px-3 py-2 text-sm">
                <span className="text-white font-medium">{mat?.name ?? line.materialId}</span>
                <span className="text-slate-400">
                  {line.dispatchQty} {mat?.unit} from{' '}
                  <span className="text-blue-300">{line.sourceCompanyName}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="bg-amber-600/15 border border-amber-500/30 rounded-lg p-3 mb-5">
          <p className="text-xs text-amber-300">
            This will create TRANSFER_OUT transactions in the source companies and credit stock to your
            company before dispatch. This action cannot be undone.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmModal(null)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirmTransfer}
            loading={submitting}
          >
            Transfer and Dispatch
          </Button>
        </div>
      </Modal>
    </div>
  );
}
