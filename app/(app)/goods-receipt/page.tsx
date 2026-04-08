'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetReceiptEntriesQuery,
  useDeleteReceiptEntryMutation,
} from '@/store/hooks';
import type { ReceiptEntry } from '@/store/api/endpoints/receipts';

export default function GoodsReceiptPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  // Permission checks
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('transaction.stock_in');
  const canDelete = isSA || perms.includes('transaction.stock_in');

  // Filter state
  const [filterType, setFilterType] = useState<'day' | 'month' | 'all'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Data hooks
  const { data: entries = [], isFetching } = useGetReceiptEntriesQuery(
    { filterType, date: selectedDate },
    { skip: !canView }
  );
  const [deleteReceiptEntry, { isLoading: isDeleting }] = useDeleteReceiptEntryMutation();

  // Modal states
  const [viewEntry, setViewEntry] = useState<ReceiptEntry | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    entry: ReceiptEntry | null;
  }>({ open: false, entry: null });

  const handleContextMenu = useCallback(
    (entry: ReceiptEntry, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'View Details',
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
      ];

      if (canDelete) {
        options.push({
          label: 'Edit',
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          ),
          action: () => router.push(`/goods-receipt/receive?edit=${entry.receiptNumber}`),
        });

        options.push({ divider: true });

        options.push({
          label: 'Delete',
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
    [canDelete, openContextMenu]
  );


  const handleDelete = async () => {
    if (!deleteModal.entry) return;
    try {
      await deleteReceiptEntry(deleteModal.entry.receiptNumber).unwrap();
      toast.success('Receipt deleted successfully');
      setDeleteModal({ open: false, entry: null });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete receipt');
    }
  };

  const columns: Column<ReceiptEntry>[] = [
    {
      key: 'receiptNumber',
      header: 'GRN #',
      sortable: true,
      render: (entry) => <span className="font-mono text-emerald-400">{entry.receiptNumber}</span>,
    },
    {
      key: 'receivedDate',
      header: 'Date',
      sortable: true,
      render: (entry) => new Date(entry.receivedDate).toLocaleDateString(),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      sortable: true,
      render: (entry) => entry.supplier || '—',
    },
    {
      key: 'itemsCount',
      header: 'Items',
      render: (entry) => <Badge label={String(entry.itemsCount)} variant="blue" />,
    },
    {
      key: 'totalValue',
      header: 'Total Value',
      sortable: true,
      render: (entry) => `AED ${entry.totalValue.toFixed(2)}`,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (entry) =>
        entry.notes ? (
          <span className="text-slate-400 text-sm">{entry.notes.substring(0, 50)}...</span>
        ) : (
          '—'
        ),
    },
  ];

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Goods Receipt History</h1>
        <div className="text-center py-12">
          <p className="text-slate-400">You do not have permission to view goods receipts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Goods Receipt History</h1>
          <p className="text-slate-400 text-sm mt-1">{entries.length} receipts</p>
        </div>
        <Link href="/goods-receipt/receive">
          <Button>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Receipt
          </Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 items-center">
        <div className="flex gap-2">
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
        {filterType !== 'all' && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          />
        )}
      </div>

      {/* DataTable with skeleton */}
      {isFetching && entries.length === 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full">
            <tbody>
              <TableSkeleton rows={5} columns={columns.length} />
            </tbody>
          </table>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={entries}
          loading={isFetching && entries.length === 0}
          emptyText="No receipts found."
          searchKeys={['receiptNumber', 'supplier', 'notes']}
          onRowContextMenu={handleContextMenu}
        />
      )}

      {/* View Details Modal */}
      {viewEntry && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setViewEntry(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-96 overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-4">
              Receipt {viewEntry.receiptNumber}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6 pb-4 border-b border-slate-700">
              <div>
                <p className="text-xs text-slate-400 uppercase">Date</p>
                <p className="text-white">
                  {new Date(viewEntry.receivedDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Supplier</p>
                <p className="text-white">{viewEntry.supplier || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Total Value</p>
                <p className="text-emerald-400 font-semibold">
                  AED {viewEntry.totalValue.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase">Items</p>
                <p className="text-white">{viewEntry.itemsCount}</p>
              </div>
            </div>

            {viewEntry.notes && (
              <div className="mb-6 pb-4 border-b border-slate-700">
                <p className="text-xs text-slate-400 uppercase mb-1">Notes</p>
                <p className="text-slate-300 text-sm">{viewEntry.notes}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-slate-400 uppercase mb-3">Line Items</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {viewEntry.materials.map((mat, idx) => (
                  <div key={idx} className="bg-slate-700/50 rounded px-3 py-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium">{mat.materialName}</p>
                        <p className="text-xs text-slate-400">{mat.batchNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-mono">
                          {mat.quantityReceived} {mat.unit}
                        </p>
                        <p className="text-xs text-slate-400">
                          @ AED {mat.unitCost.toFixed(2)}/unit
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-slate-600">
                      <span className="text-xs text-slate-400">
                        Available: {mat.quantityAvailable.toFixed(3)}
                      </span>
                      <span className="text-slate-300 text-sm">
                        AED {mat.totalCost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-slate-700">
              <button
                onClick={() => setViewEntry(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.entry && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteModal({ open: false, entry: null })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Receipt</h2>
            <p className="text-slate-300 text-sm mb-4">
              You are about to delete receipt <strong>{deleteModal.entry.receiptNumber}</strong>.
            </p>

            <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-300">
                ⚠️ Stock of {deleteModal.entry.itemsCount} item{deleteModal.entry.itemsCount !== 1 ? 's' : ''} will be reversed.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, entry: null })}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
