'use client';

import { useEffect, useState }            from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchCustomers, createCustomer, updateCustomer, deleteCustomer, type Customer,
} from '@/store/slices/customersSlice';
import { Button }   from '@/components/ui/Button';
import DataTable    from '@/components/ui/DataTable';
import { Badge }    from '@/components/ui/Badge';
import Modal        from '@/components/ui/Modal';
import toast        from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import type { Column } from '@/components/ui/DataTable';

export default function CustomersPage() {
  const dispatch = useAppDispatch();
  const { data: session } = useSession();
  const { items: customers, loading } = useAppSelector((s) => s.customers);
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const perms        = (session?.user?.permissions ?? []) as string[];
  const canCreate    = isSuperAdmin || perms.includes('customer.create');
  const canEdit      = isSuperAdmin || perms.includes('customer.edit');
  const canDelete    = isSuperAdmin || perms.includes('customer.delete');

  const [modal,       setModal]       = useState(false);
  const [editing,     setEditing]     = useState<Customer | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    customer: Customer | null;
    loading: boolean;
    checking: boolean;
    linkedJobs: any[];
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, customer: null, loading: false, checking: false, linkedJobs: [], linkedCount: 0, canDelete: true });

  const [name,          setName]          = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone,         setPhone]         = useState('');
  const [email,         setEmail]         = useState('');
  const [address,       setAddress]       = useState('');

  useEffect(() => { dispatch(fetchCustomers()); }, [dispatch]);

  const openCreate = () => {
    setEditing(null);
    setName(''); setContactPerson(''); setPhone(''); setEmail(''); setAddress('');
    setModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name); setContactPerson(c.contactPerson ?? '');
    setPhone(c.phone ?? ''); setEmail(c.email ?? ''); setAddress(c.address ?? '');
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    const data = {
      name,
      contactPerson: contactPerson || undefined,
      phone:         phone || undefined,
      email:         email || undefined,
      address:       address || undefined,
    };
    const result = editing
      ? await dispatch(updateCustomer({ id: editing._id, data }))
      : await dispatch(createCustomer(data));
    setFormLoading(false);
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success(editing ? 'Customer updated' : 'Customer created');
      setModal(false);
    } else {
      toast.error((result.payload as string) ?? 'Save failed');
    }
  };

  const openDeleteModal = async (customer: Customer) => {
    setDeleteModal({ open: true, customer, loading: false, checking: true, linkedJobs: [], linkedCount: 0, canDelete: true });
    try {
      const res = await fetch(`/api/customers/${customer._id}/check-delete`);
      const json = await res.json();
      if (json.data) {
        setDeleteModal((prev) => ({
          ...prev,
          checking: false,
          linkedJobs: json.data.linkedJobs || [],
          linkedCount: json.data.linkedJobsCount || 0,
          canDelete: json.data.canDelete,
        }));
      }
    } catch (err) {
      setDeleteModal((prev) => ({ ...prev, checking: false }));
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteModal.customer) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    const result = await dispatch(deleteCustomer({ id: deleteModal.customer._id, hardDelete: false }));
    setDeleteModal((prev) => ({ ...prev, loading: false }));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Customer deactivated');
      setDeleteModal({ open: false, customer: null, loading: false, checking: false, linkedJobs: [], linkedCount: 0, canDelete: true });
    } else {
      toast.error((result.payload as string) ?? 'Failed to deactivate customer');
    }
  };

  const handleHardDelete = async () => {
    if (!deleteModal.customer) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    const result = await dispatch(deleteCustomer({ id: deleteModal.customer._id, hardDelete: true }));
    setDeleteModal((prev) => ({ ...prev, loading: false }));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Customer permanently deleted');
      setDeleteModal({ open: false, customer: null, loading: false, checking: false, linkedJobs: [], linkedCount: 0, canDelete: true });
    } else {
      toast.error((result.payload as string) ?? 'Failed to delete customer');
    }
  };

  const columns: Column<Customer>[] = [
    { key: 'name',          header: 'Name',           sortable: true },
    { key: 'contactPerson', header: 'Contact Person', render: (c) => c.contactPerson ?? '—' },
    { key: 'phone',         header: 'Phone',          render: (c) => c.phone ?? '—' },
    { key: 'email',         header: 'Email',          render: (c) => c.email ?? '—' },
    {
      key: 'isActive', header: 'Status',
      render: (c) => <Badge label={c.isActive ? 'Active' : 'Inactive'} variant={c.isActive ? 'green' : 'gray'} />,
    },
    {
      key: 'actions', header: '',
      render: (c) => (
        <div className="flex gap-2 justify-end">
          {canEdit && <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => openDeleteModal(c)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-slate-400 text-sm mt-1">{customers.length} customers</p>
        </div>
        {canCreate && <Button onClick={openCreate}>+ Add Customer</Button>}
      </div>

      <DataTable
        columns={columns}
        data={customers.filter((c) => c.isActive)}
        loading={loading}
        emptyText="No customers found."
        searchKeys={['name', 'contactPerson', 'email', 'phone']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Customer' : 'Add Customer'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Company Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Gulf Marine LLC" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Contact Person</label>
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.customer && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setDeleteModal({ open: false, customer: null, loading: false, checking: false, linkedJobs: [], linkedCount: 0, canDelete: true })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl max-h-96 overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Customer</h2>
            <p className="text-slate-300 text-sm mb-4">
              You are about to delete <strong>{deleteModal.customer.name}</strong>.
            </p>

            {deleteModal.checking && (
              <div className="bg-slate-700/50 rounded-lg p-4 mb-4 text-center">
                <p className="text-sm text-slate-300">Checking for linked jobs...</p>
              </div>
            )}

            {!deleteModal.checking && deleteModal.linkedCount > 0 && (
              <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-300 font-medium mb-2">⚠️ {deleteModal.linkedCount} linked job(s) found:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {deleteModal.linkedJobs.map((job: any, idx: number) => (
                    <div key={idx} className="text-xs text-slate-300 bg-slate-900 p-2 rounded">
                      <p className="font-medium">{job.jobNumber}</p>
                      <p className="text-slate-400">{job.description}</p>
                    </div>
                  ))}
                  {deleteModal.linkedCount > deleteModal.linkedJobs.length && (
                    <p className="text-xs text-slate-400 italic">...and {deleteModal.linkedCount - deleteModal.linkedJobs.length} more</p>
                  )}
                </div>
              </div>
            )}

            {!deleteModal.checking && deleteModal.linkedCount === 0 && (
              <div className="bg-emerald-600/15 border border-emerald-500/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-emerald-300 font-medium">✓ No linked jobs found - safe to permanently delete</p>
              </div>
            )}

            <div className="bg-slate-700/50 border border-amber-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-amber-300 font-medium mb-1">Two options:</p>
              <ul className="text-xs text-slate-300 space-y-1.5">
                <li><span className="text-emerald-400 font-medium">Deactivate</span> — Hides customer from lists but keeps job history intact</li>
                <li><span className="text-red-400 font-medium">Permanently Delete</span> — Removes customer completely {deleteModal.linkedCount > 0 ? '(disabled - has linked data)' : '(no linked data)'}</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, customer: null, loading: false, checking: false, linkedJobs: [], linkedCount: 0, canDelete: true })}
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
                title={!deleteModal.canDelete ? 'Cannot permanently delete - has linked jobs' : ''}
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
