'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGetSupplierTraceabilityQuery } from '@/store/hooks';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-GB');
}

export default function SupplierTraceabilityPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetSupplierTraceabilityQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (focus === 'open' && row.quantityAvailable <= 0.0005) return false;
      if (focus === 'dispatched' && row.dispatchCount <= 0) return false;
      if (focus === 'returned' && row.returnedQuantity <= 0.0005) return false;
      if (focus === 'unlinked_receipt' && row.receiptNumber) return false;
      if (!query) return true;

      const haystack = [
        row.supplierName,
        row.receiptNumber ?? '',
        row.batchNumber,
        row.materialName,
        row.warehouseName ?? '',
        row.jobs.map((job) => job.jobNumber).join(' '),
        row.customers.map((customer) => customer.name).join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [focus, rows, search]);

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Supplier traceability</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">You do not have permission to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300/80">
                Reports
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Supplier traceability
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Follow each receipt batch from supplier and receipt number into warehouse stock, dispatch usage,
                linked jobs, and customer delivery flow.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Batches</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.totalBatches ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Suppliers</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.suppliersCovered ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Open batches</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.openBatches ?? 0}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Dispatched</p>
              <p className="mt-2 text-xl font-semibold text-sky-900 dark:text-sky-100">{summary?.dispatchedBatchCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Receipt linked</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.receiptLinkedCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Returned</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.returnedBatchCount ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Supplier, receipt, batch, material, job, customer..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Focus</label>
              <select
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All batches</option>
                <option value="open">Open stock only</option>
                <option value="dispatched">Dispatched only</option>
                <option value="returned">Returned only</option>
                <option value="unlinked_receipt">No receipt number</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-slate-500 dark:text-slate-500">
                One row per batch. Jobs and customers are taken from the linked dispatch and return activity.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the supplier traceability report. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="sticky left-0 z-20 min-w-[280px] border-r border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/95">
                      Supplier / Batch
                    </th>
                    <th className="min-w-[170px] px-3 py-3">Material</th>
                    <th className="min-w-[140px] px-3 py-3">Warehouse</th>
                    <th className="min-w-[90px] px-3 py-3 text-right">Received</th>
                    <th className="min-w-[90px] px-3 py-3 text-right">Available</th>
                    <th className="min-w-[90px] px-3 py-3 text-right">Net issued</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Receipt cost</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Issued cost</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Dispatches</th>
                    <th className="min-w-[220px] px-3 py-3">Jobs</th>
                    <th className="min-w-[220px] px-3 py-3">Customers</th>
                    <th className="min-w-[110px] px-3 py-3">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        No rows match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.batchId}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                      >
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-3 py-2.5 align-top dark:border-slate-800">
                          <p className="font-medium text-slate-900 dark:text-white">{row.supplierName}</p>
                          <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <p>Batch: <Link href="/stock/stock-batches" className="text-sky-700 hover:underline dark:text-sky-300">{row.batchNumber}</Link></p>
                            <p>Receipt: {row.receiptNumber || 'No receipt number'}</p>
                            <p>Received: {formatDate(row.receivedDate)}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-medium text-slate-900 dark:text-white">{row.materialName}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.unit}</p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.warehouseName || '-'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.quantityReceived)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.quantityAvailable)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.netIssuedQuantity)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.receiptCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.issuedCost - row.returnedCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {row.dispatchCount}
                          <span className="ml-1 text-xs text-slate-400">DN {row.deliveryNoteCount}</span>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {row.jobs.length === 0 ? (
                            <span className="text-slate-400 dark:text-slate-500">No dispatch links</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {row.jobs.map((job) => (
                                <Link
                                  key={job.id}
                                  href={`/customers/jobs/${job.id}`}
                                  className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
                                >
                                  {job.jobNumber}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {row.customers.length === 0 ? (
                            <span className="text-slate-400 dark:text-slate-500">No customer links</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {row.customers.map((customer) => (
                                <span
                                  key={customer.id}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                                >
                                  {customer.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatDate(row.lastActivityDate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-500">
        Use{' '}
        <Link href="/reports/job-profitability" className="text-sky-700 underline dark:text-sky-300">
          customer and job profitability
        </Link>{' '}
        to evaluate the cost impact after tracing the batch path.
      </p>
    </div>
  );
}
