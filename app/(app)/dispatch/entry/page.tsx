'use client';

import { useEffect, useState }            from 'react';
import Link                               from 'next/link';
import { useSession }                     from 'next-auth/react';
import { useSearchParams }                from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMaterials }                 from '@/store/slices/materialsSlice';
import { fetchJobs }                      from '@/store/slices/jobsSlice';
import { Button }                         from '@/components/ui/Button';
import SearchSelect                       from '@/components/ui/SearchSelect';
import toast                              from 'react-hot-toast';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface Line {
  id:       string;
  jobId:    string;
  materialId: string;
  dispatchQty: string;
  returnQty:   string;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

export default function DispatchMaterialsPage() {
  const dispatch = useAppDispatch();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { items: materials } = useAppSelector((s) => s.materials);
  const { items: jobs } = useAppSelector((s) => s.jobs);

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
  const [checkingEntry, setCheckingEntry] = useState(false);
  const [changeWarningModal, setChangeWarningModal] = useState<{ open: boolean; pendingChange: PendingChange | null }>({
    open: false,
    pendingChange: null,
  });

  useEffect(() => {
    dispatch(fetchMaterials());
    dispatch(fetchJobs());
  }, [dispatch]);

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
  useEffect(() => {
    const checkExistingEntry = async () => {
      if (!selectedJob || !date) {
        setExistingEntry(null);
        return;
      }

      setCheckingEntry(true);
      try {
        const params = new URLSearchParams({ jobId: selectedJob, date });
        const res = await fetch(`/api/transactions/dispatch-entry?${params}`);
        const json = await res.json();
        if (res.ok && json.data) {
          const data = json.data;
          setExistingEntry(data);

          // Auto-populate form if entry exists
          if (data.exists) {
            const newLines = data.lines.map((line: any) => ({
              id: generateId(),
              jobId: selectedJob,
              materialId: line.materialId,
              dispatchQty: line.quantity.toString(),
              returnQty: line.returnQty ? line.returnQty.toString() : '',
            }));
            setLines(newLines);
            setNotes(data.notes || '');
          } else {
            // No existing entry for this job+date, clear form
            setLines([]);
            setNotes('');
          }
        }
      } catch (err) {
        console.error('Failed to check entry:', err);
      } finally {
        setCheckingEntry(false);
      }
    };

    checkExistingEntry();
  }, [selectedJob, date]);

  const handleJobChange = (newJobId: string) => {
    // If materials are added, show warning
    if (lines.length > 0) {
      setChangeWarningModal({
        open: true,
        pendingChange: { type: 'job', newValue: newJobId },
      });
    } else {
      setSelectedJob(newJobId);
    }
  };

  const handleDateChange = (newDate: string) => {
    // If materials are added, show warning
    if (lines.length > 0) {
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

    // Clear materials and notes
    setLines([]);
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

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) { toast.error('Select a job'); return; }

    const validLines = lines.filter((l) => l.materialId && l.dispatchQty);
    if (validLines.length === 0) { toast.error('Add at least one material'); return; }

    // Validate quantities
    for (const line of validLines) {
      const qty = parseFloat(line.dispatchQty);
      const ret = line.returnQty ? parseFloat(line.returnQty) : 0;
      const mat = getMaterial(line.materialId);

      if (!qty || qty <= 0) { toast.error('Invalid dispatch quantity'); return; }
      if (ret < 0) { toast.error('Invalid return quantity'); return; }
      if (!mat) { toast.error('Material not found'); return; }
      if (mat.currentStock < qty) {
        toast.error(`Insufficient stock for ${mat.name}. Available: ${mat.currentStock}`);
        return;
      }
      if (ret > qty) {
        toast.error(`Return qty cannot exceed dispatch qty for ${mat.name}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/transactions/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:  'STOCK_OUT',
          jobId: selectedJob,
          notes: notes || undefined,
          date,
          existingTransactionIds: existingEntry?.transactionIds,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            quantity:   parseFloat(l.dispatchQty),
            returnQty:  l.returnQty ? parseFloat(l.returnQty) : undefined,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? 'Dispatch failed');
      } else {
        const json = await res.json();
        toast.success(`Dispatched ${validLines.length} item(s)`);
        dispatch(fetchMaterials());
        setLines([]);
        setSelectedJob('');
        setNotes('');
        setExistingEntry(null);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
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

      <form onSubmit={validateAndSubmit} className="space-y-0">
        {/* Header */}
        <div className="rounded-t-xl bg-slate-800 border border-slate-700 border-b-0 p-6">
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
                    searchText: typeof j.customerId === 'object' ? j.customerId.name : 'Unknown',
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
                  const mat = getMaterial(line.materialId);
                  const dispatchQty = parseFloat(line.dispatchQty) || 0;
                  const returnQty = parseFloat(line.returnQty) || 0;
                  const netQty = dispatchQty - returnQty;

                  return (
                    <tr key={line.id} className="border-b border-slate-700/60 hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>

                      <td className="px-4 py-2">
                        <SearchSelect
                          value={line.materialId}
                          onChange={(id) => updateLine(line.id, 'materialId', id)}
                          placeholder="Search materials..."
                          disabled={!selectedJob}
                          items={materials
                            .filter((m) => m.isActive && m.currentStock > 0)
                            .map((m) => ({
                              id: m._id,
                              label: m.name,
                              searchText: `${m.currentStock} ${m.unit}`,
                            }))}
                          renderItem={(item) => (
                            <div>
                              <div className="font-medium text-white">{item.label}</div>
                              <div className="text-xs text-slate-400">{item.searchText}</div>
                            </div>
                          )}
                        />
                      </td>

                      <td className="px-3 py-2 text-center text-slate-400 text-xs">
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
    </div>
  );
}
