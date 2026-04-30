'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGetJobProfitabilityQuery } from '@/store/hooks';

function formatMoney(value: number | null) {
  if (value == null) return '-';
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatPct(value: number | null) {
  if (value == null) return '-';
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export default function JobProfitabilityPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetJobProfitabilityQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [focus, setFocus] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (focus === 'over_budget' && row.materialCostVariance <= 0.005) return false;
      if (focus === 'unbudgeted' && row.unbudgetedMaterialCount <= 0) return false;
      if (focus === 'reconcile' && row.reconcileCost <= 0.005) return false;
      if (!query) return true;

      const haystack = [
        row.customerName,
        row.parentJobNumber,
        row.variationJobNumber,
        row.variationDescription ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [focus, rows, search, status]);

  const handleExport = () => {
    if (filteredRows.length === 0) return;

    const headers = [
      'Customer',
      'Parent Job',
      'Variation Job',
      'Status',
      'Budget Material Cost',
      'Net Material Cost',
      'Material Cost Variance',
      'Unbudgeted Material Cost',
      'Reconcile Cost',
      'Variation Job Work Value',
      'Material Margin Against Variation Value',
    ];

    const csvRows = filteredRows.map((row) =>
      [
        row.customerName,
        row.parentJobNumber,
        row.variationJobNumber,
        row.status,
        row.budgetMaterialCost.toFixed(2),
        row.netMaterialCost.toFixed(2),
        row.materialCostVariance.toFixed(2),
        row.unbudgetedMaterialCost.toFixed(2),
        row.reconcileCost.toFixed(2),
        row.variationJobWorkValue == null ? '' : row.variationJobWorkValue.toFixed(2),
        row.materialMarginAgainstVariationValue == null ? '' : row.materialMarginAgainstVariationValue.toFixed(2),
      ].join(',')
    );

    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `job-profitability-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Job profitability</h1>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Reports
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Customer and job profitability
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Variation jobs are rolled up with their customer, parent job, material budget, actual issued cost,
                returns, and reconcile-linked consumption.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Variations</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.totalVariations ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Customers</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.customersCovered ?? 0}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Over budget</p>
              <p className="mt-2 text-xl font-semibold text-amber-900 dark:text-amber-100">{summary?.overBudgetCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Budget cost</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatMoney(summary?.totalBudgetMaterialCost ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Net cost</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatMoney(summary?.totalNetMaterialCost ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Unbudgeted jobs</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.withUnbudgetedMaterialCount ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_200px_auto]">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Customer, parent job, variation, description..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="ON_HOLD">On hold</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Focus</label>
              <select
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All jobs</option>
                <option value="over_budget">Over budget only</option>
                <option value="unbudgeted">Unbudgeted issues</option>
                <option value="reconcile">Reconcile linked</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Net cost = stock out minus returns. Reconcile cost is a subset of issued cost.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the profitability report. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="sticky left-0 z-20 min-w-[260px] border-r border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/95">
                      Customer / Job
                    </th>
                    <th className="min-w-[90px] px-3 py-3">Status</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Budget qty</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Budget cost</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Net qty</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Net cost</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Variance</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Variance %</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Unbudgeted</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Reconcile</th>
                    <th className="min-w-[150px] px-3 py-3 text-right">Variation value</th>
                    <th className="min-w-[150px] px-3 py-3 text-right">Material margin</th>
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
                        key={row.variationJobId}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                      >
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-3 py-2.5 align-top dark:border-slate-800">
                          <p className="font-medium text-slate-900 dark:text-white">{row.customerName}</p>
                          <div className="mt-1 space-y-1 text-xs">
                            <p className="text-slate-500 dark:text-slate-400">
                              Parent:{' '}
                              <Link href={`/customers/jobs/${row.parentJobId}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
                                {row.parentJobNumber}
                              </Link>
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              Variation:{' '}
                              <Link href={`/customers/jobs/${row.variationJobId}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
                                {row.variationJobNumber}
                              </Link>
                            </p>
                            {row.variationDescription ? (
                              <p className="line-clamp-2 text-slate-500 dark:text-slate-400">{row.variationDescription}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.status}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.budgetMaterialQuantity)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatMoney(row.budgetMaterialCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.netMaterialQuantity)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatMoney(row.netMaterialCost)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${row.materialCostVariance > 0.005 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                          {formatMoney(row.materialCostVariance)}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${row.materialCostVariance > 0.005 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {formatPct(row.budgetVariancePct)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.unbudgetedMaterialCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.reconcileCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.variationJobWorkValue)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.materialMarginAgainstVariationValue)}</td>
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
        <Link href="/reports/job-consumption" className="text-emerald-700 underline dark:text-emerald-300">
          Job consumption
        </Link>{' '}
        for quantity-first usage,{' '}
        <Link href="/reports/supplier-traceability" className="text-emerald-700 underline dark:text-emerald-300">
          supplier traceability
        </Link>{' '}
        for inbound-to-dispatch tracking,{' '}
        <Link href="/reports/stock-exceptions" className="text-emerald-700 underline dark:text-emerald-300">
          stock exceptions
        </Link>{' '}
        for override and adjustment trails,{' '}
        <Link href="/reports/stock-adjustments" className="text-emerald-700 underline dark:text-emerald-300">
          stock adjustments
        </Link>{' '}
        for manual correction value trail, and{' '}
        <Link href="/stock/integrity" className="text-emerald-700 underline dark:text-emerald-300">
          Stock integrity
        </Link>{' '}
        if the numbers drift.
      </p>
    </div>
  );
}
