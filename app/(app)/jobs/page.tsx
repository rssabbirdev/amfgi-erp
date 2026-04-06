'use client';

import { useEffect, useState }            from 'react';
import Link                               from 'next/link';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchJobs, createJob, updateJob, deleteJob, type Job } from '@/store/slices/jobsSlice';
import { fetchCustomers }                 from '@/store/slices/customersSlice';
import { Button }          from '@/components/ui/Button';
import DataTable           from '@/components/ui/DataTable';
import { StatusBadge }     from '@/components/ui/Badge';
import Modal               from '@/components/ui/Modal';
import toast               from 'react-hot-toast';
import { useSession }      from 'next-auth/react';
import { formatDate }      from '@/lib/utils/formatters';
import type { Column }     from '@/components/ui/DataTable';

export default function JobsPage() {
  const dispatch   = useAppDispatch();
  const { data: session } = useSession();
  const { items: jobs, loading } = useAppSelector((s) => s.jobs);
  const { items: customers }     = useAppSelector((s) => s.customers);
  const isSA       = session?.user?.isSuperAdmin ?? false;
  const perms      = (session?.user?.permissions ?? []) as string[];
  const canCreate  = isSA || perms.includes('job.create');
  const canEdit    = isSA || perms.includes('job.edit');
  const canDelete  = isSA || perms.includes('job.delete');

  const [modal,       setModal]       = useState(false);
  const [editing,     setEditing]     = useState<Job | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    job: Job | null;
    loading: boolean;
    checking: boolean;
    linkedTransactions: any[];
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, job: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });

  const [jobNumber,    setJobNumber]    = useState('');
  const [customerId,   setCustomerId]   = useState('');
  const [description,  setDescription]  = useState('');
  const [site,         setSite]         = useState('');
  const [status,       setStatus]       = useState<Job['status']>('ACTIVE');
  const [startDate,    setStartDate]    = useState('');

  useEffect(() => {
    dispatch(fetchJobs());
    dispatch(fetchCustomers());
  }, [dispatch]);

  const openCreate = () => {
    setEditing(null);
    setJobNumber(''); setCustomerId(''); setDescription('');
    setSite(''); setStatus('ACTIVE');
    setStartDate(new Date().toISOString().split('T')[0]);
    setModal(true);
  };

  const openEdit = (j: Job) => {
    setEditing(j);
    setJobNumber(j.jobNumber);
    setCustomerId(typeof j.customerId === 'object' ? j.customerId._id : j.customerId);
    setDescription(j.description); setSite(j.site ?? '');
    setStatus(j.status);
    setStartDate(j.startDate ? new Date(j.startDate).toISOString().split('T')[0] : '');
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    const data = {
      jobNumber, customerId, description,
      site: site || undefined, status,
      startDate: startDate || undefined,
    };
    const result = editing
      ? await dispatch(updateJob({ id: editing._id, data }))
      : await dispatch(createJob(data));
    setFormLoading(false);
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success(editing ? 'Job updated' : 'Job created');
      setModal(false);
    } else {
      toast.error((result.payload as string) ?? 'Save failed');
    }
  };

  const openDeleteModal = async (job: Job) => {
    setDeleteModal({ open: true, job, loading: false, checking: true, linkedTransactions: [], linkedCount: 0, canDelete: true });
    try {
      const res = await fetch(`/api/jobs/${job._id}/check-delete`);
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
    if (!deleteModal.job) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    const result = await dispatch(deleteJob({ id: deleteModal.job._id, hardDelete: false }));
    setDeleteModal((prev) => ({ ...prev, loading: false }));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Job marked as cancelled');
      setDeleteModal({ open: false, job: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });
    } else {
      toast.error((result.payload as string) ?? 'Failed to cancel job');
    }
  };

  const handleHardDelete = async () => {
    if (!deleteModal.job) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    const result = await dispatch(deleteJob({ id: deleteModal.job._id, hardDelete: true }));
    setDeleteModal((prev) => ({ ...prev, loading: false }));
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Job permanently deleted');
      setDeleteModal({ open: false, job: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true });
    } else {
      toast.error((result.payload as string) ?? 'Failed to delete job');
    }
  };

  const filteredJobs = statusFilter === 'ALL'
    ? jobs
    : jobs.filter((j) => j.status === statusFilter);

  const columns: Column<Job>[] = [
    {
      key: 'jobNumber', header: 'Job #', sortable: true,
      render: (j) => (
        <Link href={`/jobs/${j._id}`} className="text-emerald-400 hover:text-emerald-300 font-medium">
          {j.jobNumber}
        </Link>
      ),
    },
    {
      key: 'customerId', header: 'Customer',
      render: (j) => typeof j.customerId === 'object' ? j.customerId.name : '—',
    },
    {
      key: 'description', header: 'Description',
      render: (j) => <span className="max-w-50 truncate block">{j.description}</span>,
    },
    { key: 'site', header: 'Site', render: (j) => j.site ?? '—' },
    { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
    {
      key: 'startDate', header: 'Start Date',
      render: (j) => j.startDate ? formatDate(j.startDate) : '—',
    },
    {
      key: 'actions', header: '',
      render: (j) => (
        <div className="flex gap-2 justify-end">
          <Link href={`/jobs/${j._id}`}>
            <Button size="sm" variant="ghost">View</Button>
          </Link>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(j)}>Edit</Button>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => openDeleteModal(j)}>Delete</Button>
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
        {canCreate && <Button onClick={openCreate}>+ New Job</Button>}
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['ALL', 'ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700',
            ].join(' ')}
          >
            {s === 'ALL' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredJobs}
        loading={loading}
        emptyText="No jobs found."
        searchKeys={['jobNumber', 'description', 'site']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Job' : 'New Job'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Job Number *</label>
              <input required value={jobNumber} onChange={(e) => setJobNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="FG-2026-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Customer *</label>
              <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500">
                <option value="">Select customer...</option>
                {customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Description *</label>
              <input required value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Brief job description" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Site / Location</label>
              <input value={site} onChange={(e) => setSite(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="Delivery / work site" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
            {editing && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as Job['status'])}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500">
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>{editing ? 'Update' : 'Create Job'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.job && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setDeleteModal({ open: false, job: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl max-h-96 overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Job</h2>
            <p className="text-slate-300 text-sm mb-4">
              You are about to delete job <strong>{deleteModal.job.jobNumber}</strong>.
            </p>

            {deleteModal.checking && (
              <div className="bg-slate-700/50 rounded-lg p-4 mb-4 text-center">
                <p className="text-sm text-slate-300">Checking for linked transactions...</p>
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
                <li><span className="text-emerald-400 font-medium">Mark as Cancelled</span> — Hides job from active list but keeps transaction history intact</li>
                <li><span className="text-red-400 font-medium">Permanently Delete</span> — Removes job completely {deleteModal.linkedCount > 0 ? '(disabled - has linked data)' : '(no linked data)'}</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, job: null, loading: false, checking: false, linkedTransactions: [], linkedCount: 0, canDelete: true })}
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
                {deleteModal.loading ? 'Processing...' : 'Mark as Cancelled'}
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
