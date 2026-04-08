'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import {
  useGetJobsQuery,
  useGetCustomersQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
} from '@/store/hooks';

interface Job {
  _id: string;
  jobNumber: string;
  customerId: string;
  customerName?: string;
  description?: string;
  site?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startDate?: Date;
  createdAt: Date;
}

interface Customer {
  _id: string;
  name: string;
}

export default function JobsPage() {
  const { data: session } = useSession();
  const { data: jobs = [], isFetching: jobsLoading } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const [createJob, { isLoading: isCreating }] = useCreateJobMutation();
  const [updateJob, { isLoading: isUpdating }] = useUpdateJobMutation();
  const [deleteJob, { isLoading: isDeleting }] = useDeleteJobMutation();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');
  const canEdit = isSA || perms.includes('job.edit');
  const canDelete = isSA || perms.includes('job.delete');

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    job: Job | null;
    loading: boolean;
  }>({ open: false, job: null, loading: false });

  const [jobNumber, setJobNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const [site, setSite] = useState('');
  const [status, setStatus] = useState<Job['status']>('ACTIVE');
  const [startDate, setStartDate] = useState('');

  const openCreate = () => {
    setEditing(null);
    setJobNumber('');
    setCustomerId('');
    setDescription('');
    setSite('');
    setStatus('ACTIVE');
    setStartDate('');
    setModal(true);
  };

  const openEdit = (job: Job) => {
    setEditing(job);
    setJobNumber(job.jobNumber);
    setCustomerId(job.customerId);
    setDescription(job.description ?? '');
    setSite(job.site ?? '');
    setStatus(job.status);
    setStartDate(job.startDate ? new Date(job.startDate).toISOString().split('T')[0] : '');
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { jobNumber, customerId, description, site, status, startDate: startDate ? new Date(startDate) : undefined };

    try {
      if (editing) {
        await updateJob({ id: editing._id, data }).unwrap();
        toast.success('Job updated');
      } else {
        await createJob(data).unwrap();
        toast.success('Job created');
      }
      setModal(false);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.job) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteJob(deleteModal.job._id).unwrap();
      toast.success('Job deleted');
      setDeleteModal({ open: false, job: null, loading: false });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete job');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const filteredJobs =
    statusFilter === 'ALL' ? jobs : jobs.filter((j) => j.status === statusFilter);

  const columns: Column<Job>[] = [
    { key: 'jobNumber', header: 'Job Number', sortable: true },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      render: (j) => customers.find((c) => c._id === j.customerId)?.name ?? '—',
    },
    { key: 'description', header: 'Description' },
    { key: 'site', header: 'Site' },
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (j) => (
        <div className="flex gap-2 justify-end">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(j)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setDeleteModal({ open: true, job: j, loading: false })}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="text-slate-400 text-sm mt-1">{filteredJobs.length} jobs</p>
        </div>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          {canCreate && <Button onClick={openCreate}>+ Add Job</Button>}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredJobs}
        loading={jobsLoading && jobs.length === 0}
        emptyText="No jobs found."
        searchKeys={['jobNumber', 'description']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Job' : 'Create Job'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Job Number *</label>
            <input
              required
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Customer *</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Site</label>
            <input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Job['status'])}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>
              Cancel
            </Button>
            <Button type="submit" loading={isCreating || isUpdating} fullWidth>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {deleteModal.open && deleteModal.job && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteModal({ open: false, job: null, loading: false })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Job</h2>
            <p className="text-slate-300 text-sm mb-6">
              Delete <strong>{deleteModal.job.jobNumber}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, job: null, loading: false })}
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
    </div>
  );
}
