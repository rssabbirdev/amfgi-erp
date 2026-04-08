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
} from '@/store/hooks';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface Line {
  id:       string;
  jobId:    string;
  materialId: string;
  dispatchQty: string;
  returnQty:   string;
  originalDispatchQty?: number; // Track original qty for editing validation
  sourceCompanyId?:   string;   // undefined = own company; '' = toggled but unpicked
  sourceCompanyName?: string;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

interface CrossCompanyMaterial {
  _id: string;
  name: string;
  unit: string;
  currentStock: number;
  isActive: boolean;
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
  }, [companyId, data, onLoaded]);
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
  const otherCompanies = allCompanies.filter((c) => c._id !== session?.user?.activeCompanyId);

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
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
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
        }))
      );
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

  const getMaterial = (id: string) => materials.find((m) => m._id === id);
  const getJob = (id: string) => jobs.find((j) => j._id === id);

  // Get material from correct source (own company or cross-company)
  const getEffectiveMaterial = (line: Line) => {
    if (line.sourceCompanyId) {
      return (crossCompanyMaterialsMap[line.sourceCompanyId] ?? []).find((m) => m._id === line.materialId);
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
    }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) => l.id === id ? { ...l, [field]: value } : l)
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
    const co = allCompanies.find((c) => c._id === companyId);
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
        jobId: selectedJob,
        notes: notes || undefined,
        date,
        existingTransactionIds: existingEntry?.transactionIds,
        lines: linesToSubmit.map((l) => ({
          materialId: l.materialId,
          quantity: parseFloat(l.dispatchQty),
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
          destinationCompanyId: session!.user!.activeCompanyId!,
          materialId:           line.materialId,
          quantity:             parseFloat(line.dispatchQty),
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
    if (validLines.length === 0) { toast.error('Add at least one material'); return; }

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

      // Sixth check: Sufficient stock
      const originalQty = line.originalDispatchQty ? parseFloat(String(line.originalDispatchQty)) : 0;
      if (isNaN(originalQty)) {
        const availableStock = currentStock;
        if (availableStock < qty) {
          toast.error(`Insufficient stock for ${mat.name}. Requested: ${qty.toFixed(3)} ${mat.unit}, Available: ${availableStock.toFixed(3)} ${mat.unit}`);
          return;
        }
      } else {
        const availableStock = currentStock + originalQty;
        if (availableStock < qty) {
          toast.error(`Insufficient stock for ${mat.name}. Requested: ${qty.toFixed(3)} ${mat.unit}, Available: ${availableStock.toFixed(3)} ${mat.unit}`);
          return;
        }
      }

      if (ret > 0) {
        const jobMatSummary = jobMaterials.find((jm: any) => jm.materialId === line.materialId);
        if (jobMatSummary) {
          const totalReturnAfter = jobMatSummary.returned + ret;
          if (totalReturnAfter > jobMatSummary.dispatched) {
            const maxCanReturn = jobMatSummary.dispatched - jobMatSummary.returned;
            toast.error(`Cannot return ${ret} ${mat.unit} of ${mat.name}. Only ${maxCanReturn.toFixed(3)} ${mat.unit} can be returned for this job (Total dispatched: ${jobMatSummary.dispatched.toFixed(3)}, Already returned: ${jobMatSummary.returned.toFixed(3)})`);
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
      const ccMat = (crossCompanyMaterialsMap[line.sourceCompanyId] ?? []).find((m) => m._id === line.materialId);
      if (!ccMat) { toast.error(`Cross-company material not found for ${line.materialId}`); return; }
      const qty = parseFloat(line.dispatchQty);
      if (isNaN(qty)) { toast.error('Invalid dispatch quantity'); return; }

      const ccStock = typeof ccMat.currentStock === 'number' ? ccMat.currentStock : (typeof ccMat.currentStock === 'string' ? parseFloat(ccMat.currentStock) : 0);
      if (isNaN(ccStock)) {
        toast.error(`Invalid stock value for ${ccMat.name} at ${line.sourceCompanyName}`);
        return;
      }

      if (ccStock < qty) {
        toast.error(`Insufficient stock for ${ccMat.name} at ${line.sourceCompanyName}. Requested: ${qty.toFixed(3)}, Available: ${ccStock.toFixed(3)} ${ccMat.unit}`);
        return;
      }
      const ret = line.returnQty ? parseFloat(line.returnQty) : 0;
      if (ret > 0) {
        const jobMatSummary = jobMaterials.find((jm: any) => jm.materialId === line.materialId);
        if (jobMatSummary) {
          const totalReturnAfter = jobMatSummary.returned + ret;
          if (totalReturnAfter > jobMatSummary.dispatched) {
            const maxCanReturn = jobMatSummary.dispatched - jobMatSummary.returned;
            toast.error(`Cannot return ${ret} ${ccMat.unit} of ${ccMat.name}. Only ${maxCanReturn.toFixed(3)} ${ccMat.unit} can be returned for this job`);
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dispatch" className="text-slate-500 hover:text-slate-300 text-sm">
              ← Dispatch
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">Dispatch Materials</h1>
          <p className="text-slate-400 text-sm mt-0.5">Dispatch stock to a job and track returns</p>
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
          key={company._id}
          companyId={company._id}
          onLoaded={handleCrossCompanyMaterialsLoaded}
        />
      ))}

      <form onSubmit={validateAndSubmit} className="space-y-0">
        {/* Header */}
        <div className="rounded-t-xl bg-slate-800 border border-slate-700 border-b-0 p-6">
          {/* Toggle for inter-company transfers */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-300">Allow Inter-Company Transfers</p>
              <p className="text-xs text-slate-500 mt-0.5">Enable sourcing from other company stock</p>
            </div>
            <button
              type="button"
              onClick={() => setAllowInterCompanyTransfers(!allowInterCompanyTransfers)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                allowInterCompanyTransfers
                  ? 'bg-emerald-600'
                  : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  allowInterCompanyTransfers ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
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
                    id: j._id,
                    label: j.jobNumber,
                    searchText: customers.find((c) => c._id === j.customerId)?.name || 'Unknown',
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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="border border-slate-700 border-b-0 bg-slate-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[220px]">Material</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-20">Unit</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">In Stock</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Dispatch Qty *</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Return Qty</th>
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
                    <tr key={line.id} className="border-b border-slate-700/60 hover:bg-slate-800/40 align-top">
                      <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>

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
                                className="w-full mb-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-md text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="">Select company...</option>
                                {otherCompanies.map((c) => (
                                  <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </>
                        )}

                        {/* Material selection with inline stock display */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            {line.sourceCompanyId && !line.sourceCompanyId && (
                              <div className="text-xs text-yellow-400 mb-1">Loading materials...</div>
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
                                  ? materials.filter((m) => m.isActive && m.currentStock > 0)
                                  : []
                              ).map((m) => ({
                                id: m._id,
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

                      <td className="px-3 py-2 text-center text-slate-400 text-xs min-w-[90px]">
                        {mat?.unit ?? '—'}
                      </td>

                      <td className="px-3 py-2 text-right text-emerald-400 font-mono text-sm">
                        {mat?.currentStock ?? '—'}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.dispatchQty}
                          onChange={(e) => updateLine(line.id, 'dispatchQty', e.target.value)}
                          placeholder="0.00"
                          disabled={!selectedJob}
                          className="w-full px-2.5 py-1.5 text-right bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
                          className="w-full px-2.5 py-1.5 text-right bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>

                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-slate-500 hover:text-red-400 p-1"
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
        <div className="rounded-b-xl bg-slate-800 border border-slate-700 border-t-0 p-4 flex gap-3 justify-between">
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
            <Link href="/dispatch">
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
              (m) => m._id === line.materialId
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
