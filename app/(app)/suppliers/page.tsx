'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { ContextMenu, type ContextMenuOption } from '@/components/ui/ContextMenu';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import {
  useGetSuppliersQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useSyncSuppliersFromPartyApiMutation,
  type Supplier,
} from '@/store/hooks';
import {
  emptySupplierPartyFormState,
  supplierPartyFormToApiBody,
  supplierToPartyFormState,
  type PartyContactRow,
  type SupplierPartyFormState,
} from '@/lib/partyFormUi';

export default function SuppliersPage() {
  const { data: session } = useSession();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canStockIn = isSA || perms.includes('transaction.stock_in');

  const { data: suppliers = [], isFetching, error } = useGetSuppliersQuery();
  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation();
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation();
  const [deleteSupplier, { isLoading: isDeleting }] = useDeleteSupplierMutation();
  const [syncPartySuppliers, { isLoading: isSyncingParty }] = useSyncSuppliersFromPartyApiMutation();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Supplier | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; supplier: Supplier } | null>(null);

  // Filter states
  const [searchName, setSearchName] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  const [partyForm, setPartyForm] = useState<SupplierPartyFormState>(emptySupplierPartyFormState());

  // Get unique cities and countries for filter dropdowns
  const cities = Array.from(new Set(suppliers.filter(s => s.city).map(s => s.city!)));
  const countries = Array.from(new Set(suppliers.filter(s => s.country).map(s => s.country!)));

  // Filter suppliers
  const filtered = suppliers.filter((s) => {
    if (!s.isActive) return false;
    if (searchName && !s.name.toLowerCase().includes(searchName.toLowerCase())) return false;
    if (filterCity && s.city !== filterCity) return false;
    if (filterCountry && s.country !== filterCountry) return false;
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setPartyForm(emptySupplierPartyFormState());
    setShowModal(true);
  };

  const openEdit = (supplier: Supplier) => {
    setContextMenu(null);
    setEditingId(supplier.id);
    setPartyForm(supplierToPartyFormState(supplier));
    setShowModal(true);
  };

  const updateContactRow = (index: number, patch: Partial<PartyContactRow>) => {
    setPartyForm((prev) => {
      const contacts = [...prev.contacts];
      contacts[index] = { ...contacts[index], ...patch, sort_order: index };
      return { ...prev, contacts };
    });
  };

  const addContactRow = () => {
    setPartyForm((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        { contact_name: '', email: '', phone: '', sort_order: prev.contacts.length },
      ],
    }));
  };

  const removeContactRow = (index: number) => {
    setPartyForm((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index).map((c, i) => ({ ...c, sort_order: i })),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = supplierPartyFormToApiBody(partyForm);
    try {
      if (editingId) {
        await updateSupplier({ id: editingId, data }).unwrap();
        toast.success('Supplier updated');
      } else {
        await createSupplier(data).unwrap();
        toast.success('Supplier created');
      }
      setShowModal(false);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to save supplier');
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    setContextMenu(null);
    setDeleteConfirm(supplier);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await deleteSupplier(deleteConfirm.id).unwrap();
      toast.success(res.message ?? (res.permanent ? 'Supplier deleted' : 'Supplier deactivated'));
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete supplier');
    }
  };

  const handleSyncPartySuppliers = async () => {
    try {
      const r = await syncPartySuppliers().unwrap();
      toast.success(
        `Synced: ${r.created} new, ${r.updated} updated (${r.totalFromApi} from API)`
      );
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Sync failed — check PARTY_LISTS_API_* env vars');
    }
  };

  const handleRowContextMenu = (supplier: Supplier, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      supplier,
    });
  };

  const columns: Column<Supplier>[] = [
    {
      key: '_source',
      header: '',
      sortable: false,
      render: (row) =>
        row.source === 'PARTY_API_SYNC' ? <Badge label="Synced" variant="blue" /> : null,
    },
    {
      key: 'name',
      header: 'Supplier Name',
      sortable: true,
    },
    {
      key: 'tradeLicenseNumber',
      header: 'trade_license_number',
      sortable: true,
      render: (row) =>
        row.tradeLicenseNumber ? (
          <span className="text-slate-200">{row.tradeLicenseNumber}</span>
        ) : (
          <span className="text-slate-500">—</span>
        ),
    },
    {
      key: 'contactPerson',
      header: 'contact (primary)',
      sortable: true,
    },
    {
      key: 'email',
      header: 'Email',
      render: (row) => (
        row.email ? (
          <a href={`mailto:${row.email}`} className="text-emerald-400 hover:underline">
            {row.email}
          </a>
        ) : (
          <span className="text-slate-500">—</span>
        )
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => row.phone || <span className="text-slate-500">—</span>,
    },
    {
      key: 'city',
      header: 'City',
      render: (row) => row.city || <span className="text-slate-500">—</span>,
    },
    {
      key: 'country',
      header: 'Country',
      render: (row) => row.country || <span className="text-slate-500">—</span>,
    },
  ];

  const contextMenuOptions: ContextMenuOption[] = contextMenu ? [
    {
      label: 'Edit',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      action: () => openEdit(contextMenu.supplier),
    },
    {
      divider: true,
    },
    ...(contextMenu.supplier.source === 'PARTY_API_SYNC'
      ? [
          {
            label: 'Delete (not available for synced)',
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ),
            action: () =>
              toast.error(
                'Suppliers from the party lists API cannot be deleted here. Deactivate via Edit if needed.'
              ),
          },
        ]
      : [
          {
            label: 'Delete',
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ),
            danger: true,
            action: () => handleDelete(contextMenu.supplier),
          },
        ]),
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Suppliers</h1>
          <p className="text-slate-400 text-sm mt-1">{filtered.length} suppliers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canStockIn && (
            <Button
              variant="secondary"
              onClick={handleSyncPartySuppliers}
              disabled={isSyncingParty}
            >
              {isSyncingParty ? 'Syncing…' : '↻ Sync from party API'}
            </Button>
          )}
          <Button onClick={openCreate}>+ Add Supplier</Button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Search by name</label>
          <input
            type="text"
            placeholder="Supplier name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Filter by city</label>
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Filter by country</label>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Countries</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="text-center py-12 bg-red-950/30 border border-red-900 rounded-lg">
          <p className="text-red-400">Failed to load suppliers. Please try again.</p>
        </div>
      )}

      {/* Table */}
      {!error && isFetching && filtered.length === 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 text-left font-medium text-slate-400">
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TableSkeleton rows={5} columns={columns.length} />
            </tbody>
          </table>
        </div>
      ) : !error && filtered.length === 0 && suppliers.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-lg">
          <p className="text-slate-400">No suppliers found. Create your first supplier to get started.</p>
        </div>
      ) : !error && filtered.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-lg">
          <p className="text-slate-400">No suppliers match your filters.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={isFetching}
          emptyText="No suppliers match your filters."
          onRowContextMenu={handleRowContextMenu}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          options={contextMenuOptions}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Supplier' : 'Add Supplier'}>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-xs text-slate-500">
            Party API fields use the same names as API-party-lists.md. <strong>city</strong> and{' '}
            <strong>country</strong> are AMFGI-only (not returned by the party API).
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">name *</label>
            <input
              required
              value={partyForm.name}
              onChange={(e) => setPartyForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. ABC Supplies Ltd"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">email</label>
            <input
              type="email"
              value={partyForm.email}
              onChange={(e) => setPartyForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trade_license_number</label>
              <input
                value={partyForm.trade_license_number}
                onChange={(e) =>
                  setPartyForm((p) => ({ ...p, trade_license_number: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trade_license_authority</label>
              <input
                value={partyForm.trade_license_authority}
                onChange={(e) =>
                  setPartyForm((p) => ({ ...p, trade_license_authority: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trade_license_expiry</label>
              <input
                type="date"
                value={partyForm.trade_license_expiry}
                onChange={(e) =>
                  setPartyForm((p) => ({ ...p, trade_license_expiry: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trn_number</label>
              <input
                value={partyForm.trn_number}
                onChange={(e) => setPartyForm((p) => ({ ...p, trn_number: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trn_expiry</label>
              <input
                type="date"
                value={partyForm.trn_expiry}
                onChange={(e) => setPartyForm((p) => ({ ...p, trn_expiry: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">city (AMFGI)</label>
              <input
                value={partyForm.city}
                onChange={(e) => setPartyForm((p) => ({ ...p, city: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">country (AMFGI)</label>
              <input
                value={partyForm.country}
                onChange={(e) => setPartyForm((p) => ({ ...p, country: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">address (AMFGI)</label>
            <textarea
              value={partyForm.address}
              onChange={(e) => setPartyForm((p) => ({ ...p, address: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">contacts</label>
              <button
                type="button"
                onClick={addContactRow}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                + Add contact
              </button>
            </div>
            <div className="space-y-3">
              {partyForm.contacts.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-600 bg-slate-900/40 p-3 space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">sort_order {idx}</span>
                    {partyForm.contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContactRow(idx)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    placeholder="contact_name"
                    value={row.contact_name}
                    onChange={(e) => updateContactRow(idx, { contact_name: e.target.value })}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="email"
                      value={row.email}
                      onChange={(e) => updateContactRow(idx, { email: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                    />
                    <input
                      placeholder="phone"
                      value={row.phone}
                      onChange={(e) => updateContactRow(idx, { phone: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" loading={isCreating || isUpdating} fullWidth>
              {editingId ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Supplier">
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to delete <span className="font-semibold">{deleteConfirm?.name}</span>?
          </p>
          <p className="text-sm text-slate-400">
            If this supplier is used on stock batches, they will be kept and the supplier will only be
            marked inactive.
          </p>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteConfirm(null)}
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
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
