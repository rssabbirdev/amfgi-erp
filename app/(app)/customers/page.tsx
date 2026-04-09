'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  useGetCustomersQuery,
  useGetJobsQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useDeleteJobMutation,
} from '@/store/hooks';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { Job } from '@/store/api/endpoints/jobs';

interface Customer {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function CustomersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: customers = [], isFetching } = useGetCustomersQuery();
  const { data: jobs = [] } = useGetJobsQuery();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation();
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation();
  const [deleteCustomer, { isLoading: isDeleting }] = useDeleteCustomerMutation();
  const [deleteJob, { isLoading: isDeletingJob }] = useDeleteJobMutation();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('customer.create');
  const canEdit = isSA || perms.includes('customer.edit');
  const canDelete = isSA || perms.includes('customer.delete');

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVariationJob, setSelectedVariationJob] = useState<Job | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    customer: Customer | null;
    loading: boolean;
  }>({ open: false, customer: null, loading: false });

  const [deleteJobModal, setDeleteJobModal] = useState<{
    open: boolean;
    job: Job | null;
    loading: boolean;
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const openCreate = () => {
    setEditing(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setModal(true);
  };


  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name, contactPerson, phone, email, address };

    try {
      if (editing) {
        await updateCustomer({ id: editing.id, data }).unwrap();
        toast.success('Customer updated');
      } else {
        await createCustomer(data).unwrap();
        toast.success('Customer created');
      }
      setModal(false);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.customer) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteCustomer(deleteModal.customer.id).unwrap();
      toast.success('Customer deleted');
      if (selectedCustomer?.id === deleteModal.customer.id) {
        setSelectedCustomer(null);
      }
      setDeleteModal({ open: false, customer: null, loading: false });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete customer');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };


  const handleCustomerContextMenu = (customer: Customer, e: React.MouseEvent) => {
    e.preventDefault();
    const options: any[] = [];

    if (canEdit) {
      options.push({
        label: 'Edit',
        action: () => {
          setEditing(customer);
          setName(customer.name);
          setContactPerson(customer.contactPerson ?? '');
          setPhone(customer.phone ?? '');
          setEmail(customer.email ?? '');
          setAddress(customer.address ?? '');
          setModal(true);
        }
      });
    }
    if (canDelete) {
      if (options.length > 0) options.push({ divider: true });
      options.push({ label: 'Delete', action: () => setDeleteModal({ open: true, customer, loading: false }), danger: true });
    }
    if (options.length > 0) {
      openContextMenu(e.clientX, e.clientY, options);
    }
  };

  const handleJobContextMenu = (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    const options: any[] = [];

    // Consumption & Costing option
    options.push({
      label: '📊 Consumption & Costing',
      action: () => {
        router.push(`/jobs/${job.id}/consumption-costing`);
      },
    });

    // Create variation option
    options.push({ divider: true });
    options.push({
      label: '+ Create Variation',
      action: () => {
        router.push(`/jobs/form?mode=variation&parentJobId=${job.id}&customerId=${selectedCustomer?.id}`);
      },
    });

    // Delete option
    if (canDelete) {
      options.push({ divider: true });
      options.push({
        label: 'Delete',
        action: async () => {
          // Check if job has linked transactions
          try {
            const res = await fetch(`/api/jobs/${job.id}/check-delete`);
            const data = await res.json();
            if (data.data) {
              setDeleteJobModal({
                open: true,
                job,
                loading: false,
                linkedCount: data.data.linkedTransactionsCount ?? 0,
                canDelete: data.data.canDelete ?? false,
              });
            }
          } catch {
            toast.error('Failed to check job dependencies');
          }
        },
        danger: true,
      });
    }

    if (options.length > 0) {
      openContextMenu(e.clientX, e.clientY, options);
    }
  };

  const handleVariationContextMenu = (variation: Job, e: React.MouseEvent) => {
    e.preventDefault();
    const options: any[] = [];

    // Consumption & Costing option
    options.push({
      label: '📊 Consumption & Costing',
      action: () => {
        router.push(`/jobs/${variation.id}/consumption-costing`);
      },
    });

    // Delete option only for variations
    if (canDelete) {
      options.push({ divider: true });
      options.push({
        label: 'Delete Variation',
        action: async () => {
          // Check if variation has linked transactions
          try {
            const res = await fetch(`/api/jobs/${variation.id}/check-delete`);
            const data = await res.json();
            if (data.data) {
              setDeleteJobModal({
                open: true,
                job: variation,
                loading: false,
                linkedCount: data.data.linkedTransactionsCount ?? 0,
                canDelete: data.data.canDelete ?? false,
              });
            }
          } catch {
            toast.error('Failed to check job dependencies');
          }
        },
        danger: true,
      });
    }

    if (options.length > 0) {
      openContextMenu(e.clientX, e.clientY, options);
    }
  };

  const customerJobs = selectedCustomer ? jobs.filter(j => j.customerId === selectedCustomer.id && !j.parentJobId) : [];
  const jobVariations = selectedVariationJob ? jobs.filter(j => j.parentJobId === selectedVariationJob.id) : [];
  const displayedJob = selectedVariationJob || customerJobs[0];
  const allRelatedJobs: Job[] = (selectedVariationJob
    ? [selectedVariationJob, ...jobVariations]
    : displayedJob
      ? [displayedJob, ...jobVariations]
      : []) as Job[];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-slate-400 text-xs">{customers.length} total</p>
        </div>
        {canCreate && <Button onClick={openCreate}>+ Add Customer</Button>}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Left Panel - Customer List */}
        <div className="w-72 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-slate-700 bg-slate-700/50">
            <p className="text-xs font-semibold text-white uppercase tracking-wider">Customers</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isFetching && customers.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">Loading...</div>
            ) : customers.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">No customers</div>
            ) : (
              customers.map((customer) => (
                <div key={customer.id}>
                  <div
                    className={`px-3 py-2 border-b border-slate-700 cursor-pointer transition-colors text-sm ${
                      selectedCustomer?.id === customer.id
                        ? 'bg-emerald-600/20 text-emerald-400'
                        : 'hover:bg-slate-700/50 text-white'
                    }`}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      // Auto-select first job for better UX
                      const firstJob = jobs.find(j => j.customerId === customer.id && !j.parentJobId);
                      if (firstJob) {
                        setSelectedVariationJob(firstJob);
                      }
                    }}
                    onContextMenu={(e) => handleCustomerContextMenu(customer, e)}
                  >
                    <p className="font-medium truncate">{customer.name}</p>
                  </div>
                  {selectedCustomer?.id === customer.id && (
                    <div className="px-3 py-2 bg-slate-700/30 text-xs space-y-1">
                      {customer.contactPerson && (
                        <div>
                          <p className="text-slate-400">Contact: <span className="text-slate-300">{customer.contactPerson}</span></p>
                        </div>
                      )}
                      {customer.email && (
                        <div>
                          <p className="text-slate-400">Email: <span className="text-slate-300">{customer.email}</span></p>
                        </div>
                      )}
                      {customer.phone && (
                        <div>
                          <p className="text-slate-400">Phone: <span className="text-slate-300">{customer.phone}</span></p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Split into Jobs List and Variations */}
        <div className="flex-1 flex gap-4">
          {/* Main Jobs List */}
          <div className="w-56 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-slate-700 bg-slate-700/50">
              <p className="text-xs font-semibold text-white uppercase tracking-wider">Main Jobs</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!selectedCustomer ? (
                <div className="p-3 text-center text-slate-400 text-xs">Select customer</div>
              ) : customerJobs.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs">No jobs</div>
              ) : (
                <div className="space-y-1 p-1">
                  {customerJobs.filter(job => !job.parentJobId).map((job) => (
                    <div
                      key={job.id}
                      onClick={() => {
                        setSelectedVariationJob(job);
                      }}
                      onContextMenu={(e) => handleJobContextMenu(job, e)}
                      className={`px-2 py-1.5 rounded cursor-pointer transition-colors text-xs ${
                        selectedVariationJob?.id === job.id || (selectedVariationJob?.parentJobId === job.id)
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500'
                          : 'bg-slate-700/50 border border-slate-700 hover:border-slate-600 text-white'
                      }`}
                    >
                      <p className="font-medium">{job.jobNumber}</p>
                      <p className="text-xs text-slate-400 truncate">{job.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Job Details and Variations */}
          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
            {!selectedCustomer ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a customer</div>
            ) : !displayedJob ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select a job</div>
            ) : (
              <>
                {/* Selected Job Display */}
                <div className="border-b border-slate-700 bg-slate-700/30 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-bold text-cyan-400">{displayedJob.jobNumber}</h3>
                    {displayedJob.parentJobId && <Badge label="Variation" variant="blue" />}
                  </div>
                  {displayedJob.description && <p className="text-xs text-slate-300 mb-1">{displayedJob.description}</p>}
                  <div className="flex items-center gap-2 text-xs">
                    {displayedJob.site && <span className="text-slate-400">📍 {displayedJob.site}</span>}
                    {displayedJob.status && <Badge label={displayedJob.status} variant="blue" />}
                  </div>
                </div>

                {/* Variations List */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-3">
                    {jobVariations.length === 0 ? (
                      <p className="text-center text-slate-400 text-xs">No variations</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Variations:</p>
                        {jobVariations.map((variation) => (
                          <div
                            key={variation.id}
                            onClick={() => setSelectedVariationJob(variation)}
                            onContextMenu={(e) => handleVariationContextMenu(variation, e)}
                            className={`p-2 rounded border cursor-pointer transition-colors text-xs ${
                              selectedVariationJob?.id === variation.id
                                ? 'bg-emerald-600/20 border-emerald-500'
                                : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                            }`}
                          >
                            <p className="font-medium text-cyan-400">{variation.jobNumber}</p>
                            {variation.description && <p className="text-slate-400 mt-0.5">{variation.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit/Create Modal */}
      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Customer' : 'Add Customer'}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} size="sm">
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={isCreating || isUpdating} size="sm">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="customer-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Contact Person</label>
            <input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      {deleteModal.open && deleteModal.customer && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteModal({ open: false, customer: null, loading: false })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Customer</h2>
            <p className="text-slate-300 text-sm mb-6">
              Delete <strong>{deleteModal.customer.name}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, customer: null, loading: false })}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}


      {/* Delete Job Modal */}
      {deleteJobModal.open && deleteJobModal.job && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">
              Delete {deleteJobModal.job.parentJobId ? 'Job Variation' : 'Job'}?
            </h2>

            {deleteJobModal.canDelete ? (
              <>
                <p className="text-slate-300 text-sm mb-6">
                  Delete <strong>{deleteJobModal.job.jobNumber}</strong>?
                </p>
                <p className="text-slate-400 text-xs mb-4">
                  {deleteJobModal.job.parentJobId ? 'This variation will be permanently removed.' : 'This job and all its variations will be permanently removed.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-300 text-sm mb-4">
                  Cannot delete <strong>{deleteJobModal.job.jobNumber}</strong>
                </p>
                <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-6">
                  <p className="text-sm text-red-300 font-medium mb-2">This job has linked data:</p>
                  <p className="text-sm text-red-300">
                    {deleteJobModal.linkedCount} transaction{deleteJobModal.linkedCount !== 1 ? 's' : ''} are using this job
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
                disabled={deleteJobModal.loading}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteJobModal.canDelete ? 'Cancel' : 'Close'}
              </button>
              {deleteJobModal.canDelete && (
                <button
                  onClick={async () => {
                    setDeleteJobModal((prev) => ({ ...prev, loading: true }));
                    try {
                      await deleteJob(deleteJobModal.job!.id).unwrap();
                      toast.success(deleteJobModal.job!.parentJobId ? 'Job variation deleted' : 'Job deleted');
                      setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });
                      if (selectedVariationJob?.id === deleteJobModal.job!.id) {
                        setSelectedVariationJob(null);
                      }
                    } catch (err: unknown) {
                      const error = err as Record<string, Record<string, unknown>>;
                      const errorMsg = error?.data?.error ?? 'Failed to delete job';
                      toast.error(String(errorMsg));
                      setDeleteJobModal((prev) => ({ ...prev, loading: false }));
                    }
                  }}
                  disabled={deleteJobModal.loading}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {deleteJobModal.loading ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
