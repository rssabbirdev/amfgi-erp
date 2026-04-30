'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useAdjustReceiptEntryMutation,
  useCancelReceiptEntryMutation,
  useDeleteReceiptEntryMutation,
  useGetReceiptEntriesQuery,
  useLazyGetReceiptAdjustmentImpactQuery,
} from '@/store/hooks';
import type {
  ReceiptAdjustmentImpactResponse,
  ReceiptEntry,
} from '@/store/api/endpoints/receipts';

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString();
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'object' &&
    (error as { data?: { error?: unknown } }).data?.error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }

  return fallback;
}

function formatReceiptStatus(status: ReceiptEntry['status']) {
  return status === 'cancelled' ? 'Cancelled' : 'Active';
}

function transactionBadgeVariant(type: string) {
  if (type === 'STOCK_OUT') return 'orange';
  if (type === 'RETURN' || type === 'TRANSFER_IN') return 'blue';
  if (type === 'TRANSFER_OUT' || type === 'REVERSAL') return 'yellow';
  return 'green';
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function GoodsReceiptPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('transaction.stock_in');
  const canDelete = isSA || perms.includes('transaction.stock_in');

  const [filterType, setFilterType] = useState<'day' | 'month' | 'all'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewEntry, setViewEntry] = useState<ReceiptEntry | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; entry: ReceiptEntry | null }>({
    open: false,
    entry: null,
  });
  const [cancelModal, setCancelModal] = useState<{
    open: boolean;
    entry: ReceiptEntry | null;
    reason: string;
  }>({
    open: false,
    entry: null,
    reason: '',
  });
  const [adjustmentImpactModal, setAdjustmentImpactModal] = useState<{
    open: boolean;
    entry: ReceiptEntry | null;
    data: ReceiptAdjustmentImpactResponse | null;
    reason: string;
  }>({
    open: false,
    entry: null,
    data: null,
    reason: '',
  });

  const { data: entries = [], isFetching } = useGetReceiptEntriesQuery(
    { filterType, date: selectedDate },
    { skip: !canView, refetchOnMountOrArgChange: 30 }
  );
  const [deleteReceiptEntry, { isLoading: isDeleting }] = useDeleteReceiptEntryMutation();
  const [cancelReceiptEntry, { isLoading: isCancelling }] = useCancelReceiptEntryMutation();
  const [adjustReceiptEntry, { isLoading: isAdjustingReceipt }] = useAdjustReceiptEntryMutation();
  const [loadReceiptAdjustmentImpact, { isFetching: isLoadingAdjustmentImpact }] =
    useLazyGetReceiptAdjustmentImpactQuery();

  const receiptValue = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.totalValue, 0),
    [entries]
  );
  const totalLineItems = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.itemsCount, 0),
    [entries]
  );
  const supplierCoverage = useMemo(
    () => new Set(entries.map((entry) => entry.supplier).filter(Boolean)).size,
    [entries]
  );

  const handleContextMenu = useCallback(
    (entry: ReceiptEntry, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'View details',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          ),
          action: () => setViewEntry(entry),
        },
        {
          label: 'Review adjustment impact',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17v-6m3 6V7m3 10v-3M9 3h6a2 2 0 012 2v14l-5-3-5 3V5a2 2 0 012-2z"
              />
            </svg>
          ),
          action: () => void handleReviewAdjustmentImpact(entry),
        },
      ];

      if (entry.status === 'active') {
        options.push({
          label: 'Edit receipt',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          ),
          action: () => router.push(`/stock/goods-receipt/receive?edit=${entry.receiptNumber}`),
        });
      }

      if (canDelete && entry.status === 'active') {
        options.push({ divider: true });
        options.push({
          label: 'Cancel receipt',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ),
          action: () => setCancelModal({ open: true, entry, reason: '' }),
          danger: true,
        });
        options.push({
          label: 'Delete receipt',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          ),
          action: () => setDeleteModal({ open: true, entry }),
          danger: true,
        });
      }

      openContextMenu(e.clientX, e.clientY, options);
    },
    [canDelete, openContextMenu, router]
  );

  const handleDelete = async () => {
    if (!deleteModal.entry) return;

    try {
      await deleteReceiptEntry(deleteModal.entry.receiptNumber).unwrap();
      toast.success('Receipt deleted successfully');
      setDeleteModal({ open: false, entry: null });
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to delete receipt'));
    }
  };

  const handleCancelReceipt = async () => {
    if (!cancelModal.entry) return;

    try {
      const reason = cancelModal.reason.trim() || undefined;
      await cancelReceiptEntry({
        receiptNumber: cancelModal.entry.receiptNumber,
        reason,
      }).unwrap();
      toast.success('Receipt cancelled successfully');
      setCancelModal({ open: false, entry: null, reason: '' });

      if (viewEntry?.receiptNumber === cancelModal.entry.receiptNumber) {
        setViewEntry({
          ...viewEntry,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancellationReason: reason ?? null,
        });
      }
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to cancel receipt'));
    }
  };

  const handleReviewAdjustmentImpact = async (entry: ReceiptEntry) => {
    setAdjustmentImpactModal({ open: true, entry, data: null, reason: '' });
    try {
      const data = await loadReceiptAdjustmentImpact(entry.receiptNumber).unwrap();
      setAdjustmentImpactModal({ open: true, entry, data, reason: '' });
    } catch (error: unknown) {
      setAdjustmentImpactModal({ open: false, entry: null, data: null, reason: '' });
      toast.error(extractErrorMessage(error, 'Failed to load receipt impact'));
    }
  };

  const handleAdjustReceipt = async () => {
    if (!adjustmentImpactModal.entry) return;

    const reason = adjustmentImpactModal.reason.trim();
    if (reason.length < 3) {
      toast.error('Adjustment reason is required');
      return;
    }

    try {
      const result = await adjustReceiptEntry({
        receiptNumber: adjustmentImpactModal.entry.receiptNumber,
        reason,
      }).unwrap();

      const refreshedImpact = await loadReceiptAdjustmentImpact(
        adjustmentImpactModal.entry.receiptNumber
      ).unwrap();

      setAdjustmentImpactModal((prev) => ({
        ...prev,
        data: refreshedImpact,
        reason: '',
      }));

      if (viewEntry?.receiptNumber === adjustmentImpactModal.entry.receiptNumber) {
        setViewEntry({
          ...viewEntry,
          adjustedAt: result.adjustedAt,
          adjustmentReason: result.reason,
        });
      }

      toast.success('Receipt adjustment posted successfully');
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to adjust receipt'));
    }
  };

  const columns: Column<ReceiptEntry>[] = [
    {
      key: 'receiptNumber',
      header: 'Receipt',
      sortable: true,
      render: (entry) => (
        <div className="min-w-[180px]">
          <div className="flex items-center gap-2">
            <div className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {entry.receiptNumber}
            </div>
            <Badge
              label={formatReceiptStatus(entry.status)}
              variant={entry.status === 'cancelled' ? 'yellow' : 'green'}
            />
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {formatDate(entry.receivedDate)}
          </div>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      sortable: true,
      render: (entry) => (
        <div className="min-w-[180px]">
          <div className="font-medium text-slate-900 dark:text-white">{entry.supplier || '-'}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {entry.itemsCount} line{entry.itemsCount === 1 ? '' : 's'}
          </div>
        </div>
      ),
    },
    {
      key: 'itemsCount',
      header: 'Lines',
      render: (entry) => <Badge label={String(entry.itemsCount)} variant="blue" />,
    },
    {
      key: 'totalValue',
      header: 'Value',
      sortable: true,
      render: (entry) => (
        <span className="font-medium text-slate-900 dark:text-white">{formatMoney(entry.totalValue)}</span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (entry) =>
        entry.notes ? (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {entry.notes.length > 54 ? `${entry.notes.slice(0, 54)}...` : entry.notes}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">No notes</span>
        ),
    },
  ];

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Goods receipts</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            You do not have permission to view goods receipts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Receiving Ledger
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Goods receipt history
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review received stock, inspect supplier bills, and reopen any receipt for adjustment.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/stock/goods-receipt/receive">
                <Button>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Receipt
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Receipts in view',
              value: String(entries.length),
              note: filterType === 'all' ? 'All available records' : `${filterType} filter active`,
            },
            {
              label: 'Receipt value',
              value: formatMoney(receiptValue),
              note: 'Combined value of visible receipts',
            },
            {
              label: 'Received lines',
              value: String(totalLineItems),
              note: 'Total material rows in scope',
            },
            {
              label: 'Supplier coverage',
              value: String(supplierCoverage),
              note: 'Distinct suppliers represented',
            },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-950/80">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <SectionShell
        title="Receipt ledger"
        description="Use the date window to narrow the ledger, then right-click any row for quick actions."
      >
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['day', 'month', 'all'] as const).map((type) => (
              <Button
                key={type}
                variant={filterType === type ? 'primary' : 'ghost'}
                onClick={() => setFilterType(type)}
                className="capitalize"
              >
                {type}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterType !== 'all' ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            ) : null}
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-transparent dark:text-slate-500">
              Search by receipt, supplier, or notes
            </span>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={entries}
          loading={isFetching && entries.length === 0}
          emptyText="No receipts found."
          searchKeys={['receiptNumber', 'supplier', 'notes']}
          onRowContextMenu={handleContextMenu}
          onRowDoubleClick={(entry) => setViewEntry(entry)}
          onRowClick={(entry) => setViewEntry(entry)}
        />
      </SectionShell>

      {viewEntry ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setViewEntry(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,52rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 dark:border-slate-700 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300/75">
                  Receipt detail
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                  {viewEntry.receiptNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {viewEntry.supplier || 'No supplier linked'} · {formatDate(viewEntry.receivedDate)}
                </p>
                {viewEntry.status === 'cancelled' ? (
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    Cancelled{viewEntry.cancelledAt ? ` on ${formatDate(viewEntry.cancelledAt)}` : ''}.
                    {viewEntry.cancellationReason ? ` Reason: ${viewEntry.cancellationReason}` : ''}
                  </p>
                ) : viewEntry.adjustedAt ? (
                  <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                    Remaining stock adjusted{viewEntry.adjustedAt ? ` on ${formatDate(viewEntry.adjustedAt)}` : ''}.
                    {viewEntry.adjustmentReason ? ` Reason: ${viewEntry.adjustmentReason}` : ''}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm md:min-w-[18rem]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Value</p>
                  <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatMoney(viewEntry.totalValue)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Lines</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{viewEntry.itemsCount}</p>
                </div>
              </div>
            </div>

            {viewEntry.notes ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/70">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Notes</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{viewEntry.notes}</p>
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-sm font-medium text-slate-900 dark:text-white">Line items</p>
              <div className="mt-3 space-y-2 max-h-[18rem] overflow-y-auto">
                {viewEntry.materials.map((material, index) => (
                  <div
                    key={`${material.materialId}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/80"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{material.materialName}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                          Batch {material.batchNumber || '-'}
                        </p>
                        {material.warehouseName ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            Warehouse: {material.warehouseName}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-left md:text-right">
                        <p className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          {material.quantityReceived} {material.unit}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                          {formatMoney(material.unitCost)} / unit
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-500">
                        Available after receipt: {material.quantityAvailable.toFixed(3)}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatMoney(material.totalCost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <Button variant="ghost" onClick={() => setViewEntry(null)}>
                Close
              </Button>
              {viewEntry.status === 'active' ? (
                <Button onClick={() => router.push(`/stock/goods-receipt/receive?edit=${viewEntry.receiptNumber}`)}>
                  Edit Receipt
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {adjustmentImpactModal.open && adjustmentImpactModal.entry ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setAdjustmentImpactModal({ open: false, entry: null, data: null, reason: '' })}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,64rem)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  Receipt impact
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                  {adjustmentImpactModal.entry.receiptNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Review downstream links before adjusting any consumed receipt.
                </p>
              </div>
              {adjustmentImpactModal.data ? (
                <Badge
                  label={adjustmentImpactModal.data.needsAdjustmentReview ? 'Adjustment Review Required' : 'No Downstream Consumption'}
                  variant={adjustmentImpactModal.data.needsAdjustmentReview ? 'yellow' : 'green'}
                />
              ) : null}
            </div>

            {isLoadingAdjustmentImpact && !adjustmentImpactModal.data ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading receipt impact...
              </div>
            ) : adjustmentImpactModal.data ? (
              <div className="space-y-5">
                <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-6">
                  {[
                    { label: 'Received', value: adjustmentImpactModal.data.summary.totalReceived.toFixed(3) },
                    { label: 'Available', value: adjustmentImpactModal.data.summary.totalAvailable.toFixed(3) },
                    { label: 'Consumed', value: adjustmentImpactModal.data.summary.totalConsumed.toFixed(3) },
                    { label: 'Adjusted', value: adjustmentImpactModal.data.summary.totalAdjusted.toFixed(3) },
                    { label: 'Linked jobs', value: String(adjustmentImpactModal.data.summary.linkedJobsCount) },
                    { label: 'Linked customers', value: String(adjustmentImpactModal.data.summary.linkedCustomersCount) },
                  ].map((item) => (
                    <div key={item.label} className="bg-white px-4 py-3 dark:bg-slate-950/80">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                  {adjustmentImpactModal.data.canCancel
                    ? 'This receipt is still untouched at the batch level and can be cancelled directly.'
                    : 'This receipt already has downstream batch consumption. Review the linked jobs, customers, and stock moves before posting any correction.'}
                </div>

                {adjustmentImpactModal.data.adjustedAt ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                    Remaining stock was adjusted on {formatDate(adjustmentImpactModal.data.adjustedAt)}.
                    {adjustmentImpactModal.data.adjustmentReason
                      ? ` Reason: ${adjustmentImpactModal.data.adjustmentReason}`
                      : ''}
                  </div>
                ) : null}

                {adjustmentImpactModal.data.canAdjustRemaining ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Post approved adjustment for remaining stock
                    </p>
                    <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                      This reverses only the current on-hand balance from the receipt batches. Historical downstream consumption remains unchanged.
                    </p>
                    <div className="mt-3">
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Approval reason
                      </label>
                      <textarea
                        value={adjustmentImpactModal.reason}
                        onChange={(e) =>
                          setAdjustmentImpactModal((prev) => ({ ...prev, reason: e.target.value }))
                        }
                        rows={3}
                        placeholder="Required reason for the approved adjustment"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
                      />
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="danger"
                        onClick={handleAdjustReceipt}
                        disabled={isAdjustingReceipt}
                      >
                        {isAdjustingReceipt ? 'Posting Adjustment...' : 'Post Approved Adjustment'}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {adjustmentImpactModal.data.rows.map((row) => (
                    <div
                      key={row.batchId}
                      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{row.materialName}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            Batch {row.batchNumber} {row.warehouseName ? `· ${row.warehouseName}` : ''}
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-right text-xs md:min-w-[22rem]">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Received</p>
                            <p className="mt-1 font-mono text-slate-900 dark:text-white">{row.quantityReceived.toFixed(3)} {row.unit}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Available</p>
                            <p className="mt-1 font-mono text-slate-900 dark:text-white">{row.quantityAvailable.toFixed(3)} {row.unit}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Consumed</p>
                            <p className="mt-1 font-mono text-slate-900 dark:text-white">{row.quantityConsumed.toFixed(3)} {row.unit}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Adjusted</p>
                            <p className="mt-1 font-mono text-slate-900 dark:text-white">{row.quantityAdjusted.toFixed(3)} {row.unit}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                          Linked transactions
                        </p>
                        {row.linkedTransactions.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            No downstream transactions are linked to this batch.
                          </p>
                        ) : (
                          <div className="mt-3 overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.16em] text-slate-500 dark:border-slate-800 dark:text-slate-500">
                                  <th className="px-2 py-2">Type</th>
                                  <th className="px-2 py-2">Date</th>
                                  <th className="px-2 py-2">Batch qty</th>
                                  <th className="px-2 py-2">Job</th>
                                  <th className="px-2 py-2">Customer</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.linkedTransactions.map((transaction) => (
                                  <tr
                                    key={transaction.transactionId}
                                    className="border-b border-slate-100 text-slate-700 dark:border-slate-900 dark:text-slate-300"
                                  >
                                    <td className="px-2 py-2">
                                      <Badge
                                        label={transaction.type}
                                        variant={transactionBadgeVariant(transaction.type)}
                                      />
                                    </td>
                                    <td className="px-2 py-2">{formatDate(transaction.date)}</td>
                                    <td className="px-2 py-2 font-mono">{transaction.quantityFromBatch.toFixed(3)}</td>
                                    <td className="px-2 py-2">{transaction.jobNumber || '-'}</td>
                                    <td className="px-2 py-2">{transaction.customerName || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700">
              <Button
                variant="ghost"
                onClick={() => setAdjustmentImpactModal({ open: false, entry: null, data: null, reason: '' })}
              >
                Close
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {cancelModal.open && cancelModal.entry ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setCancelModal({ open: false, entry: null, reason: '' })}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300/75">
              Cancel receipt
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {cancelModal.entry.receiptNumber}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Cancellation keeps the receipt in history, reverses its untouched stock, and writes a reversal trail.
            </p>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-200">
              This is allowed only while the receipt quantity is still untouched. Once any quantity has been consumed, use an adjustment workflow instead.
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cancellation reason
              </label>
              <textarea
                value={cancelModal.reason}
                onChange={(e) => setCancelModal((prev) => ({ ...prev, reason: e.target.value }))}
                rows={3}
                placeholder="Optional reason for the reversal"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setCancelModal({ open: false, entry: null, reason: '' })}
                disabled={isCancelling}
              >
                Close
              </Button>
              <Button variant="danger" onClick={handleCancelReceipt} disabled={isCancelling}>
                {isCancelling ? 'Cancelling...' : 'Cancel Receipt'}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {deleteModal.open && deleteModal.entry ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteModal({ open: false, entry: null })}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600 dark:text-red-300/75">
              Delete receipt
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {deleteModal.entry.receiptNumber}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Deleting this receipt reverses stock for {deleteModal.entry.itemsCount} item
              {deleteModal.entry.itemsCount === 1 ? '' : 's'} only if the receipt is still untouched.
            </p>

            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-200">
              Once any quantity from this receipt has been consumed, delete is blocked and you must use an adjustment workflow instead.
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setDeleteModal({ open: false, entry: null })}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
