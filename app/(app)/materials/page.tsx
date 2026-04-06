'use client';

import { useEffect, useState } from 'react';
import Link                     from 'next/link';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMaterials, deleteMaterial, createMaterial, updateMaterial, type Material } from '@/store/slices/materialsSlice';
import { Button }               from '@/components/ui/Button';
import DataTable                from '@/components/ui/DataTable';
import { Badge }                from '@/components/ui/Badge';
import Modal                    from '@/components/ui/Modal';
import TransferModal            from '@/components/transactions/TransferModal';
import toast                    from 'react-hot-toast';
import { useSession }           from 'next-auth/react';
import type { Column }          from '@/components/ui/DataTable';

export default function MaterialsPage() {
  const dispatch   = useAppDispatch();
  const { data: session } = useSession();
  const { items: materials, loading } = useAppSelector((s) => s.materials);
  const perms      = (session?.user?.permissions ?? []) as string[];
  const isSA       = session?.user?.isSuperAdmin ?? false;
  const canCreate  = isSA || perms.includes('material.create');
  const canEdit    = isSA || perms.includes('material.edit');
  const canDelete  = isSA || perms.includes('material.delete');
  const canReceive = isSA || perms.includes('transaction.stock_in');
  const canTransfer = isSA || perms.includes('transaction.transfer');
  const [transferModal, setTransferModal] = useState(false);

  const [formModal,   setFormModal]   = useState(false);
  const [editing,     setEditing]     = useState<Material | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    material: Material | null;
    loading: boolean;
    checking: boolean;
    linkedTransactions: any[];
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });

  // Form state
  const [name,         setName]         = useState('');
  const [unit,         setUnit]         = useState('');
  const [category,     setCategory]     = useState('');
  const [currentStock, setCurrentStock] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('');
  const [unitCost,     setUnitCost]     = useState('');

  useEffect(() => { dispatch(fetchMaterials()); }, [dispatch]);

  const openCreate = () => {
    setEditing(null);
    setName(''); setUnit(''); setCategory('');
    setCurrentStock('0'); setReorderLevel(''); setUnitCost('');
    setFormModal(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setName(m.name); setUnit(m.unit); setCategory(m.category ?? '');
    setCurrentStock(String(m.currentStock));
    setReorderLevel(m.reorderLevel !== undefined ? String(m.reorderLevel) : '');
    setUnitCost(m.unitCost !== undefined ? String(m.unitCost) : '');
    setFormModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    const data = {
      name, unit, category: category || undefined,
      currentStock: parseFloat(currentStock) || 0,
      reorderLevel: reorderLevel ? parseFloat(reorderLevel) : undefined,
      unitCost:     unitCost     ? parseFloat(unitCost)     : undefined,
    };
    const result = editing
      ? await dispatch(updateMaterial({ id: editing._id, data }))
      : await dispatch(createMaterial(data));

    setFormLoading(false);
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success(editing ? 'Material updated' : 'Material created');
      setFormModal(false);
    } else {
      toast.error((result.payload as string) ?? 'Save failed');
    }
  };

  const openDeleteModal = async (material: Material) => {
    setDeleteModal({ open: true, material, loading: false, checking: true, linkedTransactions: [], linkedCount: 0, canDelete: true });
    try {
      const res = await fetch(`/api/materials/${material._id}/check-delete`);
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

  const handleSoftDelete = async () => {
    if (!deleteModal.material) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    const result = await dispatch(deleteMaterial({ id: deleteModal.material._id, hardDelete: false }));
    setDeleteModal((prev) => ({ ...prev, loading: false }));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Material deactivated');
      setDeleteModal({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });
    } else {
      toast.error((result.payload as string) ?? 'Failed to deactivate material');
    }
  };

  const handleHardDelete = async () => {
    if (!deleteModal.material) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    const result = await dispatch(deleteMaterial({ id: deleteModal.material._id, hardDelete: true }));
    setDeleteModal((prev) => ({ ...prev, loading: false }));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Material permanently deleted');
      setDeleteModal({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });
    } else {
      toast.error((result.payload as string) ?? 'Failed to delete material');
    }
  };

  const columns: Column<Material>[] = [
    { key: 'name',         header: 'Name',     sortable: true },
    { key: 'category',     header: 'Category', sortable: true, render: (m) => m.category ?? '—' },
    { key: 'unit',         header: 'Unit' },
    {
      key: 'currentStock', header: 'Stock', sortable: true,
      render: (m) => (
        <span className={m.reorderLevel && m.currentStock <= m.reorderLevel ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
          {m.currentStock}
        </span>
      ),
    },
    {
      key: 'reorderLevel', header: 'Reorder At',
      render: (m) => m.reorderLevel !== undefined ? String(m.reorderLevel) : '—',
    },
    {
      key: 'isActive', header: 'Status',
      render: (m) => <Badge label={m.isActive ? 'Active' : 'Inactive'} variant={m.isActive ? 'green' : 'gray'} />,
    },
    {
      key: 'actions', header: '',
      render: (m) => (
        <div className="flex items-center gap-2 justify-end">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>Edit</Button>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => openDeleteModal(m)}>Delete</Button>
          )}
        </div>
      ),
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
          {(isSA || perms.includes('transaction.stock_out')) && (
            <>
              <Link href="/materials/dispatch">
                <Button variant="secondary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Dispatch
                </Button>
              </Link>
              <Link href="/materials/dispatch-history">
                <Button variant="secondary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  History
                </Button>
              </Link>
            </>
          )}
          {canTransfer && (
            <Button variant="secondary" onClick={() => setTransferModal(true)}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Transfer
            </Button>
          )}
          {canReceive && (
            <Link href="/materials/receive">
              <Button variant="secondary">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Goods Receipt
              </Button>
            </Link>
          )}
          {canCreate && (
            <Button onClick={openCreate}>+ Add Material</Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={materials.filter((m) => m.isActive)}
        loading={loading}
        emptyText="No materials found. Add your first material."
        searchKeys={['name', 'category', 'unit']}
      />

      <TransferModal
        isOpen={transferModal}
        onClose={() => setTransferModal(false)}
        onSuccess={() => dispatch(fetchMaterials())}
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={formModal}
        onClose={() => setFormModal(false)}
        title={editing ? 'Edit Material' : 'Add Material'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Fiberglass Mat 300gsm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit *</label>
              <input required value={unit} onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="kg / meter / pcs" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Resin, Steel, etc." />
            </div>
            {!editing && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Opening Stock</label>
                <input type="number" min="0" step="0.001" value={currentStock} onChange={(e) => setCurrentStock(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Reorder Level</label>
              <input type="number" min="0" step="0.001" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Alert threshold" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Cost (AED)</label>
              <input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.material && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setDeleteModal({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true })} />
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
              <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-300 font-medium mb-2">⚠️ {deleteModal.linkedCount} linked transaction(s) found:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {deleteModal.linkedTransactions.map((txn: any, idx: number) => (
                    <div key={idx} className="text-xs text-slate-300 bg-slate-900 p-2 rounded">
                      <p>{txn.type} - Qty: {txn.quantity}</p>
                    </div>
                  ))}
                  {deleteModal.linkedCount > deleteModal.linkedTransactions.length && (
                    <p className="text-xs text-slate-400 italic">...and {deleteModal.linkedCount - deleteModal.linkedTransactions.length} more</p>
                  )}
                </div>
              </div>
            )}

            {!deleteModal.checking && deleteModal.linkedCount === 0 && (
              <div className="bg-emerald-600/15 border border-emerald-500/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-emerald-300 font-medium">✓ No linked transactions found - safe to permanently delete</p>
              </div>
            )}

            <div className="bg-slate-700/50 border border-amber-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-amber-300 font-medium mb-1">Two options:</p>
              <ul className="text-xs text-slate-300 space-y-1.5">
                <li><span className="text-emerald-400 font-medium">Deactivate</span> — Hides material from lists but keeps transaction history intact</li>
                <li><span className="text-red-400 font-medium">Permanently Delete</span> — Removes material completely {deleteModal.linkedCount > 0 ? '(disabled - has linked data)' : '(no linked data)'}</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, material: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true })}
                disabled={deleteModal.loading || deleteModal.checking}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSoftDelete}
                disabled={deleteModal.loading || deleteModal.checking}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteModal.loading ? 'Processing...' : 'Deactivate'}
              </button>
              <button
                onClick={handleHardDelete}
                disabled={deleteModal.loading || deleteModal.checking || !deleteModal.canDelete}
                title={!deleteModal.canDelete ? 'Cannot permanently delete - has linked transactions' : ''}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteModal.loading ? 'Processing...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
