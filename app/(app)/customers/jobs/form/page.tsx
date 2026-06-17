'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown';
import SearchSelect from '@/components/ui/SearchSelect';
import { emptyJobContactRow, jobContactsToRows, primaryJobContactPersonFromRows, rowsToJobContactsPayload, type JobContactRow } from '@/lib/jobContactFormUi';
import { WORKFORCE_EXPERTISE_OPTIONS } from '@/lib/hr/workforceProfile';
import { useCreateJobMutation, useGetCustomersQuery, useGetJobsQuery, useUpdateJobMutation } from '@/store/hooks';
import type { Job } from '@/store/api/endpoints/jobs';

type FormMode = 'create' | 'edit' | 'variation';

type JobRecord = Job & {
  address?: string | null;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  quotationNumber?: string | null;
  quotationDate?: string | Date | null;
  lpoNumber?: string | null;
  lpoDate?: string | Date | null;
  lpoValue?: number | null;
  projectName?: string | null;
  projectDetails?: string | null;
  contactPerson?: string | null;
  contactsJson?: unknown;
  salesPerson?: string | null;
  requiredExpertises?: unknown;
  jobWorkValue?: number | string | null;
};

type Customer = {
  id: string;
  name: string;
};

type JobFormState = {
  jobNumber: string;
  variationSuffix: string;
  customerId: string;
  description: string;
  site: string;
  address: string;
  locationName: string;
  locationLat: string;
  locationLng: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate: string;
  endDate: string;
  quotationNumber: string;
  quotationDate: string;
  lpoNumber: string;
  lpoDate: string;
  lpoValue: string;
  projectName: string;
  projectDetails: string;
  salesPerson: string;
  jobWorkValue: string;
};

const INPUT_CLASS =
  'mt-1.5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function emptyForm(): JobFormState {
  return {
    jobNumber: '',
    variationSuffix: '',
    customerId: '',
    description: '',
    site: '',
    address: '',
    locationName: '',
    locationLat: '',
    locationLng: '',
    status: 'ACTIVE',
    startDate: '',
    endDate: '',
    quotationNumber: '',
    quotationDate: '',
    lpoNumber: '',
    lpoDate: '',
    lpoValue: '',
    projectName: '',
    projectDetails: '',
    salesPerson: '',
    jobWorkValue: '',
  };
}

function dateInputValue(value?: string | Date | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
}

function parseNumberInput(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  return fallback;
}

function getMode(value: string | null): FormMode {
  return value === 'edit' || value === 'variation' ? value : 'create';
}

function buildFormFromJob(job: JobRecord): JobFormState {
  return {
    jobNumber: job.jobNumber,
    variationSuffix: '',
    customerId: job.customerId,
    description: job.description ?? '',
    site: job.site ?? '',
    address: job.address ?? '',
    locationName: job.locationName ?? '',
    locationLat: job.locationLat?.toString() ?? '',
    locationLng: job.locationLng?.toString() ?? '',
    status: job.status,
    startDate: dateInputValue(job.startDate),
    endDate: dateInputValue(job.endDate),
    quotationNumber: job.quotationNumber ?? '',
    quotationDate: dateInputValue(job.quotationDate),
    lpoNumber: job.lpoNumber ?? '',
    lpoDate: dateInputValue(job.lpoDate),
    lpoValue: job.lpoValue?.toString() ?? '',
    projectName: job.projectName ?? '',
    projectDetails: job.projectDetails ?? '',
    salesPerson: job.salesPerson ?? '',
    jobWorkValue: job.jobWorkValue?.toString() ?? '',
  };
}

function extractVariationSuffix(parentJobNumber: string, variationJobNumber: string) {
  const prefix = `${parentJobNumber}-`;
  return variationJobNumber.startsWith(prefix) ? variationJobNumber.slice(prefix.length).trim() : '';
}

function getNextNumericVariationSuffix(parentJob: JobRecord | null, jobs: JobRecord[]) {
  if (!parentJob) return '';
  const nextNumber =
    jobs.reduce((highest, job) => {
      if (job.parentJobId !== parentJob.id) return highest;
      const suffix = extractVariationSuffix(parentJob.jobNumber, job.jobNumber);
      if (!/^\d+$/.test(suffix)) return highest;
      return Math.max(highest, Number(suffix));
    }, 0) + 1;
  return String(nextNumber);
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function CustomerJobFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { data: jobs = [], isFetching: jobsLoading } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const [createJob, { isLoading: isCreating }] = useCreateJobMutation();
  const [updateJob, { isLoading: isUpdating }] = useUpdateJobMutation();

  const mode = getMode(searchParams.get('mode'));
  const jobId = searchParams.get('id');
  const parentJobId = searchParams.get('parentJobId');
  const initialCustomerId = searchParams.get('customerId');
  const currentJob = useMemo(() => (jobId ? (jobs as JobRecord[]).find((job) => job.id === jobId) ?? null : null), [jobId, jobs]);
  const parentJob = useMemo(() => (parentJobId ? (jobs as JobRecord[]).find((job) => job.id === parentJobId) ?? null : null), [parentJobId, jobs]);
  const customerNameById = useMemo(() => new Map((customers as Customer[]).map((customer) => [customer.id, customer.name])), [customers]);
  const customerSearchItems = useMemo(
    () => (customers as Customer[]).map((customer) => ({ id: customer.id, label: customer.name })),
    [customers],
  );
  const nextVariationSuffix = useMemo(
    () => getNextNumericVariationSuffix(parentJob, jobs as JobRecord[]),
    [jobs, parentJob]
  );

  const baseForm = useMemo(() => {
    if (mode === 'edit' && currentJob) return buildFormFromJob(currentJob);
    if (mode === 'variation' && parentJob) {
      return {
        ...buildFormFromJob(parentJob),
        jobNumber: '',
        variationSuffix: nextVariationSuffix,
      };
    }
    const next = emptyForm();
    if (initialCustomerId) {
      next.customerId = initialCustomerId;
    }
    return next;
  }, [currentJob, initialCustomerId, mode, nextVariationSuffix, parentJob]);
  const baseContacts = useMemo(() => {
    if (mode === 'edit' && currentJob) {
      return jobContactsToRows(currentJob.contactsJson, currentJob.contactPerson ?? undefined);
    }
    if (mode === 'variation' && parentJob) {
      return jobContactsToRows(parentJob.contactsJson, parentJob.contactPerson ?? undefined);
    }
    return [emptyJobContactRow()];
  }, [currentJob, mode, parentJob]);
  const baseRequiredExpertises = useMemo(() => {
    const source = mode === 'edit' ? currentJob : mode === 'variation' ? parentJob : null;
    return source && Array.isArray(source.requiredExpertises)
      ? source.requiredExpertises.map((value) => String(value))
      : [];
  }, [currentJob, mode, parentJob]);
  const [formDraft, setFormDraft] = useState<JobFormState | null>(null);
  const [jobContactsDraft, setJobContactsDraft] = useState<JobContactRow[] | null>(null);
  const [requiredExpertisesDraft, setRequiredExpertisesDraft] = useState<string[] | null>(null);
  const [expertiseOptions, setExpertiseOptions] = useState<string[]>([]);
  type JobSourceModeUi = 'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY';
  const [jobSourceMode, setJobSourceMode] = useState<JobSourceModeUi>('HYBRID');
  const saving = isCreating || isUpdating;
  const form = formDraft ?? baseForm;
  const jobContacts = jobContactsDraft ?? baseContacts;
  const requiredExpertises = requiredExpertisesDraft ?? baseRequiredExpertises;

  const isVariation = mode === 'variation' || Boolean(currentJob?.parentJobId);
  const pageTitle = mode === 'edit' ? 'Edit customer job' : mode === 'variation' ? 'Create job variation' : 'Create customer job';
  const primaryActionLabel = mode === 'edit' ? 'Update Job' : mode === 'variation' ? 'Create Variation' : 'Create Job';
  const selectedCustomerName = customerNameById.get(form.customerId) ?? 'No customer selected';

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');
  const canEdit = isSA || perms.includes('job.edit');

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          const m = json.data?.jobSourceMode;
          setJobSourceMode(m === 'EXTERNAL_ONLY' || m === 'INTERNAL_ONLY' || m === 'HYBRID' ? m : 'HYBRID');
        }
      } catch {
        if (!cancelled) setJobSourceMode('HYBRID');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.activeCompanyId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/hr/expertises', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          setExpertiseOptions((json.data as Array<{ name: string }>).map((entry) => entry.name));
        } else if (!cancelled) {
          setExpertiseOptions([...WORKFORCE_EXPERTISE_OPTIONS]);
        }
      } catch {
        if (!cancelled) setExpertiseOptions([...WORKFORCE_EXPERTISE_OPTIONS]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateField = (name: keyof JobFormState, value: string) => {
    setFormDraft((current) => ({ ...(current ?? baseForm), [name]: value }));
  };

  const updateJobContactRow = (index: number, patch: Partial<JobContactRow>) => {
    setJobContactsDraft((current) => {
      const rows = current ?? baseContacts;
      return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    });
  };

  const buildPayload = () => {
    const contactsPayload = rowsToJobContactsPayload(jobContacts);
    const contactPerson = primaryJobContactPersonFromRows(jobContacts) || undefined;
    return {
      customerId: form.customerId,
      description: form.description.trim() || undefined,
      site: form.site.trim() || undefined,
      address: form.address.trim() || undefined,
      locationName: form.locationName.trim() || undefined,
      locationLat: parseNumberInput(form.locationLat),
      locationLng: parseNumberInput(form.locationLng),
      status: form.status,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      quotationNumber: form.quotationNumber.trim() || undefined,
      quotationDate: form.quotationDate || undefined,
      lpoNumber: form.lpoNumber.trim() || undefined,
      lpoDate: form.lpoDate || undefined,
      lpoValue: parseNumberInput(form.lpoValue),
      projectName: form.projectName.trim() || undefined,
      projectDetails: form.projectDetails.trim() || undefined,
      contactPerson,
      salesPerson: form.salesPerson.trim() || undefined,
      contactsJson: contactsPayload,
      jobWorkValue: parseNumberInput(form.jobWorkValue),
      requiredExpertises,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (mode === 'edit' && currentJob) {
        await updateJob({ id: currentJob.id, data: buildPayload() }).unwrap();
        toast.success('Job updated');
        router.push('/customers/jobs');
        return;
      }

      const todayDate = new Date().toISOString().split('T')[0];
      const finalJobNumber =
        mode === 'variation' && parentJob && form.variationSuffix.trim()
          ? `${parentJob.jobNumber}-${form.variationSuffix.trim()}`
          : form.jobNumber.trim();

      const created = await createJob({
        ...buildPayload(),
        jobNumber: finalJobNumber,
        startDate: form.startDate || todayDate,
        ...(parentJobId ? { parentJobId } : {}),
      }).unwrap();
      toast.success(mode === 'variation' ? 'Job variation created' : 'Job created');
      router.push(mode === 'variation' ? `/stock/job-budget/${created.id}` : '/customers/jobs');
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to save job'));
    }
  };

  if ((mode === 'edit' && !canEdit) || (mode !== 'edit' && !canCreate)) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">
        You do not have permission to perform this action.
        <div>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'create' && jobSourceMode === 'EXTERNAL_ONLY') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Parent job creation disabled</h2>
        <p className="text-sm text-muted-foreground">
          This company is set to external-only parent jobs. Create parent jobs from the Project Management API, then add local variations from the customer jobs list.
        </p>
        <Button type="button" variant="secondary" onClick={() => router.push('/customers/jobs')}>
          Back to Customer Jobs
        </Button>
      </div>
    );
  }

  if (mode === 'edit' && jobsLoading && !currentJob) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading job...</div>;
  }

  return (
    <form id="job-form" onSubmit={handleSubmit} className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl space-y-1">
          <Link
            href="/customers/jobs"
            className={cn(
              buttonVariants({ variant: 'link', size: 'sm' }),
              'h-auto p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground',
            )}
          >
            Customers / Jobs
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{pageTitle}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Capture the customer scope, commercial references, site contacts, and worker expertise. Material finished goods now live in the budget engine, where formula items can calculate brand-sensitive costing.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {mode === 'edit' && currentJob?.parentJobId ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/stock/job-budget/${currentJob.id}`)}>
              View Budget
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : primaryActionLabel}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Mode', value: mode === 'variation' ? 'Variation' : mode === 'edit' ? 'Edit' : 'Parent job', note: isVariation ? 'Budget-ready scope' : 'Reporting container' },
          { label: 'Customer', value: selectedCustomerName, note: form.customerId ? 'Linked customer ledger' : 'Required before save' },
          { label: 'Budget flow', value: isVariation ? 'Enabled' : 'By variation', note: 'Formula items are issued from budget page' },
          { label: 'Expertise', value: String(requiredExpertises.length), note: 'Skills for costing schedule checks' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-1 truncate text-lg font-semibold text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="space-y-5">
          <Section
            eyebrow={mode === 'variation' ? 'Variation setup' : 'Job identity'}
            title={mode === 'variation' ? 'Create budget-ready variation' : 'Customer and job identity'}
            description={mode === 'variation' ? 'Parent job details are copied into this variation first. Adjust any site, commercial, contact, or workforce fields before saving.' : 'Parent jobs are used for customer reporting. Create variations under them for costing and budget items.'}
          >
            {mode === 'variation' ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <label className={LABEL_CLASS}>
                  Parent job
                  <input value={parentJob?.jobNumber ?? ''} disabled className={INPUT_CLASS} />
                </label>
                <label className={LABEL_CLASS}>
                  Variation suffix
                  <div className="mt-1.5 flex overflow-hidden rounded-md border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                    <span className="border-r border-border bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
                      {parentJob?.jobNumber ?? 'Parent'}
                    </span>
                    <input
                      required
                      value={form.variationSuffix}
                      onChange={(event) => updateField('variationSuffix', event.target.value)}
                      placeholder={nextVariationSuffix || '1'}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-foreground outline-none"
                    />
                  </div>
                  <p className="mt-2 text-xs normal-case tracking-normal text-muted-foreground">
                    Full number: {parentJob?.jobNumber}{form.variationSuffix.trim() ? `-${form.variationSuffix.trim()}` : ''}. Next suffix is based on existing variations.
                  </p>
                </label>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <label className={LABEL_CLASS}>
                  Job number
                  <input
                    required
                    value={form.jobNumber}
                    onChange={(event) => updateField('jobNumber', event.target.value)}
                    disabled={mode === 'edit'}
                    className={INPUT_CLASS}
                  />
                </label>
                <div>
                  <p className={LABEL_CLASS}>Customer</p>
                  <SearchSelect
                    items={customerSearchItems}
                    value={form.customerId}
                    onChange={(customerId) => updateField('customerId', customerId)}
                    placeholder="Search customers…"
                    required
                    openOnFocus
                    minCharactersToSearch={0}
                    inputProps={{
                      required: true,
                      className: cn(INPUT_CLASS, 'mt-1.5 !rounded-md !border-border !bg-background focus:!ring-ring/20'),
                    }}
                  />
                </div>
              </div>
            )}
          </Section>

          <Section eyebrow="Scope" title="Work process and site" description="Keep this focused on job scope. Material brand, quantities, and finished goods now belong to budget formulas.">
            <label className={LABEL_CLASS}>
              Work process details
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={4}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Describe the work scope, site condition, and customer expectation..."
              />
            </label>
            <label className={LABEL_CLASS}>
              Site
              <input value={form.site} onChange={(event) => updateField('site', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className={LABEL_CLASS}>
              Address
              <textarea value={form.address} onChange={(event) => updateField('address', event.target.value)} rows={2} className={`${INPUT_CLASS} resize-none`} />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className={LABEL_CLASS}>
                Status
                <select value={form.status} onChange={(event) => updateField('status', event.target.value as JobFormState['status'])} className={INPUT_CLASS}>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Start date
                <input type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                End date
                <input type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} className={INPUT_CLASS} />
              </label>
            </div>
          </Section>

          <Section eyebrow="Budget readiness" title="Commercial and workforce inputs" description="These values help compare quotation, budget, manpower, and actual site consumption later.">
            <label className={LABEL_CLASS}>
              Required worker expertise
              <div className="mt-1.5">
                <MultiSelectDropdown
                  options={(expertiseOptions.length ? expertiseOptions : [...WORKFORCE_EXPERTISE_OPTIONS]).map((expertise) => ({
                    value: expertise,
                    label: expertise,
                  }))}
                  value={requiredExpertises}
                  onChange={setRequiredExpertisesDraft}
                  placeholder="Select skills needed for budget schedule checks..."
                />
              </div>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={LABEL_CLASS}>
                Project name
                <input value={form.projectName} onChange={(event) => updateField('projectName', event.target.value)} className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Job work value (AED)
                <input type="number" step="0.01" value={form.jobWorkValue} onChange={(event) => updateField('jobWorkValue', event.target.value)} className={INPUT_CLASS} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className={LABEL_CLASS}>
                Quotation number
                <input value={form.quotationNumber} onChange={(event) => updateField('quotationNumber', event.target.value)} className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Quotation date
                <input type="date" value={form.quotationDate} onChange={(event) => updateField('quotationDate', event.target.value)} className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Sales person
                <input value={form.salesPerson} onChange={(event) => updateField('salesPerson', event.target.value)} className={INPUT_CLASS} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className={LABEL_CLASS}>
                LPO number
                <input value={form.lpoNumber} onChange={(event) => updateField('lpoNumber', event.target.value)} className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                LPO date
                <input type="date" value={form.lpoDate} onChange={(event) => updateField('lpoDate', event.target.value)} className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                LPO value
                <input type="number" step="0.01" value={form.lpoValue} onChange={(event) => updateField('lpoValue', event.target.value)} className={INPUT_CLASS} />
              </label>
            </div>
            <label className={LABEL_CLASS}>
              Project details
              <textarea value={form.projectDetails} onChange={(event) => updateField('projectDetails', event.target.value)} rows={3} className={`${INPUT_CLASS} resize-none`} />
            </label>
          </Section>

          <Section eyebrow="Contacts" title="Site and project contacts" description="The first contact name becomes the primary contact for job summaries and print templates.">
            <div className="space-y-3">
              {jobContacts.map((row, index) => (
                <div key={index} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact {index + 1}</p>
                    {jobContacts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setJobContactsDraft((current) => {
                            const rows = current ?? baseContacts;
                            return rows.filter((_, rowIndex) => rowIndex !== index);
                          })
                        }
                        className="text-xs font-semibold text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input placeholder="Label (site, billing)" value={row.label} onChange={(event) => updateJobContactRow(index, { label: event.target.value })} className={INPUT_CLASS} />
                    <input placeholder="Name" value={row.name} onChange={(event) => updateJobContactRow(index, { name: event.target.value })} className={INPUT_CLASS} />
                    <input type="email" placeholder="Email" value={row.email} onChange={(event) => updateJobContactRow(index, { email: event.target.value })} className={INPUT_CLASS} />
                    <input placeholder="Phone" value={row.number} onChange={(event) => updateJobContactRow(index, { number: event.target.value })} className={INPUT_CLASS} />
                    <input placeholder="Designation / role" value={row.designation} onChange={(event) => updateJobContactRow(index, { designation: event.target.value })} className={`${INPUT_CLASS} md:col-span-2`} />
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setJobContactsDraft((current) => [...(current ?? baseContacts), emptyJobContactRow()])}
            >
              Add Contact
            </Button>
          </Section>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Budget flow</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Finished goods moved to budget</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use this page for customer, site, commercial, and workforce setup. Add material formulas, brand selections, and finished-good costing from the budget page.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-foreground">
              <div className="rounded-md border border-border bg-card px-3 py-2">1. Save variation job</div>
              <div className="rounded-md border border-border bg-card px-3 py-2">2. Open material budget</div>
              <div className="rounded-md border border-border bg-card px-3 py-2">3. Add formula items and costing</div>
            </div>
            {mode === 'edit' && currentJob?.parentJobId ? (
              <Button type="button" className="mt-4 w-full" variant="secondary" onClick={() => router.push(`/stock/job-budget/${currentJob.id}`)}>
                Open Budget
              </Button>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Save checklist</p>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p className="flex justify-between gap-3"><span>Customer selected</span><span className="text-foreground">{form.customerId ? 'Yes' : 'Missing'}</span></p>
              <p className="flex justify-between gap-3"><span>Job number</span><span className="text-foreground">{mode === 'variation' ? (form.variationSuffix ? 'Ready' : 'Missing') : (form.jobNumber ? 'Ready' : 'Missing')}</span></p>
              <p className="flex justify-between gap-3"><span>Budget page</span><span className="text-foreground">{isVariation ? 'Available' : 'Use variation'}</span></p>
              <p className="flex justify-between gap-3"><span>Expertise tags</span><span className="text-foreground">{requiredExpertises.length}</span></p>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving…' : primaryActionLabel}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => router.push('/customers/jobs')}>
                Back to Jobs
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
