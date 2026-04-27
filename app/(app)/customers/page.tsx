'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  useGetCustomersQuery,
  useGetJobsQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useDeleteJobMutation,
  useSyncCustomersFromPartyApiMutation,
  type Customer,
} from '@/store/hooks';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { Job } from '@/store/api/endpoints/jobs';
import {
  customerPartyFormToApiBody,
  customerToPartyFormState,
  emptyCustomerPartyFormState,
  type CustomerPartyFormState,
  type PartyContactRow,
} from '@/lib/partyFormUi';

type CustomerFilter = 'all' | 'active' | 'inactive';
type CustomerFormMode = 'create' | 'edit';

const FILTER_OPTIONS: Array<{ value: CustomerFilter; label: string }> = [
  { value: 'all', label: 'All customers' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function matchesText(value: string | null | undefined, query: string) {
  return (value ?? '').toLowerCase().includes(query);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return 'Not set';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString();
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function customerStatusClasses(isActive: boolean) {
  return isActive
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
}

function jobStatusClasses(status: Job['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'COMPLETED':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    case 'ON_HOLD':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'CANCELLED':
      return 'border-red-500/30 bg-red-500/10 text-red-400';
    default:
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  }
}

function prettyJobStatus(status: Job['status']) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 shadow-sm"
      style={{
        backgroundColor: 'var(--surface-panel-soft)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
        {value}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--foreground-muted)' }}>
        {hint}
      </p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
        {label}
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--foreground)' }}>
        {value}
      </p>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm" style={{ color: 'var(--foreground-soft)' }}>
      <span className="block text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function CustomerReadOnlyDetails({ customer }: { customer: Customer }) {
  const contacts = Array.isArray(customer.contactsJson)
    ? (customer.contactsJson as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cx(
            'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
            customerStatusClasses(customer.isActive),
          )}
        >
          {customer.isActive ? 'Active' : 'Inactive'}
        </span>
        {customer.source === 'PARTY_API_SYNC' ? (
          <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-300">
            Synced from party API
          </span>
        ) : null}
      </div>

      <div
        className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2"
        style={{
          backgroundColor: 'var(--surface-subtle)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <InfoField label="Email" value={customer.email || 'Not set'} />
        <InfoField label="Address" value={customer.address || 'Not set'} />
        <InfoField label="Trade license number" value={customer.tradeLicenseNumber || 'Not set'} />
        <InfoField label="Trade license authority" value={customer.tradeLicenseAuthority || 'Not set'} />
        <InfoField label="Trade license expiry" value={formatDate(customer.tradeLicenseExpiry)} />
        <InfoField label="TRN number" value={customer.trnNumber || 'Not set'} />
        <InfoField label="TRN expiry" value={formatDate(customer.trnExpiry)} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Contact rows
          </h3>
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          </p>
        </div>

        {contacts.length === 0 ? (
          <div
            className="rounded-2xl border p-4 text-sm"
            style={{
              backgroundColor: 'var(--surface-subtle)',
              borderColor: 'var(--border-strong)',
              color: 'var(--foreground-muted)',
            }}
          >
            No structured contacts saved for this customer.
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((row, index) => (
              <div
                key={index}
                className="rounded-2xl border p-4"
                style={{
                  backgroundColor: 'var(--surface-subtle)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium" style={{ color: 'var(--foreground)' }}>
                    {String(row.contact_name ?? '').trim() || 'Unnamed contact'}
                  </p>
                  <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    Sort order {String(row.sort_order ?? index)}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <InfoField label="Email" value={String(row.email ?? '').trim() || 'Not set'} />
                  <InfoField label="Phone" value={String(row.phone ?? '').trim() || 'Not set'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: customers = [], isFetching: isFetchingCustomers } = useGetCustomersQuery();
  const { data: jobs = [], isFetching: isFetchingJobs } = useGetJobsQuery();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation();
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation();
  const [deleteCustomer, { isLoading: isDeleting }] = useDeleteCustomerMutation();
  const [deleteJob, { isLoading: isDeletingJob }] = useDeleteJobMutation();
  const [syncPartyCustomers, { isLoading: isSyncingParty }] = useSyncCustomersFromPartyApiMutation();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('customer.create');
  const canEdit = isSA || perms.includes('customer.edit');
  const canDelete = isSA || perms.includes('customer.delete');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<CustomerFilter>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<CustomerFormMode>('create');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
  const [expandedMainJobs, setExpandedMainJobs] = useState<Set<string>>(new Set());
  const [partyForm, setPartyForm] = useState<CustomerPartyFormState>(emptyCustomerPartyFormState());
  const [partyStatus, setPartyStatus] = useState(true);
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

  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

  const rootJobs = useMemo(() => jobs.filter((job) => !job.parentJobId), [jobs]);

  const jobsByCustomer = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      const current = map.get(job.customerId) ?? [];
      current.push(job);
      map.set(job.customerId, current);
    }
    return map;
  }, [jobs]);

  const childJobsByParent = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.parentJobId) continue;
      const current = map.get(job.parentJobId) ?? [];
      current.push(job);
      map.set(job.parentJobId, current);
    }
    return map;
  }, [jobs]);

  const customerStatsById = useMemo(() => {
    const stats = new Map<
      string,
      { totalJobs: number; activeJobs: number; variations: number; matchedJobs: number }
    >();

    for (const customer of customers) {
      const related = jobsByCustomer.get(customer.id) ?? [];
      stats.set(customer.id, {
        totalJobs: related.filter((job) => !job.parentJobId).length,
        activeJobs: related.filter((job) => !job.parentJobId && job.status === 'ACTIVE').length,
        variations: related.filter((job) => Boolean(job.parentJobId)).length,
        matchedJobs: 0,
      });
    }

    if (!deferredSearch) return stats;

    for (const customer of customers) {
      const related = jobsByCustomer.get(customer.id) ?? [];
      const matchedJobs = related.filter((job) => {
        return (
          matchesText(job.jobNumber, deferredSearch) ||
          matchesText(job.description, deferredSearch) ||
          matchesText(job.site, deferredSearch) ||
          matchesText(job.projectName, deferredSearch)
        );
      }).length;

      const entry = stats.get(customer.id);
      if (entry) entry.matchedJobs = matchedJobs;
    }

    return stats;
  }, [customers, deferredSearch, jobsByCustomer]);

  const filteredCustomers = useMemo(() => {
    return customers
      .filter((customer) => {
        if (filterActive === 'active' && !customer.isActive) return false;
        if (filterActive === 'inactive' && customer.isActive) return false;

        if (!deferredSearch) return true;

        const relatedJobs = jobsByCustomer.get(customer.id) ?? [];
        const matchesCustomer =
          matchesText(customer.name, deferredSearch) ||
          matchesText(customer.contactPerson, deferredSearch) ||
          matchesText(customer.phone, deferredSearch) ||
          matchesText(customer.email, deferredSearch) ||
          matchesText(customer.address, deferredSearch);

        const matchesJob = relatedJobs.some((job) => {
          return (
            matchesText(job.jobNumber, deferredSearch) ||
            matchesText(job.description, deferredSearch) ||
            matchesText(job.site, deferredSearch) ||
            matchesText(job.projectName, deferredSearch)
          );
        });

        return matchesCustomer || matchesJob;
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [customers, deferredSearch, filterActive, jobsByCustomer]);

  const effectiveSelectedCustomerId = useMemo(() => {
    if (filteredCustomers.length === 0) return null;
    if (selectedCustomerId && filteredCustomers.some((customer) => customer.id === selectedCustomerId)) {
      return selectedCustomerId;
    }
    return filteredCustomers[0]?.id ?? null;
  }, [filteredCustomers, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () =>
      effectiveSelectedCustomerId
        ? customers.find((customer) => customer.id === effectiveSelectedCustomerId) ?? null
        : null,
    [customers, effectiveSelectedCustomerId],
  );

  const detailsCustomer = useMemo(
    () => (detailsCustomerId ? customers.find((customer) => customer.id === detailsCustomerId) ?? null : null),
    [customers, detailsCustomerId],
  );

  const selectedCustomerMainJobs = useMemo(() => {
    if (!selectedCustomer) return [];

    return (jobsByCustomer.get(selectedCustomer.id) ?? [])
      .filter((job) => !job.parentJobId)
      .slice()
      .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
  }, [jobsByCustomer, selectedCustomer]);

  const selectedCustomerJobCount = useMemo(() => {
    if (!selectedCustomer) return 0;
    return (jobsByCustomer.get(selectedCustomer.id) ?? []).length;
  }, [jobsByCustomer, selectedCustomer]);

  const totals = useMemo(() => {
    const activeCustomers = customers.filter((customer) => customer.isActive).length;
    const inactiveCustomers = customers.length - activeCustomers;
    const activeJobs = rootJobs.filter((job) => job.status === 'ACTIVE').length;
    const syncedCustomers = customers.filter((customer) => customer.source === 'PARTY_API_SYNC').length;

    return {
      totalCustomers: customers.length,
      activeCustomers,
      inactiveCustomers,
      activeJobs,
      syncedCustomers,
    };
  }, [customers, rootJobs]);

  const directoryLoading = isFetchingCustomers || isFetchingJobs;
  const saveLoading = isCreating || isUpdating;

  const openCreate = () => {
    setFormMode('create');
    setEditing(null);
    setPartyForm(emptyCustomerPartyFormState());
    setPartyStatus(true);
    setModalOpen(true);
  };

  const handleEditClick = (customer: Customer) => {
    setFormMode('edit');
    setEditing(customer);
    setPartyForm(customerToPartyFormState(customer));
    setPartyStatus(customer.isActive);
    setModalOpen(true);
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
      contacts: prev.contacts.filter((_, i) => i !== index).map((row, i) => ({ ...row, sort_order: i })),
    }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = customerPartyFormToApiBody(partyForm);

    try {
      if (editing) {
        await updateCustomer({ id: editing.id, data: { ...data, isActive: partyStatus } }).unwrap();
        toast.success('Customer updated');
      } else {
        const created = await createCustomer(data).unwrap();
        setSelectedCustomerId(created.id);
        toast.success('Customer created');
      }
      setModalOpen(false);
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Failed to save customer'));
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.customer) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));

    try {
      const result = await deleteCustomer(deleteModal.customer.id).unwrap();
      toast.success(result.message ?? (result.permanent ? 'Customer deleted' : 'Customer marked inactive'));
      if (selectedCustomerId === deleteModal.customer.id) setSelectedCustomerId(null);
      if (detailsCustomerId === deleteModal.customer.id) setDetailsCustomerId(null);
      setDeleteModal({ open: false, customer: null, loading: false });
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete customer'));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSyncPartyCustomers = async () => {
    try {
      const result = await syncPartyCustomers().unwrap();
      toast.success(`Synced ${result.created} new and ${result.updated} updated customers`);
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Failed to sync party list customers'));
    }
  };

  const openCustomerDetails = (customerId: string) => {
    setDetailsCustomerId(customerId);
  };

  const toggleMainJob = (jobId: string) => {
    setExpandedMainJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const openCustomerContextMenu = (customer: Customer, event: React.MouseEvent) => {
    event.preventDefault();

    const options = [
      {
        label: 'Open details',
        action: () => openCustomerDetails(customer.id),
      },
      canEdit
        ? {
            label: 'Edit customer',
            action: () => handleEditClick(customer),
          }
        : null,
      canCreate
        ? {
            label: 'Create job',
        action: () => router.push(`/customers/jobs/form?mode=create&customerId=${customer.id}`),
          }
        : null,
      canDelete
        ? {
            label:
              customer.source === 'PARTY_API_SYNC'
                ? 'Deletion disabled for synced customer'
                : 'Delete customer',
            action: () => {
              if (customer.source === 'PARTY_API_SYNC') {
                toast.error('Synced customers cannot be deleted here. Use Edit to mark them inactive if needed.');
                return;
              }
              setDeleteModal({ open: true, customer, loading: false });
            },
            danger: customer.source !== 'PARTY_API_SYNC',
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; action: () => void; danger?: boolean }>;

    openContextMenu(
      event.clientX,
      event.clientY,
      options.flatMap((option, index) => {
        const item: Array<{ label?: string; action?: () => void; danger?: boolean; divider?: boolean }> = [option];
        if (index < options.length - 1) item.push({ divider: true });
        return item;
      }),
    );
  };

  const openJobContextMenu = (job: Job, event: React.MouseEvent) => {
    event.preventDefault();

    const options = [
      {
        label: 'Open job ledger',
        action: () => router.push(`/customers/jobs/${job.id}`),
      },
      canEdit
        ? {
            label: 'Edit job',
        action: () => router.push(`/customers/jobs/form?mode=edit&id=${job.id}`),
          }
        : null,
      {
        label: 'Open costing view',
        action: () => router.push(`/jobs/${job.id}/consumption-costing`),
      },
      canCreate && !job.parentJobId
        ? {
            label: 'Create variation',
            action: () =>
                  router.push(`/customers/jobs/form?mode=variation&parentJobId=${job.id}&customerId=${job.customerId}`),
          }
        : null,
      canDelete
        ? {
            label: 'Delete job',
            action: async () => {
              try {
                const response = await fetch(`/api/jobs/${job.id}/check-delete`);
                const json = await response.json();
                if (json.data) {
                  setDeleteJobModal({
                    open: true,
                    job,
                    loading: false,
                    linkedCount: json.data.linkedTransactionsCount ?? 0,
                    canDelete: json.data.canDelete ?? false,
                  });
                }
              } catch {
                toast.error('Failed to check job dependencies');
              }
            },
            danger: true,
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; action: () => void; danger?: boolean }>;

    openContextMenu(
      event.clientX,
      event.clientY,
      options.flatMap((option, index) => {
        const item: Array<{ label?: string; action?: () => void; danger?: boolean; divider?: boolean }> = [option];
        if (index < options.length - 1) item.push({ divider: true });
        return item;
      }),
    );
  };

  const handleDeleteJob = async () => {
    if (!deleteJobModal.job) return;
    setDeleteJobModal((prev) => ({ ...prev, loading: true }));

    try {
      await deleteJob(deleteJobModal.job.id).unwrap();
      toast.success('Job deleted');
      setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete job'));
      setDeleteJobModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-6">
      <section
        className="rounded-3xl border p-6 shadow-sm"
        style={{
          backgroundColor: 'var(--surface-panel-soft)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Master data</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Customer directory
            </h1>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--foreground-muted)' }}>
              Manage customer records, review job activity, and keep local and synced party master data in one operational workspace.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[34rem] xl:grid-cols-4">
            <SummaryCard label="Customers" value={compactNumber(totals.totalCustomers)} hint="Records in this company" />
            <SummaryCard label="Active" value={compactNumber(totals.activeCustomers)} hint="Ready for ongoing work" />
            <SummaryCard label="Inactive" value={compactNumber(totals.inactiveCustomers)} hint="Hidden from new activity" />
            <SummaryCard label="Active Jobs" value={compactNumber(totals.activeJobs)} hint="Across all customers" />
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border p-5 shadow-sm"
        style={{
          backgroundColor: 'var(--surface-panel-soft)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1.5fr)_14rem]">
            <FormField label="Search">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by customer, contact, job number, site, or project"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="Status view">
              <select
                value={filterActive}
                onChange={(event) => setFilterActive(event.target.value as CustomerFilter)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              >
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
                Synced records
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--foreground-soft)' }}>
                {compactNumber(totals.syncedCustomers)} customer{totals.syncedCustomers === 1 ? '' : 's'} from party API
              </p>
            </div>
            {canEdit ? (
              <Button type="button" variant="outline" onClick={handleSyncPartyCustomers} loading={isSyncingParty}>
                Sync customers
              </Button>
            ) : null}
            {canCreate ? (
              <Button type="button" onClick={openCreate}>
                Add customer
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section
          className="overflow-hidden rounded-2xl border shadow-sm"
          style={{
            backgroundColor: 'var(--surface-panel-soft)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-strong)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              Customer list
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Select a customer to review details and jobs. Double-click for the full record.
            </p>
          </div>

          {directoryLoading ? (
            <div className="space-y-3 px-5 py-5">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                No customers found
              </h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                Adjust the search or status view, or create a new customer record.
              </p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto p-3">
              <div className="space-y-2">
                {filteredCustomers.map((customer) => {
                  const stats = customerStatsById.get(customer.id) ?? {
                    totalJobs: 0,
                    activeJobs: 0,
                    variations: 0,
                    matchedJobs: 0,
                  };
                  const selected = customer.id === effectiveSelectedCustomerId;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      onDoubleClick={() => openCustomerDetails(customer.id)}
                      onContextMenu={(event) => openCustomerContextMenu(customer, event)}
                      className={cx(
                        'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                        selected ? 'border-emerald-500/35 bg-emerald-500/10' : 'hover:bg-white/5',
                      )}
                      style={{
                        borderColor: selected ? undefined : 'var(--border-strong)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold" style={{ color: 'var(--foreground)' }}>
                            {customer.name}
                          </p>
                          <p className="mt-1 truncate text-xs" style={{ color: 'var(--foreground-muted)' }}>
                            {customer.contactPerson || customer.email || customer.phone || 'No primary contact saved'}
                          </p>
                        </div>
                        <span
                          className={cx(
                            'inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
                            customerStatusClasses(customer.isActive),
                          )}
                        >
                          {customer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                        <span>{stats.totalJobs} main job{stats.totalJobs === 1 ? '' : 's'}</span>
                        <span>{stats.variations} variation{stats.variations === 1 ? '' : 's'}</span>
                        <span>{stats.activeJobs} active</span>
                        {customer.source === 'PARTY_API_SYNC' ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-300">
                            Synced
                          </span>
                        ) : null}
                        {deferredSearch && stats.matchedJobs > 0 ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                            {stats.matchedJobs} job match{stats.matchedJobs === 1 ? '' : 'es'}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-6">
          {!selectedCustomer ? (
            <div
              className="rounded-2xl border px-6 py-14 text-center shadow-sm"
              style={{
                backgroundColor: 'var(--surface-panel-soft)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
                Select a customer
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                Choose a customer from the left to review contacts, compliance details, and linked jobs.
              </p>
            </div>
          ) : (
            <>
              <section
                className="rounded-2xl border p-6 shadow-sm"
                style={{
                  backgroundColor: 'var(--surface-panel-soft)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
                          customerStatusClasses(selectedCustomer.isActive),
                        )}
                      >
                        {selectedCustomer.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {selectedCustomer.source === 'PARTY_API_SYNC' ? (
                        <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-300">
                          Synced
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 truncate text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
                      {selectedCustomer.name}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                      <span>{compactNumber(customerStatsById.get(selectedCustomer.id)?.totalJobs ?? 0)} main jobs</span>
                      <span>{compactNumber(customerStatsById.get(selectedCustomer.id)?.variations ?? 0)} variations</span>
                      <span>{selectedCustomer.contactPerson || selectedCustomer.email || selectedCustomer.phone || 'No primary contact saved'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                    <Button type="button" variant="outline" onClick={() => openCustomerDetails(selectedCustomer.id)}>
                      View details
                    </Button>
                    {canEdit ? (
                      <Button type="button" variant="secondary" onClick={() => handleEditClick(selectedCustomer)}>
                        Edit
                      </Button>
                    ) : null}
                    {canCreate ? (
                      <Button
                        type="button"
                  onClick={() => router.push(`/customers/jobs/form?mode=create&customerId=${selectedCustomer.id}`)}
                      >
                        Create job
                      </Button>
                    ) : null}
                  </div>
                </div>
              </section>

              <section
                className="overflow-hidden rounded-2xl border shadow-sm"
                style={{
                  backgroundColor: 'var(--surface-panel-soft)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div
                  className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between"
                  style={{ borderColor: 'var(--border-strong)' }}
                >
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                      Jobs workspace
                    </h3>
                    <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                      Double-click a row to open costing. Right-click a row for edit, variation, or delete actions.
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--foreground-soft)' }}>
                    {selectedCustomerJobCount} job row{selectedCustomerJobCount === 1 ? '' : 's'} linked to this customer
                  </p>
                </div>

                {selectedCustomerMainJobs.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <h4 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                      No jobs linked yet
                    </h4>
                    <p className="mt-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                      Create the first job for this customer to start dispatch, costing, and site activity tracking.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    {selectedCustomerMainJobs.map((job) => {
                      const variations = childJobsByParent.get(job.id) ?? [];
                      const expanded = expandedMainJobs.has(job.id);

                      return (
                        <div
                          key={job.id}
                          className="overflow-hidden rounded-2xl border"
                          style={{
                            backgroundColor: 'var(--surface-subtle)',
                            borderColor: 'var(--border-strong)',
                          }}
                        >
                          <div
                            className="flex cursor-pointer items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/5"
                            onClick={() => {
                              if (variations.length > 0) toggleMainJob(job.id);
                            }}
                            onDoubleClick={() => router.push(`/customers/jobs/${job.id}`)}
                            onContextMenu={(event) => openJobContextMenu(job, event)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3">
                                {variations.length > 0 ? (
                                  <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs"
                                    style={{ borderColor: 'var(--border-strong)', color: 'var(--foreground-soft)' }}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleMainJob(job.id);
                                    }}
                                  >
                                    <svg
                                      className={cx('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-90' : '')}
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                      aria-hidden="true"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </button>
                                ) : (
                                  <span className="inline-block h-6 w-6" />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-medium" style={{ color: 'var(--foreground)' }}>
                                    {job.jobNumber}
                                  </p>
                                  <p className="mt-1 truncate text-sm" style={{ color: 'var(--foreground-muted)' }}>
                                    {job.site || job.description || 'No site or description added'}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              {variations.length > 0 ? (
                                <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                  {variations.length} variation{variations.length === 1 ? '' : 's'}
                                </span>
                              ) : null}
                              <span
                                className={cx(
                                  'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
                                  jobStatusClasses(job.status),
                                )}
                              >
                                {prettyJobStatus(job.status)}
                              </span>
                            </div>
                          </div>

                          {expanded && variations.length > 0 ? (
                            <div className="border-t px-5 py-3" style={{ borderColor: 'var(--border-strong)' }}>
                              <div className="space-y-2">
                                {variations
                                  .slice()
                                  .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber))
                                  .map((variation) => (
                                    <div
                                      key={variation.id}
                                      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border px-4 py-3 transition-colors hover:bg-white/5"
                                      style={{
                                        backgroundColor: 'var(--surface-panel-soft)',
                                        borderColor: 'var(--border-strong)',
                                      }}
                                      onDoubleClick={() => router.push(`/customers/jobs/${variation.id}`)}
                                      onContextMenu={(event) => openJobContextMenu(variation, event)}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                                          {variation.jobNumber}
                                        </p>
                                        <p className="mt-1 truncate text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                          {variation.site || variation.description || 'No site or description added'}
                                        </p>
                                      </div>
                                      <span
                                        className={cx(
                                          'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
                                          jobStatusClasses(variation.status),
                                        )}
                                      >
                                        {prettyJobStatus(variation.status)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>

      <Modal
        isOpen={Boolean(detailsCustomer)}
        onClose={() => setDetailsCustomerId(null)}
        title={detailsCustomer?.name ?? 'Customer details'}
        size="lg"
        actions={
          detailsCustomer && canEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                handleEditClick(detailsCustomer);
                setDetailsCustomerId(null);
              }}
            >
              Edit customer
            </Button>
          ) : undefined
        }
      >
        {detailsCustomer ? <CustomerReadOnlyDetails customer={detailsCustomer} /> : null}
      </Modal>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={formMode === 'edit' ? 'Edit customer' : 'Create customer'}
        size="lg"
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} size="sm">
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={saveLoading} size="sm">
              {formMode === 'edit' ? 'Save changes' : 'Create customer'}
            </Button>
          </div>
        }
      >
        <form id="customer-form" onSubmit={handleSave} className="max-h-[75vh] space-y-6 overflow-y-auto pr-1">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              Core record
            </h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Keep customer data aligned with the party lists structure so local and synced records stay consistent.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Customer name">
              <input
                required
                value={partyForm.name}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={partyForm.email}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="Trade license number">
              <input
                value={partyForm.trade_license_number}
                onChange={(event) =>
                  setPartyForm((prev) => ({ ...prev, trade_license_number: event.target.value }))
                }
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="Trade license authority">
              <input
                value={partyForm.trade_license_authority}
                onChange={(event) =>
                  setPartyForm((prev) => ({ ...prev, trade_license_authority: event.target.value }))
                }
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="Trade license expiry">
              <input
                type="date"
                value={partyForm.trade_license_expiry}
                onChange={(event) =>
                  setPartyForm((prev) => ({ ...prev, trade_license_expiry: event.target.value }))
                }
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="TRN number">
              <input
                value={partyForm.trn_number}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, trn_number: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            <FormField label="TRN expiry">
              <input
                type="date"
                value={partyForm.trn_expiry}
                onChange={(event) => setPartyForm((prev) => ({ ...prev, trn_expiry: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </FormField>
            {formMode === 'edit' ? (
              <FormField label="Record status">
                <select
                  value={partyStatus ? 'active' : 'inactive'}
                  onChange={(event) => setPartyStatus(event.target.value === 'active')}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                  style={{
                    backgroundColor: 'var(--input-background)',
                    color: 'var(--input-foreground)',
                    borderColor: 'var(--input-border)',
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </FormField>
            ) : null}
          </div>

          <FormField label="Address">
            <textarea
              rows={3}
              value={partyForm.address}
              onChange={(event) => setPartyForm((prev) => ({ ...prev, address: event.target.value }))}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
              style={{
                backgroundColor: 'var(--input-background)',
                color: 'var(--input-foreground)',
                borderColor: 'var(--input-border)',
              }}
            />
          </FormField>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  Contact rows
                </h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                  The first populated row becomes the legacy primary contact and phone value.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addContactRow}>
                Add contact
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {partyForm.contacts.map((row, index) => (
                <div
                  key={index}
                  className="rounded-2xl border p-4"
                  style={{
                    backgroundColor: 'var(--surface-subtle)',
                    borderColor: 'var(--border-strong)',
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
                      Contact {index + 1}
                    </p>
                    {partyForm.contacts.length > 1 ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeContactRow(index)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <FormField label="Contact name">
                      <input
                        value={row.contact_name}
                        onChange={(event) => updateContactRow(index, { contact_name: event.target.value })}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                        style={{
                          backgroundColor: 'var(--input-background)',
                          color: 'var(--input-foreground)',
                          borderColor: 'var(--input-border)',
                        }}
                      />
                    </FormField>
                    <FormField label="Email">
                      <input
                        type="email"
                        value={row.email}
                        onChange={(event) => updateContactRow(index, { email: event.target.value })}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                        style={{
                          backgroundColor: 'var(--input-background)',
                          color: 'var(--input-foreground)',
                          borderColor: 'var(--input-border)',
                        }}
                      />
                    </FormField>
                    <FormField label="Phone">
                      <input
                        value={row.phone}
                        onChange={(event) => updateContactRow(index, { phone: event.target.value })}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                        style={{
                          backgroundColor: 'var(--input-background)',
                          color: 'var(--input-foreground)',
                          borderColor: 'var(--input-border)',
                        }}
                      />
                    </FormField>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {deleteModal.open && deleteModal.customer ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setDeleteModal({ open: false, customer: null, loading: false })} />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl"
            style={{
              backgroundColor: 'var(--surface-panel)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              Delete customer
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--foreground-soft)' }}>
              Remove <strong>{deleteModal.customer.name}</strong>? If this customer already has jobs, the record will stay in the system and only be marked inactive.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setDeleteModal({ open: false, customer: null, loading: false })}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={handleDelete} loading={deleteModal.loading || isDeleting}>
                Delete customer
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {deleteJobModal.open && deleteJobModal.job ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() =>
              setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })
            }
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl"
            style={{
              backgroundColor: 'var(--surface-panel)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              Delete {deleteJobModal.job.parentJobId ? 'variation' : 'job'}
            </h2>

            {deleteJobModal.canDelete ? (
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--foreground-soft)' }}>
                Delete <strong>{deleteJobModal.job.jobNumber}</strong>? This action removes the selected record permanently.
              </p>
            ) : (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                This job cannot be deleted because {deleteJobModal.linkedCount} transaction{deleteJobModal.linkedCount === 1 ? '' : 's'} already reference it.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })
                }
              >
                {deleteJobModal.canDelete ? 'Cancel' : 'Close'}
              </Button>
              {deleteJobModal.canDelete ? (
                <Button type="button" variant="danger" onClick={handleDeleteJob} loading={deleteJobModal.loading || isDeletingJob}>
                  Delete job
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
