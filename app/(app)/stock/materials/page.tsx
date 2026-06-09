'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import DataTable from '@/components/ui/DataTable';
import BulkImportModal from '@/components/materials/BulkImportModal';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import { DEFAULT_MATERIAL_LIST_SORT } from '@/lib/pagination/materialListSort';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import {
  useDeleteMaterialMutation,
  useGetMaterialsPageQuery,
  useLazyGetMaterialsForExportQuery,
  useGetMaterialsForExportQuery,
  useGetStockValuationQuery,
  MATERIAL_PAGE_SIZE_OPTIONS,
} from '@/store/hooks';

interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
  category?: string | null;
  categoryId?: string | null;
  warehouse?: string | null;
  warehouseId?: string | null;
  stockType: string;
  allowNegativeConsumption: boolean;
  externalItemName?: string;
  currentStock: number;
  reorderLevel?: number;
  unitCost?: number;
  isActive: boolean;
  createdAt?: string | Date;
}

interface DeleteCheckTransaction {
  jobNumber: string;
  type: string;
  quantity: number;
  date: string;
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

function formatMoney(value: number | undefined, currencyCode: string) {
  return value !== undefined ? `${currencyCode} ${value.toFixed(2)}` : '-';
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value?: string | Date) {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No';
}

export default function MaterialsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>(DEFAULT_MATERIAL_LIST_SORT);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const deferredSearch = useDeferredValue(searchQuery);

  const listQueryArgs = useMemo(
    () => ({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: deferredSearch,
      sortBy: sortKey,
      sortDir,
    }),
    [deferredSearch, page, pageSize, sortDir, sortKey],
  );

  const { data: pageData, isFetching } = useGetMaterialsPageQuery(listQueryArgs, {
    refetchOnMountOrArgChange: 30,
  });
  const materials = pageData?.items ?? [];
  const totalMaterials = pageData?.total ?? 0;

  const [fetchMaterialsForExport] = useLazyGetMaterialsForExportQuery();
  const { data: stockValuation } = useGetStockValuationQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [deleteMaterial, { isLoading: isDeleting }] = useDeleteMaterialMutation();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, pageSize, sortKey, sortDir]);

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canDelete = isSA || perms.includes('material.delete');

  const [importModal, setImportModal] = useState(false);
  const { data: importMaterials = [] } = useGetMaterialsForExportQuery(undefined, {
    skip: !importModal,
  });
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    material: Material | null;
    loading: boolean;
    checking: boolean;
    linkedTransactions: DeleteCheckTransaction[];
    linkedCount: number;
    canDelete: boolean;
  }>({
    open: false,
    material: null,
    loading: false,
    checking: false,
    linkedTransactions: [],
    linkedCount: 0,
    canDelete: true,
  });

  const valuationCurrencyCode = stockValuation?.summary.currencyCode ?? 'AED';

  const handleExport = async () => {
    const exportMaterials = await fetchMaterialsForExport().unwrap();
    const exportData = exportMaterials.map((material) => ({
      'Material ID': material.id,
      'Item Name': material.name,
      Description: material.description || '',
      Unit: material.unit,
      'Stock Type': material.stockType,
      Category: material.category || '',
      'Category ID': material.categoryId || '',
      Warehouse: material.warehouse || '',
      'Warehouse ID': material.warehouseId || '',
      'Allow Negative Consumption': material.allowNegativeConsumption,
      'Assembly Use Dynamic Cost': material.assemblyUseDynamicCost ?? true,
      'External Item Name': material.externalItemName || '',
      'Unit Cost': material.unitCost ?? '',
      'Reorder Level': material.reorderLevel ?? '',
      'Opening Stock': material.currentStock,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materials');
    XLSX.writeFile(wb, `materials-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Materials exported successfully');
  };

  const closeDeleteModal = () =>
    setDeleteModal({
      open: false,
      material: null,
      loading: false,
      checking: false,
      linkedTransactions: [],
      linkedCount: 0,
      canDelete: true,
    });

  const openDeleteModal = async (material: Material) => {
    setDeleteModal({
      open: true,
      material,
      loading: false,
      checking: true,
      linkedTransactions: [],
      linkedCount: 0,
      canDelete: true,
    });

    try {
      const res = await fetch(`/api/materials/${material.id}/check-delete`);
      const json = await res.json();
      if (json.data) {
        setDeleteModal((prev) => ({
          ...prev,
          checking: false,
          linkedTransactions: json.data.linkedTransactions || [],
          linkedCount: json.data.linkedTransactionsCount || 0,
          canDelete: json.data.canDelete,
        }));
      }
    } catch {
      setDeleteModal((prev) => ({ ...prev, checking: false }));
    }
  };

  const handleMaterialContextMenu = useCallback(
    (material: Material, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const options: ContextMenuOption[] = [
        {
          label: 'Open',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12H9m12 0A9 9 0 113 12a9 9 0 0118 0z"
              />
            </svg>
          ),
          action: () => router.push(`/stock/materials/${material.id}`),
        },
      ];

      if (canDelete) {
        options.push({ divider: true });
        options.push({
          label: 'Delete',
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
          action: () => openDeleteModal(material),
          danger: true,
        });
      }

      openContextMenu(e.clientX, e.clientY, options);
    },
    [canDelete, openContextMenu, router]
  );

  const handleDelete = async () => {
    if (!deleteModal.material) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteMaterial(deleteModal.material.id).unwrap();
      toast.success('Material deleted');
      closeDeleteModal();
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to delete material'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const columns: Column<Material>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'Material ID',
        sortable: true,
        hiddenByDefault: true,
        render: (material) => (
          <span className="font-mono text-xs text-muted-foreground">{material.id}</span>
        ),
      },
      {
        key: 'name',
        header: 'Material',
        sortable: true,
        render: (material) => (
          <div className="min-w-[220px]">
            <div className="font-medium text-foreground">{material.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{material.unit}</span>
              <span className="text-muted-foreground/50">/</span>
              <span>{material.stockType}</span>
              {material.externalItemName ? (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-muted-foreground">{material.externalItemName}</span>
                </>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        sortable: true,
        hiddenByDefault: true,
        render: (material) => material.category || <span className="text-muted-foreground">Unassigned</span>,
      },
      {
        key: 'description',
        header: 'Description',
        hiddenByDefault: true,
        render: (material) => material.description || <span className="text-muted-foreground">-</span>,
      },
      {
        key: 'unit',
        header: 'Unit',
        sortable: true,
        hiddenByDefault: true,
      },
      {
        key: 'stockType',
        header: 'Stock Type',
        sortable: true,
        hiddenByDefault: true,
      },
      {
        key: 'categoryId',
        header: 'Category ID',
        hiddenByDefault: true,
        render: (material) =>
          material.categoryId ? (
            <span className="font-mono text-xs text-muted-foreground">{material.categoryId}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: 'warehouse',
        header: 'Default Warehouse',
        hiddenByDefault: true,
        render: (material) => material.warehouse || <span className="text-muted-foreground">Not set</span>,
      },
      {
        key: 'warehouseId',
        header: 'Warehouse ID',
        hiddenByDefault: true,
        render: (material) =>
          material.warehouseId ? (
            <span className="font-mono text-xs text-muted-foreground">{material.warehouseId}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: 'currentStock',
        header: 'Stock',
        sortable: true,
        render: (material) => {
          const isLow =
            typeof material.reorderLevel === 'number' && material.currentStock <= material.reorderLevel;
          return (
            <div className="min-w-[120px]">
              <div className={isLow ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-emerald-700 dark:text-emerald-300'}>
                {formatCount(material.currentStock)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Reorder {material.reorderLevel !== undefined ? formatCount(material.reorderLevel) : '-'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'unitCost',
        header: 'Unit Cost',
        sortable: true,
        hiddenByDefault: true,
        render: (material) => (
          <div className="min-w-[120px] text-sm text-foreground">
            {formatMoney(material.unitCost, valuationCurrencyCode)}
          </div>
        ),
      },
      {
        key: 'reorderLevel',
        header: 'Reorder Level',
        sortable: true,
        hiddenByDefault: true,
        render: (material) =>
          material.reorderLevel !== undefined ? formatCount(material.reorderLevel) : <span className="text-muted-foreground">-</span>,
      },
      {
        key: 'allowNegativeConsumption',
        header: 'Allow Negative',
        sortable: true,
        hiddenByDefault: true,
        render: (material) => formatBoolean(material.allowNegativeConsumption),
      },
      {
        key: 'externalItemName',
        header: 'External Item Name',
        hiddenByDefault: true,
        render: (material) => material.externalItemName || <span className="text-muted-foreground">-</span>,
      },
      {
        key: 'isActive',
        header: 'Active',
        sortable: true,
        hiddenByDefault: true,
        render: (material) => formatBoolean(material.isActive),
      },
      {
        key: 'createdAt',
        header: 'Created',
        sortable: true,
        hiddenByDefault: true,
        render: (material) => formatDate(material.createdAt),
      },
      {
        key: 'status',
        header: 'Status',
        render: (material) => {
          const isLow =
            typeof material.reorderLevel === 'number' && material.currentStock <= material.reorderLevel;
          return (
            <span
              className={[
                'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                isLow
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
              ].join(' ')}
            >
              {isLow ? 'Low stock' : 'Healthy'}
            </span>
          );
        },
      },
    ],
    [valuationCurrencyCode]
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Materials</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Inventory</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Review stock health, move inventory, and jump into material setup without leaving the main grid.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
            {formatCount(totalMaterials)} active material{totalMaterials === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setImportModal(true)}>
              Import Excel
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
              Export Excel
            </Button>
            <Button type="button" size="sm" onClick={() => router.push('/stock/materials/new')}>
              Add material
            </Button>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="mb-3 max-w-md">
          <label htmlFor="material-search" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search
          </label>
          <Input
            id="material-search"
            className="mt-1.5"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, description, category, external item…"
          />
        </div>

        <DataTable
          columns={columns}
          data={materials}
          loading={isFetching && materials.length === 0}
          emptyText="No materials found. Add your first material."
          enableColumnDisplayOptions
          preferenceKey="stock-materials-table"
          serverPagination={{
            page,
            pageSize,
            total: totalMaterials,
            pageSizeOptions: MATERIAL_PAGE_SIZE_OPTIONS,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
          serverSort={{
            sortKey,
            sortDir,
            onSortChange: (key, dir) => {
              setSortKey(key);
              setSortDir(dir);
            },
          }}
          onRowContextMenu={handleMaterialContextMenu}
          onRowDoubleClick={(material) => router.push(`/stock/materials/${material.id}`)}
          onRowClick={(material) => router.push(`/stock/materials/${material.id}`)}
        />
      </section>

      <BulkImportModal
        isOpen={importModal}
        onClose={() => setImportModal(false)}
        existingMaterials={importMaterials}
      />

      {deleteModal.open && deleteModal.material ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={closeDeleteModal} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-600 dark:text-red-300/75">
              Remove material
            </p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">{deleteModal.material.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Deletion is blocked when linked dispatch or inventory transactions still exist.
            </p>

            {deleteModal.checking ? (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Checking linked data...
              </div>
            ) : null}

            {!deleteModal.checking && deleteModal.linkedCount > 0 ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/70 dark:bg-red-950/20">
                <p className="text-sm font-medium text-red-700 dark:text-red-200">
                  Linked to {deleteModal.linkedCount} transaction{deleteModal.linkedCount !== 1 ? 's' : ''}.
                </p>
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto">
                  {deleteModal.linkedTransactions.map((tx, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-foreground"
                    >
                      <p>
                        <span className="text-muted-foreground">Job</span> {tx.jobNumber}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Type</span> {tx.type}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Qty</span> {tx.quantity}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Date</span>{' '}
                        {new Date(tx.date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!deleteModal.checking && !deleteModal.canDelete ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-200">
                This material still has active dependencies and cannot be removed.
              </div>
            ) : null}

            {!deleteModal.checking && deleteModal.canDelete && deleteModal.linkedCount === 0 ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                No linked dependencies found. Safe to delete.
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={closeDeleteModal} disabled={isDeleting || deleteModal.checking}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || deleteModal.checking || !deleteModal.canDelete}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
