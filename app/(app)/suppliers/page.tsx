'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { ContextMenu, type ContextMenuOption } from '@/components/ui/ContextMenu';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import toast from 'react-hot-toast';
import {
  useGetSuppliersQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
} from '@/store/hooks';

interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function SuppliersPage() {
  const { data: suppliers = [], isFetching, error } = useGetSuppliersQuery();
  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation();
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation();
  const [deleteSupplier, { isLoading: isDeleting }] = useDeleteSupplierMutation();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Supplier | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; supplier: Supplier } | null>(null);

  // Filter states
  const [searchName, setSearchName] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
  });

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
    setFormData({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: '',
    });
    setShowModal(true);
  };

  const openEdit = (supplier: Supplier) => {
    setContextMenu(null);
    setEditingId(supplier.id);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      city: supplier.city ?? '',
      country: supplier.country ?? '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateSupplier({ id: editingId, data: formData }).unwrap();
        toast.success('Supplier updated');
      } else {
        await createSupplier(formData).unwrap();
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
      await deleteSupplier(deleteConfirm.id).unwrap();
      toast.success('Supplier deleted');
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete supplier');
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
      key: 'name',
      header: 'Supplier Name',
      sortable: true,
    },
    {
      key: 'contactPerson',
      header: 'Contact Person',
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
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Suppliers</h1>
          <p className="text-slate-400 text-sm mt-1">{filtered.length} suppliers</p>
        </div>
        <Button onClick={openCreate}>+ Add Supplier</Button>
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Supplier Name *</label>
            <input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. ABC Supplies Ltd"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Contact Person</label>
              <input
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
              <input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">City</label>
              <input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Country</label>
            <input
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
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
          <p className="text-sm text-slate-400">This action cannot be undone.</p>
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
