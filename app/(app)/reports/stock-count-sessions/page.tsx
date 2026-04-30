'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Badge } from '@/components/ui/Badge';
import { useGetStockCountSessionsReportQuery } from '@/store/hooks';

function formatQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function sessionVariant(status: string) {
  switch (status) {
    case 'ADJUSTMENT_APPROVED':
      return 'green' as const;
    case 'ADJUSTMENT_REJECTED':
      return 'red' as const;
    case 'ADJUSTMENT_PENDING':
      return 'yellow' as const;
    case 'CANCELLED':
      return 'gray' as const;
    default:
      return 'blue' as const;
  }
}

function approvalVariant(status: string | null) {
  switch (status) {
    case 'APPROVED':
      return 'green' as const;
    case 'REJECTED':
      return 'red' as const;
    case 'PENDING':
      return 'yellow' as const;
    default:
      return 'gray' as const;
  }
}

export default function StockCountSessionsReportPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetStockCountSessionsReportQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [varianceOnly, setVarianceOnly] = useState(false);

  const rows = data?.rows ?? [];
  const warehouseRows = data?.warehouseRows ?? [];
  const materialRows = data?.materialRows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (varianceOnly && row.varianceLineCount === 0) return false;
      if (!query) return true;

      return [
        row.title,
        row.warehouseName,
        row.statusLabel,
        row.evidenceReference ?? '',
        row.linkedAdjustmentReferenceNumber ?? '',
        row.createdByName ?? '',
        row.reviewedByName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [rows, search, status, varianceOnly]);

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock count sessions</h1>
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
                Stock count session report
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review recount sessions, linked adjustment decisions, approval timing, and repeated variance patterns by material.
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Sessions</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.totalSessions ?? 0}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Drafts</p>
              <p className="mt-2 text-xl font-semibold text-blue-900 dark:text-blue-100">{summary?.draftCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-900/40 dark:bg-yellow-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-yellow-700 dark:text-yellow-300">Pending</p>
              <p className="mt-2 text-xl font-semibold text-yellow-900 dark:text-yellow-100">{summary?.pendingAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Approved</p>
              <p className="mt-2 text-xl font-semibold text-emerald-900 dark:text-emerald-100">{summary?.approvedAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-red-700 dark:text-red-300">Rejected</p>
              <p className="mt-2 text-xl font-semibold text-red-900 dark:text-red-100">{summary?.rejectedAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Variance lines</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.totalVarianceLines ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Shortage qty</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatQty(summary?.grossShortageQty ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Avg approval hrs</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                {summary?.avgApprovalHours == null ? '-' : summary.avgApprovalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_auto_auto]">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title, warehouse, evidence, requester..."
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
                <option value="DRAFT">Draft</option>
                <option value="ADJUSTMENT_PENDING">Adjustment pending</option>
                <option value="ADJUSTMENT_APPROVED">Adjustment approved</option>
                <option value="ADJUSTMENT_REJECTED">Adjustment rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={varianceOnly}
                onChange={(event) => setVarianceOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              Variance only
            </label>
            <div className="flex items-end">
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Estimated value uses the count-session line cost snapshot.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the stock count session report. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="min-w-[160px] px-3 py-3">Created</th>
                    <th className="min-w-[220px] px-3 py-3">Session</th>
                    <th className="min-w-[120px] px-3 py-3">Status</th>
                    <th className="min-w-[180px] px-3 py-3">Evidence / Adjustment</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Lines</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Excess qty</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Shortage qty</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Net qty</th>
                    <th className="min-w-[140px] px-3 py-3 text-right">Est. value</th>
                    <th className="min-w-[200px] px-3 py-3">Requester / Review</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        No count sessions match your filters.
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
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            Updated {formatDateTime(row.updatedAt)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-white">{row.title}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {row.warehouseName} | revision {row.currentRevision}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-1">
                            <Badge label={row.statusLabel} variant={sessionVariant(row.status)} />
                            {row.linkedAdjustmentStatus ? (
                              <Badge label={`Adjustment ${row.linkedAdjustmentStatus}`} variant={approvalVariant(row.linkedAdjustmentStatus)} />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{row.evidenceReference || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {row.linkedAdjustmentReferenceNumber || 'No linked adjustment'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">
                          <div>{row.lineCount}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {row.varianceLineCount} variance
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatQty(row.grossExcessQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">
                          {formatQty(row.grossShortageQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">
                          {formatQty(row.netVarianceQty)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(row.estimatedNetValue)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{row.createdByName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {row.reviewedByName
                              ? `${row.reviewedByName} on ${formatDateTime(row.reviewedAt)}`
                              : 'Awaiting review'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            Approval hrs: {row.approvalHours == null ? '-' : row.approvalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Warehouse variance trend</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Which warehouses are driving recount volume, shortages, and approval lag.
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <th className="min-w-[220px] px-3 py-3">Warehouse</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Sessions</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Variance</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Pending</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Approved</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Excess qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Shortage qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[140px] px-3 py-3 text-right">Est. value</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Avg hrs</th>
                  <th className="min-w-[160px] px-3 py-3">Latest session</th>
                </tr>
              </thead>
              <tbody>
                {warehouseRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      No warehouse variance trends yet.
                    </td>
                  </tr>
                ) : (
                  warehouseRows.map((row) => (
                    <tr
                      key={row.warehouseId}
                      className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                    >
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-white">{row.warehouseName}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                          {row.draftCount} draft, {row.rejectedCount} rejected
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{row.totalSessions}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{row.varianceSessionCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-yellow-700 dark:text-yellow-300">{row.pendingCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{row.approvedCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatQty(row.grossExcessQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">{formatQty(row.grossShortageQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.netVarianceQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.estimatedNetValue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {row.avgApprovalHours == null ? '-' : row.avgApprovalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatDateTime(row.latestSessionAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recurring variance materials</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Materials that appear most often in count-session variances.
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <th className="min-w-[220px] px-3 py-3">Material</th>
                  <th className="min-w-[90px] px-3 py-3 text-right">Sessions</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Excess qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Shortage qty</th>
                  <th className="min-w-[120px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[140px] px-3 py-3 text-right">Est. value</th>
                  <th className="min-w-[160px] px-3 py-3">Latest session</th>
                </tr>
              </thead>
              <tbody>
                {materialRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      No variance material patterns yet.
                    </td>
                  </tr>
                ) : (
                  materialRows.map((row) => (
                    <tr
                      key={row.materialId}
                      className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                    >
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-white">{row.materialName}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.unit}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{row.sessionCount}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatQty(row.grossExcessQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-700 dark:text-red-300">{formatQty(row.grossShortageQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.netVarianceQty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(row.estimatedNetValue)}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatDateTime(row.latestSessionAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-500">
        Use{' '}
        <Link href="/stock/count-session" className="text-slate-700 underline dark:text-slate-300">
          stock count sessions
        </Link>{' '}
        to continue recount work and{' '}
        <Link href="/reports/stock-adjustments" className="text-slate-700 underline dark:text-slate-300">
          stock adjustments
        </Link>{' '}
        to review the resulting correction requests.
      </p>
    </div>
  );
}
