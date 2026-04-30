'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import {
  useDeleteSupplierMutation,
  useGetSuppliersQuery,
  useSyncSuppliersFromPartyApiMutation,
  type Supplier,
} from '@/store/hooks';

type SupplierSourceFilter = 'all' | 'local' | 'synced';

type DeleteCheck = {
  source: string;
  canDelete: boolean;
  canHardDelete: boolean;
  canDeactivate: boolean;
  deleteBlockedReason?: string;
  linkedBatchesCount: number;
};

function summaryCardStyle() {
  return {
    backgroundColor: 'var(--surface-panel-soft)',
    borderColor: 'var(--border-strong)',
  };
}

function mutedTextStyle() {
  return { color: 'var(--foreground-muted)' };
}

function strongTextStyle() {
  return { color: 'var(--foreground)' };
}

function bodyTextStyle() {
  return { color: 'var(--foreground-soft)' };
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString();
}

function sourceBadge(source?: string) {
  return source === 'PARTY_API_SYNC'
    ? { label: 'Synced', variant: 'blue' as const }
    : { label: 'Local', variant: 'gray' as const };
}

function deleteModalCopy(check: DeleteCheck | null) {
  if (!check) return 'Checking delete rules...';
  if (check.deleteBlockedReason === 'synced_from_party_api') {
    return 'This supplier came from the party API. It cannot be deleted here; edit the record and deactivate it if needed.';
  }
  if (check.canHardDelete) {
    return 'This supplier is not linked to stock batches and will be permanently deleted.';
  }
  if (check.canDeactivate) {
    return `This supplier is linked to ${check.linkedBatchesCount} stock batch(es), so it will be marked inactive instead of being removed.`;
  }
  return 'This supplier cannot be deleted from here.';
}

export default function SuppliersPage() {
  const { data: session } = useSession();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = isSA || perms.includes('transaction.stock_in');

  const { data: suppliers = [], isFetching, error } = useGetSuppliersQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [deleteSupplier, { isLoading: isDeleting }] = useDeleteSupplierMutation();
  const [syncPartySuppliers, { isLoading: isSyncingParty }] = useSyncSuppliersFromPartyApiMutation();

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SupplierSourceFilter>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    supplier: Supplier | null;
    check: DeleteCheck | null;
    loading: boolean;
  }>({ open: false, supplier: null, check: null, loading: false });

  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const cities = useMemo(
    () =>
      Array.from(new Set(suppliers.map((supplier) => supplier.city).filter(Boolean) as string[])).sort(),
    [suppliers],
  );

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      if (!supplier.isActive) return false;
      if (
        deferredQuery &&
        ![
          supplier.name,
          supplier.email,
          supplier.contactPerson,
          supplier.phone,
          supplier.externalPartyId?.toString() ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(deferredQuery)
      ) {
        return false;
      }
      if (sourceFilter === 'local' && supplier.source === 'PARTY_API_SYNC') return false;
      if (sourceFilter === 'synced' && supplier.source !== 'PARTY_API_SYNC') return false;
      if (cityFilter && supplier.city !== cityFilter) return false;
      return true;
    });
  }, [cityFilter, deferredQuery, sourceFilter, suppliers]);

  const summary = useMemo(() => {
    const synced = suppliers.filter((supplier) => supplier.source === 'PARTY_API_SYNC').length;
    const local = suppliers.length - synced;
    return {
      total: suppliers.length,
      synced,
      local,
      withCompliance: suppliers.filter((supplier) => supplier.tradeLicenseNumber || supplier.trnNumber).length,
    };
  }, [suppliers]);

  const handleSyncPartySuppliers = async () => {
    try {
      const result = await syncPartySuppliers().unwrap();
      toast.success(`Synced ${result.created} new and ${result.updated} updated suppliers`);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Sync failed - check PARTY_LISTS_API_* env vars'));
    }
  };

  const openDeleteModal = async (supplier: Supplier) => {
    setDeleteModal({
      open: true,
      supplier,
      check: null,
      loading: true,
    });

    try {
      const response = await fetch(`/api/suppliers/${supplier.id}/check-delete`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to check delete rules');
      }
      setDeleteModal({
        open: true,
        supplier,
        check: json.data as DeleteCheck,
        loading: false,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check delete rules');
      setDeleteModal({
        open: true,
        supplier,
        check: null,
        loading: false,
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.supplier) return;

    try {
      const result = await deleteSupplier(deleteModal.supplier.id).unwrap();
      toast.success(result.message ?? (result.permanent ? 'Supplier deleted' : 'Supplier deactivated'));
      setDeleteModal({ open: false, supplier: null, check: null, loading: false });
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete supplier'));
    }
  };

  return (
    <div className="space-y-6">
      <section
        className="rounded-3xl border p-6 shadow-sm"
        style={summaryCardStyle()}
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Master data</p>
            <h1 className="mt-2 text-3xl font-semibold" style={strongTextStyle()}>
              Supplier directory
            </h1>
            <p className="mt-3 text-sm leading-6" style={mutedTextStyle()}>
              Manage local suppliers, review synced party records, and open dedicated create and edit pages for full compliance field entry.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[34rem] xl:grid-cols-4">
            <div className="rounded-2xl border p-4 shadow-sm" style={summaryCardStyle()}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                Suppliers
              </p>
              <p className="mt-2 text-2xl font-semibold" style={strongTextStyle()}>
                {compactNumber(summary.total)}
              </p>
              <p className="mt-1 text-xs" style={mutedTextStyle()}>
                Records in this company
              </p>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm" style={summaryCardStyle()}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                Synced
              </p>
              <p className="mt-2 text-2xl font-semibold" style={strongTextStyle()}>
                {compactNumber(summary.synced)}
              </p>
              <p className="mt-1 text-xs" style={mutedTextStyle()}>
                From party API
              </p>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm" style={summaryCardStyle()}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                Local
              </p>
              <p className="mt-2 text-2xl font-semibold" style={strongTextStyle()}>
                {compactNumber(summary.local)}
              </p>
              <p className="mt-1 text-xs" style={mutedTextStyle()}>
                Manual AMFGI records
              </p>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm" style={summaryCardStyle()}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                Compliance
              </p>
              <p className="mt-2 text-2xl font-semibold" style={strongTextStyle()}>
                {compactNumber(summary.withCompliance)}
              </p>
              <p className="mt-1 text-xs" style={mutedTextStyle()}>
                License or TRN saved
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-5 shadow-sm" style={summaryCardStyle()}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1.6fr)_12rem_12rem]">
            <label className="space-y-2 text-sm" style={bodyTextStyle()}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em]" style={mutedTextStyle()}>
              Search
            </span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, email, contact, phone, or external ID"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            />
            </label>

            <label className="space-y-2 text-sm" style={bodyTextStyle()}>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                Source
              </span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as SupplierSourceFilter)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="all">All sources</option>
                <option value="local">Local only</option>
                <option value="synced">Synced only</option>
              </select>
            </label>

            <label className="space-y-2 text-sm" style={bodyTextStyle()}>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                City
              </span>
              <select
                value={cityFilter}
                onChange={(event) => setCityFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="">All cities</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button variant="secondary" onClick={handleSyncPartySuppliers} disabled={isSyncingParty}>
                {isSyncingParty ? 'Syncing...' : 'Sync from party API'}
              </Button>
            ) : null}
            <Link
              href="/suppliers/new"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              New Supplier
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[1.75rem] border border-red-200 bg-red-50 p-8 text-center dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            Failed to load suppliers. Please try again.
          </p>
        </section>
      ) : isFetching && suppliers.length === 0 ? (
        <section className="overflow-hidden rounded-[1.75rem] border shadow-sm" style={summaryCardStyle()}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead style={{ backgroundColor: 'var(--surface-subtle)' }}>
                <tr>
                  {['Supplier', 'Source', 'External ID', 'Primary contact', 'Compliance', 'Location', 'Actions'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={mutedTextStyle()}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={7} />
              </tbody>
            </table>
          </div>
        </section>
      ) : filteredSuppliers.length === 0 ? (
        <section className="rounded-[1.75rem] border p-10 text-center shadow-sm" style={summaryCardStyle()}>
          <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={mutedTextStyle()}>
            Suppliers
          </p>
          <h2 className="mt-3 text-2xl font-semibold" style={strongTextStyle()}>
            {suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers match these filters'}
          </h2>
          <p className="mt-2 text-sm" style={bodyTextStyle()}>
            {suppliers.length === 0
              ? 'Create a supplier or sync from the party API to start building your supplier master.'
              : 'Adjust the filters or search query to widen the results.'}
          </p>
          {suppliers.length === 0 ? (
            <div className="mt-5 flex justify-center gap-3">
              {canManage ? (
                <Button variant="secondary" onClick={handleSyncPartySuppliers} disabled={isSyncingParty}>
                  {isSyncingParty ? 'Syncing...' : 'Sync from party API'}
                </Button>
              ) : null}
              <Link
                href="/suppliers/new"
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
              >
                Create Supplier
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="overflow-hidden rounded-[1.75rem] border shadow-sm" style={summaryCardStyle()}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead style={{ backgroundColor: 'var(--surface-subtle)' }}>
                <tr>
                  {['Supplier', 'Source', 'External ID', 'Primary contact', 'Compliance', 'Location', 'Actions'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={mutedTextStyle()}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => {
                  const badge = sourceBadge(supplier.source);
                  return (
                    <tr
                      key={supplier.id}
                      className="border-t border-slate-200/80 align-top transition hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-900/40"
                    >
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900 dark:text-white">{supplier.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {supplier.email || supplier.phone || 'No email or phone'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge label={badge.label} variant={badge.variant} />
                          {!supplier.isActive ? <Badge label="Inactive" variant="yellow" /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs text-slate-900 dark:text-slate-200">
                          {supplier.externalPartyId ?? 'Not linked'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-900 dark:text-white">
                            {supplier.contactPerson || 'Not set'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {supplier.phone || supplier.email || 'No direct contact'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-900 dark:text-white">
                            {supplier.tradeLicenseNumber || 'No trade license'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            TRN: {supplier.trnNumber || 'Not set'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            License expiry: {formatDate(supplier.tradeLicenseExpiry)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-900 dark:text-white">{supplier.city || 'No city'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{supplier.address || 'No address'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/suppliers/${supplier.id}/edit`}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => openDeleteModal(supplier)}
                            className="inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:border-red-400 dark:hover:bg-red-500/15"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, supplier: null, check: null, loading: false })}
        title="Delete Supplier"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            {deleteModal.supplier ? (
              <>
                You are about to remove <span className="font-semibold">{deleteModal.supplier.name}</span>.
              </>
            ) : (
              'You are about to remove this supplier.'
            )}
          </p>
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-sm text-slate-300">{deleteModal.loading ? 'Checking delete rules...' : deleteModalCopy(deleteModal.check)}</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteModal({ open: false, supplier: null, check: null, loading: false })}
              fullWidth
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmDelete}
              fullWidth
              loading={isDeleting}
              disabled={deleteModal.loading || deleteModal.check?.canDelete === false}
            >
              {deleteModal.check?.canDeactivate ? 'Deactivate' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
