'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import BulkImportModal from '@/components/materials/BulkImportModal';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useDeleteMaterialMutation,
  useGetMaterialsQuery,
  useGetStockValuationQuery,
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

function formatMoney(value?: number) {
  return value !== undefined ? `AED ${value.toFixed(2)}` : '-';
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
  const { data: materials = [], isFetching } = useGetMaterialsQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { data: stockValuation } = useGetStockValuationQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [deleteMaterial, { isLoading: isDeleting }] = useDeleteMaterialMutation();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canDelete = isSA || perms.includes('material.delete');

  const [importModal, setImportModal] = useState(false);
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

  const activeMaterials = useMemo(() => materials.filter((material) => material.isActive), [materials]);

  const lowStockCount = useMemo(
    () =>
      activeMaterials.filter(
        (material) =>
          typeof material.reorderLevel === 'number' && material.currentStock <= material.reorderLevel
      ).length,
    [activeMaterials]
  );

  const inventoryValue = useMemo(
    () =>
      activeMaterials.reduce(
        (sum, material) => sum + material.currentStock * (material.unitCost ?? 0),
        0
      ),
    [activeMaterials]
  );

  const fifoInventoryValue = stockValuation?.summary.fifoStockValue ?? inventoryValue;

  const distinctWarehouses = useMemo(
    () => new Set(activeMaterials.map((material) => material.warehouse).filter(Boolean)).size,
    [activeMaterials]
  );

  const handleExport = () => {
    const exportData = activeMaterials.map((material) => ({
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
          <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{material.id}</span>
        ),
      },
      {
        key: 'name',
        header: 'Material',
        sortable: true,
        render: (material) => (
          <div className="min-w-[220px]">
            <div className="font-medium text-slate-900 dark:text-white">{material.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{material.unit}</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span>{material.stockType}</span>
              {material.externalItemName ? (
                <>
                  <span className="text-slate-300 dark:text-slate-600">/</span>
                  <span className="text-slate-400 dark:text-slate-500">{material.externalItemName}</span>
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
        render: (material) => material.category || <span className="text-slate-400 dark:text-slate-500">Unassigned</span>,
      },
      {
        key: 'description',
        header: 'Description',
        hiddenByDefault: true,
        render: (material) => material.description || <span className="text-slate-400 dark:text-slate-500">-</span>,
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
            <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{material.categoryId}</span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">-</span>
          ),
      },
      {
        key: 'warehouse',
        header: 'Default Warehouse',
        hiddenByDefault: true,
        render: (material) => material.warehouse || <span className="text-slate-400 dark:text-slate-500">Not set</span>,
      },
      {
        key: 'warehouseId',
        header: 'Warehouse ID',
        hiddenByDefault: true,
        render: (material) =>
          material.warehouseId ? (
            <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{material.warehouseId}</span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">-</span>
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
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
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
          <div className="min-w-[120px] text-sm text-slate-700 dark:text-slate-200">{formatMoney(material.unitCost)}</div>
        ),
      },
      {
        key: 'reorderLevel',
        header: 'Reorder Level',
        sortable: true,
        hiddenByDefault: true,
        render: (material) =>
          material.reorderLevel !== undefined ? formatCount(material.reorderLevel) : <span className="text-slate-400 dark:text-slate-500">-</span>,
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
        render: (material) => material.externalItemName || <span className="text-slate-400 dark:text-slate-500">-</span>,
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
    []
  );

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Materials Control
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                 Inventory
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review stock health, move inventory, and jump into material setup without leaving the main grid.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setImportModal(true)}>
                Import Excel
              </Button>
              <Button variant="secondary" onClick={handleExport}>
                Export Excel
              </Button>
              <Button onClick={() => router.push('/stock/materials/new')}>Add Material</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Active materials',
              value: String(activeMaterials.length),
              note: `${materials.length - activeMaterials.length} archived`,
            },
            {
              label: 'Low stock watch',
              value: String(lowStockCount),
              note: 'At or below reorder point',
            },
            {
              label: 'FIFO value',
              value: `AED ${fifoInventoryValue.toFixed(2)}`,
              note: 'Preferred inventory valuation method',
            },
            {
              label: 'Warehouse coverage',
              value: String(distinctWarehouses),
              note: 'Distinct warehouse assignments',
            },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-950/80">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 border-b border-slate-200 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
              Live inventory
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Right-click a row for quick actions, or open a material to edit pricing, UOM, and history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">Double-click to open</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">Search all fields or one field</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">Fuzzy, contains, or exact match</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">Columns save to your profile</span>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={activeMaterials}
          loading={isFetching && materials.length === 0}
          emptyText="No materials found. Add your first material."
          searchKeys={['name', 'description', 'category', 'externalItemName']}
          fuzzySearch
          enableSearchOptions
          enableColumnDisplayOptions
          preferenceKey="stock-materials-table"
          initialPageSize={50}
          pageSizeOptions={[50, 100, 200]}
          onRowContextMenu={handleMaterialContextMenu}
          onRowDoubleClick={(material) => router.push(`/stock/materials/${material.id}`)}
          onRowClick={(material) => router.push(`/stock/materials/${material.id}`)}
        />
      </section>

      <BulkImportModal isOpen={importModal} onClose={() => setImportModal(false)} existingMaterials={materials} />

      {deleteModal.open && deleteModal.material ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={closeDeleteModal} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-600 dark:text-red-300/75">
              Remove material
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{deleteModal.material.name}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Deletion is blocked when linked dispatch or inventory transactions still exist.
            </p>

            {deleteModal.checking ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
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
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
                    >
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Job</span> {tx.jobNumber}
                      </p>
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Type</span> {tx.type}
                      </p>
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Qty</span> {tx.quantity}
                      </p>
                      <p>
                        <span className="text-slate-400 dark:text-slate-500">Date</span>{' '}
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
                variant="danger"
                onClick={handleDelete}
                disabled={isDeleting || deleteModal.checking || !deleteModal.canDelete}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
