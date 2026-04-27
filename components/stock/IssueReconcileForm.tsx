'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import {
  useGetCompaniesQuery,
  useDeleteTransactionMutation,
  useGetNonStockReconcileDataQuery,
  useGetWarehousesQuery,
  useReconcileNonStockMutation,
} from '@/store/hooks';

type QtyMap = Record<string, string>;
type WarehouseMap = Record<string, string>;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function IssueReconcileForm() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const editingTransactionId = searchParams.get('transactionId');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useGetNonStockReconcileDataQuery({ date });
  const [reconcileNonStock, { isLoading: submitting }] = useReconcileNonStockMutation();
  const [deleteTransaction] = useDeleteTransactionMutation();
  const [qtyMap, setQtyMap] = useState<QtyMap>({});
  const [warehouseMap, setWarehouseMap] = useState<WarehouseMap>({});
  const [selectedJobs, setSelectedJobs] = useState<string[] | null>(null);
  const [notes, setNotes] = useState('');
  const { data: companies = [] } = useGetCompaniesQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const effectiveSelectedJobs = selectedJobs ?? data?.jobs.map((job) => job.id) ?? [];
  const perms = (session?.user?.permissions ?? []) as string[];
  const canReconcile = (session?.user?.isSuperAdmin ?? false) || perms.includes('transaction.reconcile');
  const activeCompany = companies.find((company) => company.id === session?.user?.activeCompanyId);
  const warehouseMode = activeCompany?.warehouseMode ?? 'DISABLED';
  const showWarehouseColumn = warehouseMode !== 'DISABLED';

  useEffect(() => {
    if (!editingTransactionId) return;

    let cancelled = false;
    const loadTransaction = async () => {
      try {
        const res = await fetch(`/api/transactions/${editingTransactionId}`);
        const json = await res.json();
        if (!res.ok || !json.data || cancelled) return;

        const transaction = json.data as {
          id: string;
          materialId: string;
          warehouseId?: string | null;
          quantity: number;
          date: string;
          notes?: string | null;
          jobId?: string | null;
        };

        setDate(new Date(transaction.date).toISOString().slice(0, 10));
        setQtyMap({ [transaction.materialId]: String(transaction.quantity) });
        setWarehouseMap(transaction.warehouseId ? { [transaction.materialId]: transaction.warehouseId } : {});
        setSelectedJobs(transaction.jobId ? [transaction.jobId] : []);
        setNotes(
          (transaction.notes ?? '')
            .replace(/^Non-stock reconcile\.\s*/i, '')
            .replace(/^Non-stock reconcile\s*/i, '')
            .trim()
        );
      } catch {
        if (!cancelled) {
          toast.error('Failed to load reconcile entry');
        }
      }
    };

    void loadTransaction();
    return () => {
      cancelled = true;
    };
  }, [editingTransactionId]);

  const activeLines = useMemo(
    () =>
      (data?.materials ?? [])
        .map((material) => ({
          materialId: material.id,
          quantity: Number.parseFloat(qtyMap[material.id] || '0'),
        }))
        .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0),
    [data, qtyMap]
  );

  const totalDistributionQty = useMemo(
    () => activeLines.reduce((sum, line) => sum + line.quantity, 0),
    [activeLines]
  );

  const toggleJob = (jobId: string) => {
    setSelectedJobs((prev) => {
      const current = prev ?? data?.jobs.map((job) => job.id) ?? [];
      return current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId];
    });
  };

  const handleSubmit = async () => {
    if (activeLines.length === 0) {
      toast.error('Enter at least one non-stock quantity to distribute');
      return;
    }
    if (effectiveSelectedJobs.length === 0) {
      toast.error('Select at least one job variation');
      return;
    }
    if (warehouseMode === 'REQUIRED' && activeLines.some((line) => !warehouseMap[line.materialId])) {
      toast.error('Select a warehouse for each non-stock line');
      return;
    }

    try {
      if (editingTransactionId) {
        await deleteTransaction(editingTransactionId).unwrap();
      }

      const result = await reconcileNonStock({
        jobIds: effectiveSelectedJobs,
        lines: activeLines.map((line) => ({
          materialId: line.materialId,
          quantity: line.quantity,
          warehouseId: warehouseMap[line.materialId] || undefined,
        })),
        notes: notes.trim() || undefined,
        date,
      }).unwrap();

      toast.success(
        editingTransactionId
          ? `Updated reconcile with ${result.created} transaction(s)`
          : `Created ${result.created} reconcile transaction(s)`
      );
      setQtyMap({});
      setWarehouseMap({});
      setNotes('');
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to reconcile non-stock items';
      toast.error(message);
    }
  };

  if (!canReconcile) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">You do not have permission to create or edit issue reconcile entries.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Issue Reconcile
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                {editingTransactionId ? 'Edit non-stock distribution' : 'Create non-stock distribution'}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Enter the non-stock quantities to distribute, choose the variation jobs that have dispatch-note activity in the selected posting month, and post the allocation using FIFO cost layers first.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/stock/issue-reconcile">
                <Button variant="ghost">View history</Button>
              </Link>
              <Button onClick={handleSubmit} loading={submitting}>
                {editingTransactionId ? 'Save reconcile' : 'Post reconcile'}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Non-stock items</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{data?.materials.length ?? 0}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Variation jobs</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{data?.jobs.length ?? 0}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Distribution qty</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatNumber(totalDistributionQty)}</p>
          </div>
        </div>
      </section>

      {editingTransactionId ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Edit warning</p>
          <p className="mt-2 text-sm leading-6 text-amber-800 dark:text-amber-200">
            Saving this form will delete the current reconcile entry first, reverse its stock and FIFO batch effect, then create a new reconcile from the values entered here.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Non-stock items</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Enter how much quantity should be distributed now.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
                <tr>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">On hand</th>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Distribute qty</th>
                  {showWarehouseColumn ? <th className="px-4 py-3">Warehouse</th> : null}
                </tr>
              </thead>
              <tbody>
                {(data?.materials ?? []).map((material) => (
                  <tr key={material.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{material.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{material.unit}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {formatNumber(material.currentStock)} {material.unit}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        material.allowNegativeConsumption
                          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                      }`}>
                        {material.allowNegativeConsumption ? 'Can go negative' : 'Stops at zero'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={qtyMap[material.id] ?? ''}
                          onChange={(e) => setQtyMap((prev) => ({ ...prev, [material.id]: e.target.value }))}
                          className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                          placeholder="0.000"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-500">{material.unit}</span>
                      </div>
                    </td>
                    {showWarehouseColumn ? (
                      <td className="px-4 py-3">
                        <select
                          value={warehouseMap[material.id] ?? material.warehouseId ?? ''}
                          onChange={(e) => setWarehouseMap((prev) => ({ ...prev, [material.id]: e.target.value }))}
                          className="w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                        >
                          <option value="">
                            {warehouseMode === 'REQUIRED' ? 'Select warehouse...' : 'Use fallback/default'}
                          </option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!isLoading && (data?.materials.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={showWarehouseColumn ? 5 : 4} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                      No non-stock items found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Job variations</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Only active variation jobs with dispatch-note activity in the selected posting month are shown. All are selected by default.</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedJobs(data?.jobs.map((job) => job.id) ?? [])}>
                Select all
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedJobs([])}>
                Clear
              </Button>
            </div>

            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
              {(data?.jobs ?? []).map((job) => (
                <label
                  key={job.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <input
                    type="checkbox"
                    checked={effectiveSelectedJobs.includes(job.id)}
                    onChange={() => toggleJob(job.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{job.jobNumber}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">{job.customerName || 'No company name'}</p>
                    {job.description ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{job.description}</p>
                    ) : null}
                  </div>
                </label>
              ))}
              {!isLoading && (data?.jobs.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  No variation jobs with dispatch-note activity were found for this posting month.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Posting</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSelectedJobs(null);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Notes</label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
                  placeholder="Optional reconcile note"
                />
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-6 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Selected jobs share each entered quantity evenly. FIFO batches are consumed first, and negative stock is only allowed for materials explicitly marked to allow it.
                The variation list refreshes from dispatch-note activity in the posting month you select above.
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Previous history</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Recent non-stock issue reconcile postings.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(data?.history ?? []).slice(0, 20).map((entry) => (
                <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{new Date(entry.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{entry.materialName}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{entry.jobNumber}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{entry.customerName || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatNumber(entry.quantity)} {entry.unit}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatMoney(entry.totalCost)}</td>
                </tr>
              ))}
              {!isLoading && (data?.history.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                    No reconcile history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
