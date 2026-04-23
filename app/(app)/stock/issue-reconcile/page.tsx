'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useDeleteTransactionMutation, useGetNonStockReconcileDataQuery } from '@/store/hooks';
import type { NonStockReconcileHistoryItem } from '@/store/api/endpoints/transactions';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function IssueReconcilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { data, isLoading } = useGetNonStockReconcileDataQuery();
  const [deleteTransaction, { isLoading: deleting }] = useDeleteTransactionMutation();
  const [warningEntryId, setWarningEntryId] = useState<string | null>(null);
  const [viewEntry, setViewEntry] = useState<NonStockReconcileHistoryItem | null>(null);
  const [editEntry, setEditEntry] = useState<NonStockReconcileHistoryItem | null>(null);
  const perms = (session?.user?.permissions ?? []) as string[];
  const canReconcile = (session?.user?.isSuperAdmin ?? false) || perms.includes('transaction.reconcile');

  if (!canReconcile) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">You do not have permission to access issue reconcile.</p>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!warningEntryId) return;
    try {
      await deleteTransaction(warningEntryId).unwrap();
      toast.success('Reconcile entry deleted');
      setWarningEntryId(null);
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete reconcile entry';
      toast.error(message);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.1),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300/80">
                Issue Reconcile
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Reconcile history and controls
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review previous non-stock issue reconciliations and open the manual create screen when you need to distribute fresh quantities into variation jobs sourced from monthly dispatch-note activity.
              </p>
            </div>

            <Link href="/stock/issue-reconcile/new">
              <Button>Create reconcile</Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">History rows</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{data?.history.length ?? 0}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Variation jobs</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{data?.jobs.length ?? 0}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Non-stock items</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{data?.materials.length ?? 0}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Previous history</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Recent non-stock reconcile postings across job variations.</p>
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
                <th className="px-4 py-3">Average</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.history ?? []).map((entry) => (
                <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{new Date(entry.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{entry.materialName}</td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900 dark:text-white">{entry.jobNumber}</div>
                    {entry.jobDescription ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{entry.jobDescription}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{entry.customerName || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatNumber(entry.quantity)} {entry.unit}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatMoney(entry.averageCost)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatMoney(entry.totalCost)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setViewEntry(entry)}>
                        View
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditEntry(entry)}>
                        Edit
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setWarningEntryId(entry.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.history.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                    No reconcile history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={Boolean(warningEntryId)}
        onClose={() => setWarningEntryId(null)}
        title="Delete reconcile entry"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This will delete the selected reconcile transaction.
          </p>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            After delete:
            the distributed issue cost is removed from that job,
            the reconciled stock quantity is added back to material stock,
            and any FIFO batch quantities consumed by this reconcile are restored.
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => setWarningEntryId(null)}>
              Cancel
            </Button>
            <Button type="button" fullWidth loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(viewEntry)}
        onClose={() => setViewEntry(null)}
        title="Reconcile entry"
      >
        {viewEntry ? (
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <div><span className="font-medium text-slate-900 dark:text-white">Date:</span> {new Date(viewEntry.date).toLocaleString()}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Material:</span> {viewEntry.materialName}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Job:</span> {viewEntry.jobNumber}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Company:</span> {viewEntry.customerName || '-'}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Quantity:</span> {formatNumber(viewEntry.quantity)} {viewEntry.unit}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Average cost:</span> {formatMoney(viewEntry.averageCost)}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Total cost:</span> {formatMoney(viewEntry.totalCost)}</div>
            <div><span className="font-medium text-slate-900 dark:text-white">Notes:</span> {viewEntry.notes || '-'}</div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(editEntry)}
        onClose={() => setEditEntry(null)}
        title="Edit reconcile entry"
      >
        {editEntry ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You are about to edit this reconcile entry for <span className="font-medium text-slate-900 dark:text-white">{editEntry.materialName}</span> on job <span className="font-medium text-slate-900 dark:text-white">{editEntry.jobNumber}</span>.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              What happens on save:
              the current reconcile transaction will be deleted first,
              its stock and FIFO batch effects will be reversed,
              and then a new reconcile transaction will be created from the values you save in the edit form.
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" fullWidth onClick={() => setEditEntry(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                fullWidth
                onClick={() => {
                  const targetId = editEntry.id;
                  setEditEntry(null);
                  router.push(`/stock/issue-reconcile/new?transactionId=${targetId}`);
                }}
              >
                Continue To Edit
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
