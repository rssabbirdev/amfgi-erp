'use client';

import { use } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import TransactionLedger from '@/components/transactions/TransactionLedger';
import { useGetCustomersQuery, useGetJobByIdQuery, useGetJobMaterialsQuery, useGetJobsQuery } from '@/store/hooks';

type MaterialSummary = {
  materialId: string;
  materialName: string;
  unit: string;
  dispatched: number;
  returned: number;
  netConsumed: number;
  availableToReturn: number;
};

type JobContact = {
  label?: string;
  name?: string;
  number?: string;
  email?: string;
  designation?: string;
};

type Customer = {
  id: string;
  name: string;
};

function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-AE');
}

function formatMoney(value?: number | string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed === 0) return '-';
  return `AED ${parsed.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function safeContacts(value: unknown): JobContact[] {
  return Array.isArray(value) ? value.filter((entry): entry is JobContact => typeof entry === 'object' && entry !== null) : [];
}

function InfoCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{value}</div>
      {note ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{note}</div> : null}
    </div>
  );
}

export default function CustomerJobLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: job, isLoading: jobLoading } = useGetJobByIdQuery(id);
  const { data: materialsData, isLoading: materialsLoading } = useGetJobMaterialsQuery(id);
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: jobs = [] } = useGetJobsQuery();
  const summary = materialsData || [];
  const isLoading = jobLoading || materialsLoading;

  const customerName = (customers as Customer[]).find((entry) => entry.id === job?.customerId)?.name ?? 'Unknown customer';
  const parentJob = job?.parentJobId ? jobs.find((entry) => entry.id === job.parentJobId) : null;
  const variationCount = jobs.filter((entry) => entry.parentJobId === id).length;
  const contacts = safeContacts((job as { contactsJson?: unknown } | undefined)?.contactsJson);
  const totalDispatched = summary.reduce((sum, row) => sum + row.dispatched, 0);
  const totalConsumed = summary.reduce((sum, row) => sum + row.netConsumed, 0);
  const isVariation = Boolean(job?.parentJobId);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!job) {
    return <div className="py-12 text-center text-slate-500 dark:text-slate-400">Job not found.</div>;
  }

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_42%,#f8fafc_100%)] px-4 py-4 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_55%,#020617_100%)] sm:-mx-5 sm:-my-5 sm:px-5 sm:py-5 lg:-mx-8 lg:-my-6 lg:px-8 lg:py-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_34%),linear-gradient(135deg,#ffffff,#f8fafc)] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#0f172a,#020617)] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <Link href="/customers/jobs" className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300">
                Customers / Jobs / Ledger
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{job.jobNumber}</h1>
                <StatusBadge status={job.status} />
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {isVariation ? 'Variation' : 'Parent job'}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                {job.description || 'No work process details added yet.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isVariation ? (
                <Button variant="secondary" onClick={() => router.push(`/stock/job-budget/${id}`)}>
                  Costing & Budget
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => router.push(`/customers/jobs/form?mode=variation&parentJobId=${id}&customerId=${job.customerId}`)}>
                  Create Variation
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Customer</p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-white">{customerName}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{job.site || 'Site not set'}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{isVariation ? 'Parent job' : 'Variations'}</p>
            <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{isVariation ? parentJob?.jobNumber ?? '-' : variationCount}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{isVariation ? 'Reporting container' : 'Linked costing scopes'}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Material movement</p>
            <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{formatQty(totalConsumed)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatQty(totalDispatched)} dispatched across {summary.length} items</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Commercial value</p>
            <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{formatMoney((job as { jobWorkValue?: number | string | null }).jobWorkValue)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">LPO {String((job as { lpoNumber?: string | null }).lpoNumber ?? '-')}</p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <main className="space-y-5">
          <section className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Material Summary</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Dispatched, returned, net consumed, and returnable stock for this job scope.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3 text-right">Dispatched</th>
                    <th className="px-4 py-3 text-right">Returned</th>
                    <th className="px-4 py-3 text-right">Net Consumed</th>
                    <th className="px-4 py-3 text-right">Available Return</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((mat: MaterialSummary) => (
                    <tr key={mat.materialId} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-950 dark:text-white">{mat.materialName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-500">{mat.unit}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatQty(mat.dispatched)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatQty(mat.returned)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">{formatQty(mat.netConsumed)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatQty(mat.availableToReturn)}</td>
                    </tr>
                  ))}
                  {summary.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No materials dispatched yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <TransactionLedger jobId={id} />
        </main>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <InfoCard label="Project" value={(job as { projectName?: string | null }).projectName || '-'} note={(job as { projectDetails?: string | null }).projectDetails || 'No project details'} />
          <InfoCard label="Timeline" value={`${formatDate(job.startDate)} - ${formatDate(job.endDate)}`} note={`Status: ${job.status.replace('_', ' ')}`} />
          <InfoCard label="Quotation" value={(job as { quotationNumber?: string | null }).quotationNumber || '-'} note={`Date ${formatDate((job as { quotationDate?: string | Date | null }).quotationDate)}`} />
          <InfoCard label="LPO" value={(job as { lpoNumber?: string | null }).lpoNumber || '-'} note={`Value ${formatMoney((job as { lpoValue?: number | string | null }).lpoValue)} · ${formatDate((job as { lpoDate?: string | Date | null }).lpoDate)}`} />

          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Location</p>
            <p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{(job as { address?: string | null }).address || '-'}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              {(job as { locationName?: string | null }).locationName || '-'} · {(job as { locationLat?: number | null }).locationLat ?? '-'}, {(job as { locationLng?: number | null }).locationLng ?? '-'}
            </p>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contacts</p>
            <p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{(job as { contactPerson?: string | null }).contactPerson || '-'}</p>
            <div className="mt-3 space-y-2">
              {contacts.map((contact, index) => (
                <div key={`${contact.name ?? 'contact'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-sm font-medium text-slate-950 dark:text-white">{contact.name || '-'}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                    {contact.label ? `[${contact.label}] ` : ''}{contact.number || '-'} · {contact.email || '-'} · {contact.designation || '-'}
                  </p>
                </div>
              ))}
              {contacts.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No additional contacts.</p> : null}
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
}
