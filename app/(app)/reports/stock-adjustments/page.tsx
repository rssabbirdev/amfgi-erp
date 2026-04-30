'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Badge } from '@/components/ui/Badge';
import { useGetStockAdjustmentsQuery } from '@/store/hooks';

function formatMoney(value: number | null) {
  if (value == null) return '-';
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatEvidenceType(value: string | null) {
  switch (value) {
    case 'PHYSICAL_COUNT':
      return 'Physical count';
    case 'DAMAGE_REPORT':
      return 'Damage report';
    case 'SUPPLIER_CLAIM':
      return 'Supplier claim';
    case 'CUSTOMER_RETURN':
      return 'Customer return';
    case 'OTHER':
      return 'Other';
    default:
      return value || '-';
  }
}

function statusVariant(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  switch (status) {
    case 'APPROVED':
      return 'green' as const;
    case 'REJECTED':
      return 'red' as const;
    default:
      return 'yellow' as const;
  }
}

export default function StockAdjustmentsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetStockAdjustmentsQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [evidenceType, setEvidenceType] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (evidenceType !== 'all' && row.evidenceType !== evidenceType) return false;
      if (!query) return true;
      return [
        row.referenceNumber,
        row.reason,
        row.createdByName ?? '',
        row.decidedByName ?? '',
        row.evidenceReference ?? '',
        row.materialNames.join(' '),
        row.warehouseNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [evidenceType, rows, search, status]);

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock adjustments</h1>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Reports
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Stock adjustment report
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Bulk manual adjustments grouped by request, with evidence, requester, approver, warehouse coverage,
                and quantity and value impact.
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Requests</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.total ?? 0}</p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-900/40 dark:bg-yellow-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-yellow-700 dark:text-yellow-300">Pending</p>
              <p className="mt-2 text-xl font-semibold text-yellow-900 dark:text-yellow-100">{summary?.pending ?? 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Approved</p>
              <p className="mt-2 text-xl font-semibold text-emerald-900 dark:text-emerald-100">{summary?.approved ?? 0}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-red-700 dark:text-red-300">Rejected</p>
              <p className="mt-2 text-xl font-semibold text-red-900 dark:text-red-100">{summary?.rejected ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Add qty</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatQty(summary?.grossIncreaseQty ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Remove qty</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatQty(summary?.grossDecreaseQty ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Applied net value</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatMoney(summary?.appliedNetValue ?? 0)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_200px_auto]">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference, reason, requester, warehouse, material..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Evidence</label>
              <select
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All evidence</option>
                <option value="PHYSICAL_COUNT">Physical count</option>
                <option value="DAMAGE_REPORT">Damage report</option>
                <option value="SUPPLIER_CLAIM">Supplier claim</option>
                <option value="CUSTOMER_RETURN">Customer return</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Estimated value uses the requested line cost. Applied value uses approved transactions only.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the stock adjustment report. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="min-w-[150px] px-3 py-3">Created</th>
                    <th className="min-w-[150px] px-3 py-3">Reference</th>
                    <th className="min-w-[110px] px-3 py-3">Status</th>
                    <th className="min-w-[180px] px-3 py-3">Evidence</th>
                    <th className="min-w-[220px] px-3 py-3">Reason</th>
                    <th className="min-w-[180px] px-3 py-3">Warehouse / Material</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Add qty</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Remove qty</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Net qty</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Estimated</th>
                    <th className="min-w-[130px] px-3 py-3 text-right">Applied</th>
                    <th className="min-w-[180px] px-3 py-3">Requester / Approver</th>
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
                        key={row.id}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                      >
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{formatDateTime(row.createdAt)}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.lineCount} lines</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-900 dark:text-white">{row.referenceNumber}</td>
                        <td className="px-3 py-2.5">
                          <Badge label={row.status} variant={statusVariant(row.status)} />
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{formatEvidenceType(row.evidenceType)}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.evidenceReference || '-'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{row.reason}</div>
                          {row.decisionNote ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.decisionNote}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{row.warehouseNames.join(', ') || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {row.materialNames.join(', ') || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatQty(row.grossIncreaseQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">
                          {formatQty(row.grossDecreaseQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">
                          {formatQty(row.netQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(row.estimatedNetValue)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(row.appliedNetValue)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{row.createdByName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {row.decidedByName ? `${row.decidedByName} on ${formatDateTime(row.decidedAt)}` : 'Awaiting decision'}
                          </div>
                        </td>
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
        <Link href="/reports/stock-exceptions" className="text-slate-700 underline dark:text-slate-300">
          stock exceptions
        </Link>{' '}
        for the wider exception trail and{' '}
        <Link href="/stock/manual-adjustments" className="text-slate-700 underline dark:text-slate-300">
          bulk stock adjustments
        </Link>{' '}
        to request new adjustment batches.
      </p>
    </div>
  );
}
