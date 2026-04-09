'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import TransferModal from '@/components/transactions/TransferModal';
import BulkImportModal from '@/components/materials/BulkImportModal';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetMaterialsQuery,
  useDeleteMaterialMutation,
} from '@/store/hooks';

interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
  warehouse?: string;
  stockType: string;
  externalItemName?: string;
  currentStock: number;
  reorderLevel?: number;
  unitCost?: number;
  isActive: boolean;
  createdAt?: string | Date;
}

export default function MaterialsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: materials = [], isFetching } = useGetMaterialsQuery();
  const [deleteMaterial, { isLoading: isDeleting }] = useDeleteMaterialMutation();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canDelete = isSA || perms.includes('material.delete');
  const canTransfer = isSA || perms.includes('transaction.transfer');

  const [transferModal, setTransferModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    material: Material | null;
    loading: boolean;
    checking: boolean;
    linkedTransactions: any[];
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });

  const handleExport = () => {
    const exportData = materials
      .filter((m) => m.isActive)
      .map((m) => ({
        'Item Name': m.name,
        'Unit': m.unit,
        'Stock Type': m.stockType,
        'Category': m.category || '',
        'Warehouse': m.warehouse || '',
        'Description': m.description || '',
        'External Item Name': m.externalItemName || '',
        'Unit Cost': m.unitCost ?? '',
        'Reorder Level': m.reorderLevel ?? '',
        'Opening Stock': m.currentStock,
      }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materials');
    XLSX.writeFile(wb, `materials-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Materials exported successfully');
  };

  const openDeleteModal = async (material: Material) => {
    setDeleteModal({ open: true, material, loading: false, checking: true, linkedTransactions: [], linkedCount: 0, canDelete: true });
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
    } catch (err) {
      setDeleteModal((prev) => ({ ...prev, checking: false }));
    }
  };

  const handleMaterialContextMenu = useCallback((material: Material, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const options = [];

    options.push({
      label: 'Edit',
      icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      action: () => router.push(`/materials/${material.id}`),
    });

    if (canDelete) {
      options.push({
        divider: true,
      });
      options.push({
        label: 'Delete',
        icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
        action: () => openDeleteModal(material),
        danger: true,
      });
    }

    openContextMenu(e.clientX, e.clientY, options);
  }, [canDelete, openContextMenu, router]);

  const handleDelete = async () => {
    if (!deleteModal.material) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteMaterial(deleteModal.material.id).unwrap();
      toast.success('Material deleted');
      setDeleteModal({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete material');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const columns: Column<Material>[] = [
    { key: 'name', header: 'Item Name', sortable: true },
    { key: 'category', header: 'Category', sortable: true, render: (m) => m.category },
    { key: 'warehouse', header: 'Warehouse', render: (m) => m.warehouse },
    { key: 'stockType', header: 'Stock Type', render: (m) => m.stockType },
    { key: 'externalItemName', header: 'External Item', render: (m) => m.externalItemName },
    { key: 'unit', header: 'Unit' },
    {
      key: 'currentStock',
      header: 'Stock',
      sortable: true,
      render: (m) => (
        <span className={m.reorderLevel && m.currentStock <= m.reorderLevel ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
          {m.currentStock}
        </span>
      ),
    },
    {
      key: 'reorderLevel',
      header: 'Reorder At',
      render: (m) => (m.reorderLevel !== undefined ? (m.reorderLevel === null ? '—' : String(m.reorderLevel)) : '—'),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost (AED)',
      render: (m) => m.unitCost !== undefined ? `AED ${m.unitCost.toFixed(2)}` : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Materials</h1>
          <p className="text-slate-400 text-sm mt-1">{materials.length} items in inventory</p>
        </div>
        <div className="flex gap-3">
          {canTransfer && (
            <Button variant="secondary" onClick={() => setTransferModal(true)}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Transfer
            </Button>
          )}
          <Button variant="secondary" onClick={() => setImportModal(true)}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 16v-4m0 0V8m0 4H8m4 0h4M9 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
            </svg>
            Import Excel
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v8m0 0l-4-4m4 4l4-4M9 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
            </svg>
            Export Excel
          </Button>
          <Button onClick={() => router.push('/materials/new')}>+ Add Material</Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={materials.filter((m) => m.isActive)}
        loading={isFetching && materials.length === 0}
        emptyText="No materials found. Add your first material."
        searchKeys={['name', 'category', 'unit']}
        onRowContextMenu={handleMaterialContextMenu}
      />

      <TransferModal isOpen={transferModal} onClose={() => setTransferModal(false)} onSuccess={() => {}} />

      <BulkImportModal
        isOpen={importModal}
        onClose={() => setImportModal(false)}
        existingMaterials={materials}
      />

      {/* Delete Modal */}
      {deleteModal.open && deleteModal.material && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() =>
              setDeleteModal({
                open: false,
                material: null,
                loading: false,
                checking: false,
                linkedTransactions: [],
                linkedCount: 0,
                canDelete: true,
              })
            }
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl max-h-96 overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Material</h2>
            <p className="text-slate-300 text-sm mb-4">
              You are about to delete <strong>{deleteModal.material.name}</strong>.
            </p>

            {deleteModal.checking && (
              <div className="bg-slate-700/50 rounded-lg p-4 mb-4 text-center">
                <p className="text-sm text-slate-300">Checking for linked data...</p>
              </div>
            )}

            {!deleteModal.checking && deleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-300 font-medium mb-3">
                  ⚠️ This material is linked to {deleteModal.linkedCount} transaction{deleteModal.linkedCount !== 1 ? 's' : ''}
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {deleteModal.linkedTransactions.map((tx: any, idx: number) => (
                    <div key={idx} className="text-xs text-slate-300 bg-slate-700/50 rounded px-2 py-1.5">
                      <p><strong>Job:</strong> {tx.jobNumber}</p>
                      <p><strong>Type:</strong> <span className="text-yellow-400">{tx.type}</span></p>
                      <p><strong>Qty:</strong> {tx.quantity}</p>
                      <p><strong>Date:</strong> {new Date(tx.date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!deleteModal.checking && !deleteModal.canDelete && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-300 font-medium">Cannot delete: This material has active dependencies.</p>
              </div>
            )}

            {!deleteModal.checking && deleteModal.canDelete && deleteModal.linkedCount === 0 && (
              <div className="bg-emerald-950/30 border border-emerald-900 rounded-lg p-4 mb-4">
                <p className="text-sm text-emerald-300">No dependencies found. Safe to delete.</p>
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() =>
                  setDeleteModal({
                    open: false,
                    material: null,
                    loading: false,
                    checking: false,
                    linkedTransactions: [],
                    linkedCount: 0,
                    canDelete: true,
                  })
                }
                disabled={isDeleting || deleteModal.checking}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || deleteModal.checking || !deleteModal.canDelete}
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
