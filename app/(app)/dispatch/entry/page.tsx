'use client';

import { useEffect, useState }            from 'react';
import Link                               from 'next/link';
import { useSession }                     from 'next-auth/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMaterials }                 from '@/store/slices/materialsSlice';
import { fetchJobs }                      from '@/store/slices/jobsSlice';
import { Button }                         from '@/components/ui/Button';
import toast                              from 'react-hot-toast';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface Line {
  id:       string;
  jobId:    string;
  materialId: string;
  dispatchQty: string;
  returnQty:   string;
}

export default function DispatchMaterialsPage() {
  const dispatch = useAppDispatch();
  const { data: session } = useSession();
  const { items: materials } = useAppSelector((s) => s.materials);
  const { items: jobs } = useAppSelector((s) => s.jobs);

  const [lines,        setLines]        = useState<Line[]>([]);
  const [selectedJob,  setSelectedJob]  = useState('');
  const [date,         setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [notes,        setNotes]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [existingEntry, setExistingEntry] = useState<{ exists: boolean; lines: any[]; transactionIds: string[]; notes: string } | null>(null);
  const [checkingEntry, setCheckingEntry] = useState(false);

  useEffect(() => {
    dispatch(fetchMaterials());
    dispatch(fetchJobs());
  }, [dispatch]);

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
              returnQty: '',
            }));
            setLines(newLines);
            setNotes(data.notes || '');
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
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Job *
              </label>
              <select
                required
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Select job…</option>
                {jobs
                  .filter((j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED')
                  .map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.jobNumber} — {typeof j.customerId === 'object' ? j.customerId.name : 'Unknown'}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Dispatch Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
                        <select
                          value={line.materialId}
                          onChange={(e) => updateLine(line.id, 'materialId', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-800 border border-slate-600 text-white"
                        >
                          <option value="">— Select —</option>
                          {materials
                            .filter((m) => m.isActive && m.currentStock > 0)
                            .map((m) => (
                              <option key={m._id} value={m._id}>
                                {m.name} ({m.currentStock} {m.unit})
                              </option>
                            ))}
                        </select>
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
                          className="w-full px-2.5 py-1.5 text-right bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
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
                          className="w-full px-2.5 py-1.5 text-right bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
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
          <Button type="button" variant="secondary" onClick={addLine}>
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
    </div>
  );
}
