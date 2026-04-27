'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import {
  useDeleteJobMutation,
  useGetCustomersQuery,
  useGetJobsQuery,
} from '@/store/hooks';

interface Job {
  id: string;
  companyId: string;
  externalJobId?: string;
  source?: 'LOCAL' | 'EXTERNAL_API';
  jobNumber: string;
  customerId: string;
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
  name: string;
}

type JobStatusFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
type JobScopeFilter = 'ALL' | 'PARENT_ONLY' | 'VARIATION_ONLY';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function extractApiErrorMessage(error: unknown, fallback: string) {
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

function formatDate(value?: string | Date) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString();
}

function statusClasses(status: Job['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
    case 'COMPLETED':
      return 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
    case 'ON_HOLD':
      return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
    case 'CANCELLED':
      return 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
  }
}

export default function CustomerJobsPage() {
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

  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>('ALL');
  const [scopeFilter, setScopeFilter] = useState<JobScopeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
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
    void (async () => {
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

  const customerNameById = useMemo(
    () => new Map(customers.map((customer: Customer) => [customer.id, customer.name])),
    [customers]
  );

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const rootJobs = useMemo(() => jobs.filter((job) => !job.parentJobId), [jobs]);
  const variationJobs = useMemo(() => jobs.filter((job) => Boolean(job.parentJobId)), [jobs]);
  const variationsByParent = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.parentJobId) continue;
      const current = map.get(job.parentJobId) ?? [];
      current.push(job);
      map.set(job.parentJobId, current);
    }
    return map;
  }, [jobs]);
  const orderedJobRows = useMemo(() => {
    if (scopeFilter === 'PARENT_ONLY') return rootJobs;
    if (scopeFilter === 'VARIATION_ONLY') return variationJobs;
    return rootJobs.flatMap((job) => [job, ...(variationsByParent.get(job.id) ?? [])]);
  }, [rootJobs, scopeFilter, variationJobs, variationsByParent]);

  const filteredJobs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orderedJobRows.filter((job) => {
      const parentJob = job.parentJobId ? jobById.get(job.parentJobId) : null;
      if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;
      if (!query) return true;
      const customerName = customerNameById.get(job.customerId) ?? '';
      const parentNumber = parentJob?.jobNumber ?? '';
      const haystack = [job.jobNumber, parentNumber, job.description, job.site, customerName].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [customerNameById, jobById, orderedJobRows, searchQuery, statusFilter]);

  const totalVariations = useMemo(
    () => variationJobs.length,
    [variationJobs]
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'ACTIVE').length,
    [jobs]
  );
  const apiJobs = useMemo(
    () => rootJobs.filter((job) => job.source === 'EXTERNAL_API').length,
    [rootJobs]
  );

  const handleCreateJob = () => {
    router.push('/customers/jobs/form?mode=create');
  };

  const handleEditJob = (job: Job) => {
    router.push(`/customers/jobs/form?mode=edit&id=${job.id}`);
  };

  const handleCreateVariation = (job: Job) => {
    router.push(`/customers/jobs/form?mode=variation&parentJobId=${job.id}&customerId=${job.customerId}`);
  };

  const closeDeleteModal = () =>
    setDeleteModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });

  const handleDelete = async () => {
    if (!deleteModal.job) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteJob(deleteModal.job.id).unwrap();
      toast.success('Job deleted');
      closeDeleteModal();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to delete job'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleJobContextMenu = (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    const options: ContextMenuOption[] = [
      {
        label: 'Open Job Ledger',
        action: () => router.push(`/customers/jobs/${job.id}`),
      },
      ...(job.parentJobId
        ? [
            {
              label: 'Budget',
              action: () => router.push(`/stock/job-budget/${job.id}`),
            } satisfies ContextMenuOption,
          ]
        : []),
      {
        label: 'Consumption & Costing',
        action: () => router.push(`/jobs/${job.id}/consumption-costing`),
      },
    ];

    if (canEdit) {
      options.push({ divider: true });
      options.push({
        label: 'Edit Job',
        action: () => handleEditJob(job),
      });
    }

    if (!job.parentJobId) {
      options.push({ divider: true });
      options.push({
        label: 'Create Variation',
        action: () => handleCreateVariation(job),
      });
    }

    if (canDelete) {
      options.push({ divider: true });
      options.push({
        label: job.parentJobId ? 'Delete Variation' : 'Delete Job',
        danger: true,
        action: async () => {
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
      });
    }

    openContextMenu(e.clientX, e.clientY, options);
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300/80">
                Customer Jobs
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Jobs
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Track parent jobs, linked variations, and costing entry points in one compact customer queue.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push('/customers')}>
                Back to Customers
              </Button>
              {canCreate && jobSourceMode !== 'EXTERNAL_ONLY' ? (
                <Button onClick={handleCreateJob}>Add Job</Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'All jobs', value: compactNumber(jobs.length), note: `${compactNumber(rootJobs.length)} parents, ${compactNumber(totalVariations)} variations` },
            { label: 'Active rows', value: compactNumber(activeJobs), note: 'Parents and variations currently running' },
            { label: 'API parents', value: compactNumber(apiJobs), note: 'Externally synced job records' },
            { label: 'Rows shown', value: compactNumber(filteredJobs.length), note: scopeFilter === 'ALL' ? 'All matching work rows' : scopeFilter === 'PARENT_ONLY' ? 'Parent jobs only' : 'Variations only' },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-3.5 dark:bg-slate-950/80">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{item.label}</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      {jobSourceMode === 'EXTERNAL_ONLY' ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Parent job creation is disabled for this company. Parent jobs must come from the external API, while local variations can still be created from those parent jobs.
        </div>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-5">
        <div className="grid gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
              Search Jobs & Variations
            </label>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by job number, parent number, customer, site, or description..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
              Job Type
            </label>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as JobScopeFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="ALL">All jobs and variations</option>
              <option value="PARENT_ONLY">Parent only</option>
              <option value="VARIATION_ONLY">Variation only</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatusFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On hold</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
          {jobsLoading && jobs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading jobs...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No jobs match the current filter.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredJobs.map((job) => {
                const variations = variationsByParent.get(job.id) ?? [];
                const parentJob = job.parentJobId ? jobById.get(job.parentJobId) : null;
                const isVariation = Boolean(job.parentJobId);
                const customerName = customerNameById.get(job.customerId) ?? 'Unknown customer';

                return (
                  <div
                    key={job.id}
                    className={cx(
                      'grid gap-0 bg-white transition hover:bg-slate-50/80 dark:bg-slate-950/70 dark:hover:bg-slate-900/60 xl:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.2fr)_minmax(13rem,0.85fr)_8.5rem_13rem]',
                      isVariation && 'bg-sky-50/35 dark:bg-sky-950/20'
                    )}
                    onContextMenu={(e) => handleJobContextMenu(job, e)}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/customers/jobs/${job.id}`)}
                      className="px-4 py-4 text-left"
                    >
                      <div className="flex items-start gap-3">
                        <span className={cx(
                          'mt-1 h-8 w-1.5 shrink-0 rounded-full',
                          isVariation ? 'bg-sky-400 dark:bg-sky-300' : 'bg-slate-300 dark:bg-slate-600'
                        )} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 dark:text-white">{job.jobNumber}</span>
                          <span className={cx(
                            'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                            isVariation
                              ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200'
                              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                          )}>
                            {isVariation ? 'Variation' : job.source === 'EXTERNAL_API' ? 'API parent' : 'Parent'}
                          </span>
                          {parentJob ? (
                            <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-500">
                              Parent: {parentJob.jobNumber}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/customers/jobs/${job.id}`)}
                      className="px-4 py-4 text-left"
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{customerName}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                        {job.description || 'No job description added yet.'}
                      </p>
                      {parentJob ? (
                        <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                          Part of parent scope {parentJob.jobNumber}
                        </p>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(`/customers/jobs/${job.id}`)}
                      className="px-4 py-4 text-left"
                    >
                      <p className="text-sm text-slate-900 dark:text-white">{job.site || 'Site not set'}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                        {isVariation
                          ? 'Budget and dispatch should run on this variation'
                          : variations.length > 0
                          ? `${compactNumber(variations.length)} variation${variations.length === 1 ? '' : 's'} linked`
                          : 'No variations yet'}
                      </p>
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        Start {formatDate(job.startDate)}
                      </p>
                    </button>

                    <div className="px-4 py-4">
                      <span className={cx('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', statusClasses(job.status))}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="px-4 py-4 text-xs text-slate-500 dark:text-slate-500">
                      Right-click for ledger, budget, costing, variation, edit, and delete actions.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {deleteModal.open && deleteModal.job ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !deleteModal.loading && closeDeleteModal()} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300/80">
              Remove Job
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {deleteModal.job.jobNumber}
            </h2>

            {!deleteModal.canDelete ? (
              <>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  This job is linked to {deleteModal.linkedCount} transaction{deleteModal.linkedCount === 1 ? '' : 's'} and cannot be deleted yet.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="ghost" onClick={closeDeleteModal}>Close</Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Delete this job record and remove it from the customer job queue?
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="ghost" onClick={closeDeleteModal} disabled={deleteModal.loading}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleDelete} disabled={isDeleting || deleteModal.loading}>
                    {deleteModal.loading ? 'Deleting...' : 'Delete Job'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
