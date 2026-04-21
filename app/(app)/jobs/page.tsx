'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetJobsQuery,
  useGetCustomersQuery,
  useDeleteJobMutation,
} from '@/store/hooks';

interface Job {
  id: string;
  companyId: string;
  externalJobId?: string;
  source?: 'LOCAL' | 'EXTERNAL_API';
  jobNumber: string;
  customerId: string;
  customerName?: string;
  description?: string;
  site?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate?: string | Date;
  endDate?: string | Date;
  parentJobId?: string | null;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

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

export default function JobsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: jobs = [], isFetching: jobsLoading } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const [deleteJob, { isLoading: isDeleting }] = useDeleteJobMutation();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');
  const canEdit = isSA || perms.includes('job.edit');
  const canDelete = isSA || perms.includes('job.delete');

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [jobSourceMode, setJobSourceMode] = useState<'HYBRID' | 'EXTERNAL_ONLY'>('HYBRID');
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    job: Job | null;
    loading: boolean;
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          setJobSourceMode((json.data?.jobSourceMode as 'HYBRID' | 'EXTERNAL_ONLY') || 'HYBRID');
        }
      } catch {
        if (!cancelled) setJobSourceMode('HYBRID');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.activeCompanyId]);

  const handleCreateJob = () => {
    router.push('/jobs/form?mode=create');
  };

  const handleEditJob = (job: Job) => {
    router.push(`/jobs/form?mode=edit&id=${job.id}`);
  };

  const handleCreateVariation = (job: Job) => {
    router.push(`/jobs/form?mode=variation&parentJobId=${job.id}&customerId=${job.customerId}`);
  };

  const handleDelete = async () => {
    if (!deleteModal.job) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteJob(deleteModal.job.id).unwrap();
      toast.success('Job deleted');
      setDeleteModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete job');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
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

    // Edit option
    if (canEdit) {
      options.push({ divider: true });
      options.push({
        label: 'Edit',
        action: () => handleEditJob(job),
      });
    }

    // Create variation option (only for parent jobs)
    if (!job.parentJobId) {
      options.push({ divider: true });
      options.push({
        label: '+ Create Variation',
        action: () => handleCreateVariation(job),
      });
    }

    // Delete option
    if (canDelete) {
      options.push({ divider: true });
      options.push({
        label: job.parentJobId ? 'Delete Variation' : 'Delete',
        action: async () => {
          // Check if job has linked transactions
          try {
            const res = await fetch(`/api/jobs/${job.id}/check-delete`);
            const data = await res.json();
            if (data.data) {
              setDeleteModal({
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

  const filteredJobs =
    statusFilter === 'ALL' ? jobs : jobs.filter((j) => j.status === statusFilter);

  const columns: Column<Job>[] = [
    {
      key: 'jobNumber',
      header: 'Job Number',
      sortable: true,
      render: (j) => (
        <div
          onContextMenu={(e) => handleJobContextMenu(j, e)}
          className="cursor-context-menu hover:text-emerald-400 transition-colors"
        >
          <span>{j.jobNumber}</span>
          {j.source === 'EXTERNAL_API' && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">
              API
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'externalJobId',
      header: 'External ID',
      render: (j) => (
        <div onContextMenu={(e) => handleJobContextMenu(j, e)} className="cursor-context-menu text-xs text-slate-300">
          {j.externalJobId || '—'}
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      render: (j) => (
        <div
          onContextMenu={(e) => handleJobContextMenu(j, e)}
          className="cursor-context-menu"
        >
          {customers.find((c) => c.id === j.customerId)?.name ?? '—'}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (j) => (
        <div
          onContextMenu={(e) => handleJobContextMenu(j, e)}
          className="cursor-context-menu"
        >
          {j.description || '—'}
        </div>
      ),
    },
    {
      key: 'site',
      header: 'Site',
      render: (j) => (
        <div
          onContextMenu={(e) => handleJobContextMenu(j, e)}
          className="cursor-context-menu"
        >
          {j.site || '—'}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => (
        <div
          onContextMenu={(e) => handleJobContextMenu(j, e)}
          className="cursor-context-menu"
        >
          <StatusBadge status={j.status} />
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
          {canCreate && jobSourceMode !== 'EXTERNAL_ONLY' && <Button onClick={handleCreateJob}>+ Add Job</Button>}
        </div>
      </div>
      {jobSourceMode === 'EXTERNAL_ONLY' && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-3 text-sm text-amber-200">
          Parent job creation is disabled for this company. Sync parent jobs via API. You can still create local variations from parent jobs.
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredJobs}
        loading={jobsLoading && jobs.length === 0}
        emptyText="No jobs found."
        searchKeys={['jobNumber', 'description']}
      />


      {deleteModal.open && deleteModal.job && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => !deleteModal.loading && setDeleteModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Job</h2>
            {!deleteModal.canDelete ? (
              <>
                <p className="text-slate-300 text-sm mb-4">
                  Cannot delete <strong>{deleteModal.job.jobNumber}</strong>
                </p>
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 mb-6">
                  <p className="text-sm text-red-400">
                    ⚠️ This job has {deleteModal.linkedCount} linked transaction{deleteModal.linkedCount !== 1 ? 's' : ''}. Remove or reassign them first.
                  </p>
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setDeleteModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-slate-300 text-sm mb-6">
                  Delete <strong>{deleteModal.job.jobNumber}</strong>?
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setDeleteModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
                    disabled={deleteModal.loading}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteModal.loading}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium disabled:opacity-50"
                  >
                    {deleteModal.loading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
