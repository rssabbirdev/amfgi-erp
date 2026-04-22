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
import { useDeleteReceiptEntryMutation, useGetReceiptEntriesQuery } from '@/store/hooks';
import type { ReceiptEntry } from '@/store/api/endpoints/receipts';

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

  const { data: entries = [], isFetching } = useGetReceiptEntriesQuery(
    { filterType, date: selectedDate },
    { skip: !canView }
  );
  const [deleteReceiptEntry, { isLoading: isDeleting }] = useDeleteReceiptEntryMutation();

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
        },
      ];

      if (canDelete) {
        options.push({ divider: true });
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

  const columns: Column<ReceiptEntry>[] = [
    {
      key: 'receiptNumber',
      header: 'Receipt',
      sortable: true,
      render: (entry) => (
        <div className="min-w-[180px]">
          <div className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            {entry.receiptNumber}
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
              <Button onClick={() => router.push(`/stock/goods-receipt/receive?edit=${viewEntry.receiptNumber}`)}>
                Edit Receipt
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
              {deleteModal.entry.itemsCount === 1 ? '' : 's'}.
            </p>

            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-200">
              This action cannot be undone from the history screen.
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
