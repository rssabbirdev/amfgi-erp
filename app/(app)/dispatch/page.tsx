'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import { formatDateTime, formatDate } from '@/lib/utils/formatters';
import type { Column } from '@/components/ui/DataTable';

interface Material {
  materialId: string;
  materialName: string;
  materialUnit: string;
  quantity: number;
  transactionIds: string[];
}

interface Entry {
  _id?: string;
  entryId: string;
  jobId: string;
  jobNumber: string;
  jobDescription: string;
  dispatchDate: string;
  totalQuantity: number;
  materialsCount: number;
  materials: Material[];
  transactionIds: string[];
  transactionCount: number;
}

export default function DispatchPage() {
  const { data: session } = useSession();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('transaction.stock_out');
  const canEdit = isSA || perms.includes('transaction.stock_out');
  const canDelete = isSA || perms.includes('transaction.stock_out');

  const [filterType, setFilterType] = useState<'day' | 'month' | 'all'>('month');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const [viewModal, setViewModal] = useState<{ open: boolean; entry: Entry | null }>({
    open: false,
    entry: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; entry: Entry | null; loading: boolean }>({
    open: false,
    entry: null,
    loading: false,
  });

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filterType,
        date: selectedDate,
      });
      const res = await fetch(`/api/materials/dispatch-history-entries?${params}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setEntries(json.data.entries);
      } else {
        toast.error(json.error ?? 'Failed to fetch entries');
      }
    } catch (err) {
      toast.error('Error loading entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      fetchEntries();
    }
  }, [filterType, selectedDate, canView]);

  const handleDelete = async (entry: Entry) => {
    setDeleteModal({ open: true, entry, loading: false });
  };

  const confirmDelete = async () => {
    if (!deleteModal.entry) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      // Delete all transactions in this entry
      for (const txnId of deleteModal.entry.transactionIds) {
        await fetch(`/api/transactions/${txnId}`, {
          method: 'DELETE',
        });
      }
      toast.success('Entry deleted successfully');
      setDeleteModal({ open: false, entry: null, loading: false });
      fetchEntries();
    } catch (err) {
      toast.error('Failed to delete entry');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  if (!canView) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">You don't have permission to view dispatch history.</p>
      </div>
    );
  }

  const columns = [
    {
      key: 'jobNumber',
      header: 'Job',
      sortable: true,
      render: (e: Entry) => (
        <div>
          <p className="font-medium text-cyan-400">{e.jobNumber}</p>
          <p className="text-xs text-slate-400 max-w-40 truncate">{e.jobDescription}</p>
        </div>
      ),
    },
    {
      key: 'dispatchDate',
      header: 'Dispatch Date',
      sortable: true,
      render: (e: Entry) => formatDateTime(e.dispatchDate),
    },
    {
      key: 'materialsCount',
      header: 'Materials',
      sortable: true,
      render: (e: Entry) => <Badge label={`${e.materialsCount}`} variant="blue" />,
    },
    {
      key: 'totalQuantity',
      header: 'Total Qty',
      sortable: true,
      render: (e: Entry) => <span className="font-semibold text-emerald-400">{e.totalQuantity.toFixed(3)}</span>,
    },
    {
      key: 'transactionCount',
      header: 'Transactions',
      render: (e: Entry) => <span className="text-sm text-slate-400">{e.transactionCount}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (e: Entry) => (
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewModal({ open: true, entry: e })}
          >
            View
          </Button>
          {canEdit && (
            <Link href={`/dispatch/entry?jobId=${e.jobId}&date=${e.dispatchDate.split('T')[0]}`}>
              <Button
                size="sm"
                variant="secondary"
              >
                Edit
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => handleDelete(e)}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  const totalEntries = entries.length;
  const totalQuantityDispatched = entries.reduce((sum, e) => sum + e.totalQuantity, 0);
  const totalMaterials = new Set(entries.flatMap(e => e.materials.map(m => m.materialId))).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispatch Management</h1>
          <p className="text-slate-400 text-sm mt-1">View and manage material dispatch entries</p>
        </div>
        <Link href="/dispatch/entry">
          <Button>+ New Dispatch</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-300">Filter:</label>
          <div className="flex gap-2">
            {[
              { value: 'all' as const, label: 'All Entries' },
              { value: 'month' as const, label: 'Month' },
              { value: 'day' as const, label: 'Day' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setFilterType(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterType === option.value
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filterType !== 'all' && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-300">
              {filterType === 'day' ? 'Select Date:' : 'Select Month:'}
            </label>
            <input
              type={filterType === 'day' ? 'date' : 'month'}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Total Entries</p>
          <p className="text-2xl font-bold text-white">{totalEntries}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Total Qty Dispatched</p>
          <p className="text-2xl font-bold text-emerald-400">{totalQuantityDispatched.toFixed(3)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-1">Unique Materials</p>
          <p className="text-2xl font-bold text-cyan-400">{totalMaterials}</p>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns as any}
        data={entries as any}
        loading={loading}
        emptyText="No dispatch entries found for this period."
        searchKeys={['jobNumber', 'jobDescription'] as any}
      />

      {/* View Modal */}
      {viewModal.open && viewModal.entry && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setViewModal({ open: false, entry: null })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-2xl max-h-96 overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Dispatch Entry Details</h2>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Job</p>
                  <p className="text-sm font-medium text-cyan-400">{viewModal.entry.jobNumber}</p>
                  <p className="text-xs text-slate-400 mt-1">{viewModal.entry.jobDescription}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Dispatch Date & Time</p>
                  <p className="text-sm font-medium text-white">{formatDateTime(viewModal.entry.dispatchDate)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-2">Materials Dispatched</p>
                <div className="space-y-2">
                  {viewModal.entry.materials.map((material, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900 rounded-lg p-3 flex items-center justify-between border border-slate-700"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-white">{material.materialName}</p>
                        <p className="text-xs text-slate-400">{material.materialUnit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-400">{material.quantity.toFixed(3)}</p>
                        <p className="text-xs text-slate-400">{material.transactionIds.length} txn(s)</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Total Materials</p>
                    <p className="text-lg font-bold text-white">{viewModal.entry.materialsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Total Quantity</p>
                    <p className="text-lg font-bold text-emerald-400">{viewModal.entry.totalQuantity.toFixed(3)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setViewModal({ open: false, entry: null })}
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
            onClick={() => setDeleteModal({ open: false, entry: null, loading: false })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Dispatch Entry?</h2>
            <p className="text-slate-300 text-sm mb-4">
              Delete dispatch entry for job <strong>{deleteModal.entry.jobNumber}</strong> on{' '}
              <strong>{formatDate(deleteModal.entry.dispatchDate)}</strong>?
            </p>

            <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-red-300 font-medium mb-2">This action will:</p>
              <ul className="text-xs text-red-300 space-y-1 list-disc list-inside">
                <li>Delete all {deleteModal.entry.materialsCount} material dispatch records</li>
                <li>Remove {deleteModal.entry.transactionCount} transaction(s)</li>
                <li>Cannot be undone</li>
              </ul>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, entry: null, loading: false })}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteModal.loading ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
