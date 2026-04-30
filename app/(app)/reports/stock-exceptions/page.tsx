'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import {
  useGetStockExceptionApprovalsQuery,
  useGetStockExceptionsQuery,
  useGetStockIntegrityQuery,
  useUpdateStockExceptionApprovalMutation,
} from '@/store/hooks';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatApprovalType(value: 'DISPATCH_OVERRIDE' | 'RECEIPT_ADJUSTMENT' | 'RECEIPT_CANCELLATION' | 'MANUAL_STOCK_ADJUSTMENT') {
  switch (value) {
    case 'DISPATCH_OVERRIDE':
      return 'Dispatch override';
    case 'RECEIPT_ADJUSTMENT':
      return 'Receipt adjustment';
    case 'RECEIPT_CANCELLATION':
      return 'Receipt cancellation';
    case 'MANUAL_STOCK_ADJUSTMENT':
      return 'Manual stock adjustment';
    default:
      return value;
  }
}

function formatEvidenceType(value: string | null | undefined) {
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

function approvalBadgeVariant(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  switch (status) {
    case 'APPROVED':
      return 'green' as const;
    case 'REJECTED':
      return 'red' as const;
    default:
      return 'yellow' as const;
  }
}

export default function StockExceptionsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetStockExceptionsQuery(undefined, {
    skip: !canView,
  });
  const {
    data: approvalsData,
    isFetching: approvalsFetching,
    isError: approvalsError,
    refetch: refetchApprovals,
  } = useGetStockExceptionApprovalsQuery(undefined, {
    skip: !canView,
  });
  const { data: integrityData } = useGetStockIntegrityQuery(undefined, {
    skip: !canView,
  });
  const [updateApproval, { isLoading: approvalSaving }] = useUpdateStockExceptionApprovalMutation();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [approvalType, setApprovalType] = useState('all');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState('all');
  const [approvalWarehouseFilter, setApprovalWarehouseFilter] = useState('all');
  const [approvalRequesterFilter, setApprovalRequesterFilter] = useState('all');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const integritySummary = integrityData?.summary;
  const approvalRows = approvalsData?.rows ?? [];
  const approvalSummary = approvalsData?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== 'all' && row.category !== category) return false;
      if (!query) return true;
      return [
        row.referenceNumber,
        row.reason ?? '',
        row.details,
        row.materialNames.join(' '),
        row.jobNumbers.join(' '),
        row.customerNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [category, rows, search]);

  const approvalWarehouseOptions = useMemo(
    () => Array.from(new Set(approvalRows.flatMap((row) => row.warehouseNames))).sort((a, b) => a.localeCompare(b)),
    [approvalRows]
  );

  const approvalRequesterOptions = useMemo(
    () =>
      Array.from(
        new Set(approvalRows.map((row) => row.createdByName).filter((value): value is string => Boolean(value)))
      ).sort((a, b) => a.localeCompare(b)),
    [approvalRows]
  );

  const filteredApprovalRows = useMemo(() => {
    const query = approvalSearch.trim().toLowerCase();
    return approvalRows.filter((row) => {
      if (approvalType !== 'all' && row.exceptionType !== approvalType) return false;
      if (approvalStatusFilter !== 'all' && row.status !== approvalStatusFilter) return false;
      if (approvalWarehouseFilter !== 'all' && !row.warehouseNames.includes(approvalWarehouseFilter)) return false;
      if (approvalRequesterFilter !== 'all' && row.createdByName !== approvalRequesterFilter) return false;
      if (!query) return true;

      return [
        row.referenceNumber ?? row.referenceId,
        row.reason,
        row.createdByName ?? '',
        row.decidedByName ?? '',
        row.evidenceReference ?? '',
        row.sourceSessionTitle ?? '',
        row.warehouseNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [
    approvalRows,
    approvalSearch,
    approvalStatusFilter,
    approvalType,
    approvalWarehouseFilter,
    approvalRequesterFilter,
  ]);

  async function handleApprovalAction(
    row: { id: string; requiresDecisionNote: boolean },
    status: 'APPROVED' | 'REJECTED'
  ) {
    const decisionNote = decisionNotes[row.id]?.trim();
    if (status === 'APPROVED' && row.requiresDecisionNote && !decisionNote) {
      toast.error('This approval requires a decision note.');
      return;
    }
    await updateApproval({
      id: row.id,
      status,
      ...(decisionNote ? { decisionNote } : {}),
    }).unwrap();
    await refetchApprovals();
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock exceptions</h1>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300/80">
                Stock control
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Stock exception dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                One place for dispatch overrides, receipt cancellations, approved receipt adjustments, and the
                current stock-integrity drift signal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void refetch();
                void refetchApprovals();
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Events</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.totalEvents ?? 0}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Dispatch overrides</p>
              <p className="mt-2 text-xl font-semibold text-amber-900 dark:text-amber-100">{summary?.dispatchOverrideCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Receipt adjustments</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.receiptAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Receipt cancellations</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.receiptCancellationCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Manual adjustments</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.manualStockAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Integrity exceptions</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{integritySummary?.materialsWithExceptions ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Linked jobs</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.linkedJobsCount ?? 0}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-900/40 dark:bg-yellow-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-yellow-700 dark:text-yellow-300">Pending approvals</p>
              <p className="mt-2 text-xl font-semibold text-yellow-900 dark:text-yellow-100">{approvalSummary?.pending ?? 0}</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/40 dark:bg-orange-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-orange-700 dark:text-orange-300">Pending over 24h</p>
              <p className="mt-2 text-xl font-semibold text-orange-900 dark:text-orange-100">{approvalSummary?.pendingOver24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Approved</p>
              <p className="mt-2 text-xl font-semibold text-emerald-900 dark:text-emerald-100">{approvalSummary?.approved ?? 0}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-red-700 dark:text-red-300">Rejected</p>
              <p className="mt-2 text-xl font-semibold text-red-900 dark:text-red-100">{approvalSummary?.rejected ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Approval records</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{approvalSummary?.total ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference, reason, material, job, customer..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All exceptions</option>
                <option value="dispatch_override">Dispatch overrides</option>
                <option value="receipt_adjustment">Receipt adjustments</option>
                <option value="receipt_cancellation">Receipt cancellations</option>
                <option value="manual_stock_adjustment">Manual stock adjustments</option>
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Dispatch overrides include the saved override trail for budget or negative-stock exception saves.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_220px_180px_180px_180px]">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Queue search</label>
              <input
                type="search"
                value={approvalSearch}
                onChange={(event) => setApprovalSearch(event.target.value)}
                placeholder="Reference, requester, evidence, warehouse..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
              <select
                value={approvalType}
                onChange={(event) => setApprovalType(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All types</option>
                <option value="DISPATCH_OVERRIDE">Dispatch override</option>
                <option value="RECEIPT_ADJUSTMENT">Receipt adjustment</option>
                <option value="RECEIPT_CANCELLATION">Receipt cancellation</option>
                <option value="MANUAL_STOCK_ADJUSTMENT">Manual adjustment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
              <select
                value={approvalStatusFilter}
                onChange={(event) => setApprovalStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Warehouse</label>
              <select
                value={approvalWarehouseFilter}
                onChange={(event) => setApprovalWarehouseFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All warehouses</option>
                {approvalWarehouseOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Requester</label>
              <select
                value={approvalRequesterFilter}
                onChange={(event) => setApprovalRequesterFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All requesters</option>
                {approvalRequesterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <th className="min-w-[150px] px-3 py-3">Created</th>
                  <th className="min-w-[160px] px-3 py-3">Type</th>
                  <th className="min-w-[140px] px-3 py-3">Reference</th>
                  <th className="min-w-[120px] px-3 py-3">Status</th>
                  <th className="min-w-[180px] px-3 py-3">Warehouse / Source</th>
                  <th className="min-w-[160px] px-3 py-3">Requested by</th>
                  <th className="min-w-[220px] px-3 py-3">Reason</th>
                  <th className="min-w-[220px] px-3 py-3">Decision</th>
                  <th className="min-w-[260px] px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvalsFetching && filteredApprovalRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Loading approval queue...
                    </td>
                  </tr>
                ) : approvalsError ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-red-600 dark:text-red-400">
                      Could not load approval queue.
                    </td>
                  </tr>
                ) : filteredApprovalRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      No approval records match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredApprovalRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                    >
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatApprovalType(row.exceptionType)}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-900 dark:text-white">{row.referenceNumber || row.referenceId}</td>
                      <td className="px-3 py-2.5">
                        <Badge label={row.status} variant={approvalBadgeVariant(row.status)} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        <div>{row.warehouseNames.join(', ') || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                          {row.sourceSessionTitle || row.evidenceReference || 'No linked source'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.createdByName || '-'}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {row.reason}
                        {row.exceptionType === 'MANUAL_STOCK_ADJUSTMENT' ? (
                          <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-500">
                            <div>
                              {row.lineCount > 0 && row.netQuantity != null
                                ? `${row.lineCount} lines, net ${row.netQuantity.toFixed(3)}`
                                : 'Bulk request'}
                            </div>
                            <div>
                              {formatEvidenceType(row.evidenceType)}
                              {row.evidenceReference ? `: ${row.evidenceReference}` : ''}
                            </div>
                            {row.requiresDecisionNote ? (
                              <div>Decision note required on approval</div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                        {row.decidedAt ? `${row.decidedByName || 'Unknown'} on ${formatDateTime(row.decidedAt)}` : '-'}
                        {row.decisionNote ? <div className="mt-1 text-xs">{row.decisionNote}</div> : null}
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                          {row.status === 'PENDING' ? 'Age' : 'Turnaround'}: {row.ageHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}h
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {isSA && row.status === 'PENDING' ? (
                          <div className="space-y-2">
                            <textarea
                              value={decisionNotes[row.id] ?? ''}
                              onChange={(event) =>
                                setDecisionNotes((current) => ({ ...current, [row.id]: event.target.value }))
                              }
                              placeholder="Decision note"
                              className="min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleApprovalAction(row, 'APPROVED')}
                                disabled={approvalSaving}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleApprovalAction(row, 'REJECTED')}
                                disabled={approvalSaving}
                                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-500">No action</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500 sm:px-5">
          Pending dispatch overrides can now be approved or rejected here. Receipt adjustments and cancellations are recorded as approved under the current policy trail.
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Event trail</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Raw exception events remain visible for investigation and reconciliation.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the exception dashboard. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="min-w-[150px] px-3 py-3">When</th>
                    <th className="min-w-[150px] px-3 py-3">Category</th>
                    <th className="min-w-[150px] px-3 py-3">Reference</th>
                    <th className="min-w-[180px] px-3 py-3">Materials</th>
                    <th className="min-w-[150px] px-3 py-3">Jobs</th>
                    <th className="min-w-[150px] px-3 py-3">Customers</th>
                    <th className="min-w-[260px] px-3 py-3">Reason</th>
                    <th className="min-w-[280px] px-3 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        No exception events match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                      >
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{formatDateTime(row.occurredAt)}</td>
                        <td className="px-3 py-2.5">
                          <Badge
                            label={row.categoryLabel}
                            variant={row.severity === 'critical' ? 'red' : 'yellow'}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-900 dark:text-white">{row.referenceNumber}</td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.materialNames.join(', ') || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.jobNumbers.join(', ') || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.customerNames.join(', ') || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.reason || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.details}</td>
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
        <Link href="/stock/integrity" className="text-amber-700 underline dark:text-amber-300">
          Stock integrity
        </Link>{' '}
        for quantity drift details,{' '}
        <Link href="/reports/stock-adjustments" className="text-amber-700 underline dark:text-amber-300">
          stock adjustments
        </Link>{' '}
        for bulk manual correction value audit, and{' '}
        <Link href="/stock/goods-receipt" className="text-amber-700 underline dark:text-amber-300">
          Goods receipt history
        </Link>{' '}
        for receipt-level investigation and corrections.
      </p>
    </div>
  );
}
