'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { cn } from '@/lib/utils';
import {
  canCreateSuppliers,
  canDeleteSuppliers,
  canEditSuppliers,
  canImportSuppliers,
} from '@/lib/auth/supplierAccess';
import SupplierImportModal from '@/components/suppliers/SupplierImportModal';
import { exportSuppliersToXlsx } from '@/lib/import-export/exportSuppliers';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useDeleteSupplierMutation,
  useGetSuppliersPageQuery,
  useLazyGetSuppliersForExportQuery,
  SUPPLIER_PAGE_SIZE_OPTIONS,
  type Supplier,
  type SupplierSourceFilter,
} from '@/store/hooks';

type DeleteCheck = {
  source: string;
  canDelete: boolean;
  canHardDelete: boolean;
  canDeactivate: boolean;
  deleteBlockedReason?: string;
  linkedBatchesCount: number;
};

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

function InfoField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function supplierContactsForDisplay(supplier: Supplier): Array<Record<string, unknown>> {
  if (Array.isArray(supplier.contactsJson) && supplier.contactsJson.length > 0) {
    return supplier.contactsJson as Array<Record<string, unknown>>;
  }
  if (supplier.contactPerson?.trim() || supplier.phone?.trim() || supplier.email?.trim()) {
    return [
      {
        contact_name: supplier.contactPerson?.trim() ?? '',
        email: supplier.email?.trim() ?? '',
        phone: supplier.phone?.trim() ?? '',
      },
    ];
  }
  return [];
}

function SupplierReadOnlyDetails({ supplier }: { supplier: Supplier }) {
  const contacts = supplierContactsForDisplay(supplier);

  return (
    <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={supplier.isActive ? 'secondary' : 'outline'}
          className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide"
        >
          {supplier.isActive ? 'Active' : 'Inactive'}
        </Badge>
        {supplier.source === 'PARTY_API_SYNC' ? (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] uppercase tracking-wide',
              'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200',
            )}
          >
            Synced from party API
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Local
          </Badge>
        )}
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2">
        <InfoField label="Primary contact" value={supplier.contactPerson || 'Not set'} />
        <InfoField label="Email" value={supplier.email || 'Not set'} />
        <InfoField label="Phone" value={supplier.phone || 'Not set'} />
        <InfoField label="External ID" value={supplier.externalPartyId?.toString() ?? 'Not linked'} />
        <InfoField label="City" value={supplier.city || 'Not set'} />
        <InfoField label="Country" value={supplier.country || 'Not set'} />
        <InfoField label="Address" value={supplier.address || 'Not set'} className="md:col-span-2" />
        <InfoField label="Trade license number" value={supplier.tradeLicenseNumber || 'Not set'} />
        <InfoField label="Trade license authority" value={supplier.tradeLicenseAuthority || 'Not set'} />
        <InfoField label="Trade license expiry" value={formatDate(supplier.tradeLicenseExpiry)} />
        <InfoField label="TRN number" value={supplier.trnNumber || 'Not set'} />
        <InfoField label="TRN expiry" value={formatDate(supplier.trnExpiry)} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Contact rows</h3>
          <p className="text-xs text-muted-foreground">
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          </p>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No structured contacts saved for this supplier.
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((row, index) => (
              <div key={index} className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="font-medium text-foreground">
                  {String(row.contact_name ?? '').trim() || 'Unnamed contact'}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <InfoField label="Email" value={String(row.email ?? '').trim() || 'Not set'} />
                  <InfoField label="Phone" value={String(row.phone ?? '').trim() || 'Not set'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  const router = useRouter();
  const { data: session } = useSession();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const user = session?.user;
  const canCreate = user ? canCreateSuppliers(user) : false;
  const canEdit = user ? canEditSuppliers(user) : false;
  const canDelete = user ? canDeleteSuppliers(user) : false;
  const canImport = user ? canImportSuppliers(user) : false;

  const [pageSize, setPageSize] = useState<number>(SUPPLIER_PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SupplierSourceFilter>('all');
  const [detailsSupplierId, setDetailsSupplierId] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(searchQuery.trim());

  const listOffset = (page - 1) * pageSize;
  const {
    data: suppliersPage,
    isFetching,
    error,
  } = useGetSuppliersPageQuery(
    {
      limit: pageSize,
      offset: listOffset,
      search: deferredQuery || undefined,
      source: sourceFilter,
    },
    { refetchOnMountOrArgChange: 30 },
  );
  const suppliers = suppliersPage?.items ?? [];
  const totalSuppliers = suppliersPage?.total ?? 0;

  const detailsSupplier = useMemo(
    () => (detailsSupplierId ? suppliers.find((supplier) => supplier.id === detailsSupplierId) ?? null : null),
    [detailsSupplierId, suppliers],
  );

  const [deleteSupplier, { isLoading: isDeleting }] = useDeleteSupplierMutation();

  const [supplierSourceMode, setSupplierSourceMode] = useState<'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY'>('HYBRID');

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          const m = json.data?.supplierSourceMode;
          setSupplierSourceMode(
            m === 'EXTERNAL_ONLY' || m === 'INTERNAL_ONLY' || m === 'HYBRID' ? m : 'HYBRID',
          );
        }
      } catch {
        if (!cancelled) setSupplierSourceMode('HYBRID');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.activeCompanyId]);

  const canCreateLocalSupplier = canCreate && supplierSourceMode !== 'EXTERNAL_ONLY';

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [fetchSuppliersForExport] = useLazyGetSuppliersForExportQuery();
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    supplier: Supplier | null;
    check: DeleteCheck | null;
    loading: boolean;
  }>({ open: false, supplier: null, check: null, loading: false });

  const totalPages = Math.max(1, Math.ceil(totalSuppliers / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, sourceFilter, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

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

  const handleExport = async () => {
    try {
      const all = await fetchSuppliersForExport().unwrap();
      if (all.length === 0) {
        toast.error('No suppliers to export');
        return;
      }
      exportSuppliersToXlsx(all);
      toast.success(`Exported ${all.length} supplier(s)`);
    } catch {
      toast.error('Failed to export suppliers');
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal.supplier) return;

    try {
      const result = await deleteSupplier(deleteModal.supplier.id).unwrap();
      toast.success(result.message ?? (result.permanent ? 'Supplier deleted' : 'Supplier deactivated'));
      if (detailsSupplierId === deleteModal.supplier.id) setDetailsSupplierId(null);
      setDeleteModal({ open: false, supplier: null, check: null, loading: false });
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete supplier'));
    }
  };

  const openSupplierDetails = (supplierId: string) => {
    setDetailsSupplierId(supplierId);
  };

  const openSupplierContextMenu = (supplier: Supplier, event: React.MouseEvent) => {
    event.preventDefault();

    const options = [
      {
        label: 'Open details',
        action: () => openSupplierDetails(supplier.id),
      },
      canEdit
        ? {
            label: 'Edit supplier',
            action: () => router.push(`/suppliers/${supplier.id}/edit`),
          }
        : null,
      canDelete
        ? {
            label:
              supplier.source === 'PARTY_API_SYNC'
                ? 'Deletion disabled for synced supplier'
                : 'Delete supplier',
            action: () => {
              if (supplier.source === 'PARTY_API_SYNC') {
                toast.error('Synced suppliers cannot be deleted here. Edit the record to deactivate it if needed.');
                return;
              }
              void openDeleteModal(supplier);
            },
            danger: supplier.source !== 'PARTY_API_SYNC',
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; action: () => void; danger?: boolean }>;

    openContextMenu(
      event.clientX,
      event.clientY,
      options.flatMap((option, index) => {
        const item: Array<{ label?: string; action?: () => void; danger?: boolean; divider?: boolean }> = [option];
        if (index < options.length - 1) item.push({ divider: true });
        return item;
      }),
    );
  };

  const tableHeaders = ['Supplier', 'Source', 'External ID', 'Primary contact', 'Compliance', 'Location'];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Master data</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Supplier directory</h1>
          <p className="text-sm text-muted-foreground">
            Manage suppliers and open dedicated create and edit pages for full compliance field entry.
          </p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {compactNumber(totalSuppliers)} supplier{totalSuppliers === 1 ? '' : 's'}
        </p>
      </header>

      {supplierSourceMode === 'EXTERNAL_ONLY' ? (
        <Alert>
          <AlertDescription>
            Manual supplier creation is disabled: this company uses external-only suppliers. Add suppliers via the
            integration API or party lists sync from company settings.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-[minmax(0,1.6fr)_12rem]">
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, email, contact, phone, or external ID"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Source</span>
              <Select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as SupplierSourceFilter)}
              >
                <option value="all">All sources</option>
                <option value="local">Local only</option>
                <option value="synced">Synced only</option>
              </Select>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={handleExport}>
              Export
            </Button>
            {canImport ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setImportModalOpen(true)}>
                Import
              </Button>
            ) : null}
            {canCreateLocalSupplier ? (
              <Link href="/suppliers/new" className={buttonVariants({ size: 'sm' })}>
                New supplier
              </Link>
            ) : canCreate && supplierSourceMode === 'EXTERNAL_ONLY' ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled
                title="This company uses external-only suppliers. Use the integration API or party lists sync from company settings."
              >
                New supplier
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <SupplierImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Failed to load suppliers. Please try again.</AlertDescription>
        </Alert>
      ) : isFetching && suppliers.length === 0 ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {tableHeaders.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={6} />
              </tbody>
            </table>
          </div>
        </section>
      ) : totalSuppliers === 0 ? (
        <section className="rounded-lg border border-border bg-card p-10 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Suppliers</p>
          <h2 className="mt-3 text-lg font-semibold text-foreground">
            {!deferredQuery && sourceFilter === 'all'
              ? 'No suppliers yet'
              : 'No suppliers match these filters'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {!deferredQuery && sourceFilter === 'all'
              ? 'Create a supplier to start building your supplier master.'
              : 'Adjust the filters or search query to widen the results.'}
          </p>
          {!deferredQuery && sourceFilter === 'all' && canCreateLocalSupplier ? (
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/suppliers/new" className={buttonVariants({ size: 'sm' })}>
                Create supplier
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {tableHeaders.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="cursor-pointer border-t border-border align-top transition-colors hover:bg-muted/40"
                    onDoubleClick={() => openSupplierDetails(supplier.id)}
                    onContextMenu={(event) => openSupplierContextMenu(supplier, event)}
                  >
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{supplier.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {supplier.email || supplier.phone || 'No email or phone'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {supplier.source === 'PARTY_API_SYNC' ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] uppercase tracking-wide',
                              'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200',
                            )}
                          >
                            Synced
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] uppercase tracking-wide',
                              'border-border bg-muted/40 text-muted-foreground',
                            )}
                          >
                            Local
                          </Badge>
                        )}
                        {!supplier.isActive ? (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            Inactive
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs text-foreground">{supplier.externalPartyId ?? 'Not linked'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{supplier.contactPerson || 'Not set'}</p>
                        <p className="text-xs text-muted-foreground">
                          {supplier.phone || supplier.email || 'No direct contact'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{supplier.tradeLicenseNumber || 'No trade license'}</p>
                        <p className="text-xs text-muted-foreground">TRN: {supplier.trnNumber || 'Not set'}</p>
                        <p className="text-xs text-muted-foreground">
                          License expiry: {formatDate(supplier.tradeLicenseExpiry)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{supplier.city || 'No city'}</p>
                        <p className="text-xs text-muted-foreground">{supplier.address || 'No address'}</p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DirectoryListPagination
            page={safePage}
            pageSize={pageSize}
            totalPages={totalPages}
            total={totalSuppliers}
            pageStart={listOffset}
            pageEnd={listOffset + suppliers.length}
            pageSizeOptions={SUPPLIER_PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </section>
      )}

      <Modal
        isOpen={Boolean(detailsSupplier)}
        onClose={() => setDetailsSupplierId(null)}
        title={detailsSupplier?.name ?? 'Supplier details'}
        size="lg"
        actions={
          detailsSupplier && canEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                router.push(`/suppliers/${detailsSupplier.id}/edit`);
                setDetailsSupplierId(null);
              }}
            >
              Edit supplier
            </Button>
          ) : undefined
        }
      >
        {detailsSupplier ? <SupplierReadOnlyDetails supplier={detailsSupplier} /> : null}
      </Modal>

      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, supplier: null, check: null, loading: false })}
        title="Delete supplier"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {deleteModal.supplier ? (
              <>
                You are about to remove <span className="font-semibold text-foreground">{deleteModal.supplier.name}</span>.
              </>
            ) : (
              'You are about to remove this supplier.'
            )}
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              {deleteModal.loading ? 'Checking delete rules…' : deleteModalCopy(deleteModal.check)}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isDeleting}
              onClick={() => setDeleteModal({ open: false, supplier: null, check: null, loading: false })}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              onClick={confirmDelete}
              disabled={deleteModal.loading || deleteModal.check?.canDelete === false || isDeleting}
            >
              {isDeleting ? 'Please wait…' : deleteModal.check?.canDeactivate ? 'Deactivate' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

