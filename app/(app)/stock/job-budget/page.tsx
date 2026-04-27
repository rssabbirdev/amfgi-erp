'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useGetFormulaLibrariesQuery, useGetJobsQuery } from '@/store/hooks';

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function StockJobBudgetPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || (perms.includes('job.view') && perms.includes('material.view'));
  const canManage = isSA || perms.includes('settings.manage');

  const { data: formulas = [], isLoading: formulasLoading } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const { data: jobs = [], isLoading: jobsLoading } = useGetJobsQuery(undefined, { skip: !canView });

  const variationJobs = useMemo(
    () => jobs.filter((job) => Boolean(job.parentJobId) && job.status === 'ACTIVE'),
    [jobs]
  );
  const fabricationTypes = useMemo(
    () => new Set(formulas.map((formula) => formula.fabricationType)).size,
    [formulas]
  );

  if (!canView) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        You need job.view and material.view permission to open job budget and formulas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">
                Stock Workspace
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Job budget and formulas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Manage fabrication formula templates and open variation job budgets for material estimates, FIFO actuals, and workforce planning.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/stock">
                <Button variant="secondary">Back to Stock</Button>
              </Link>
              <Link href="/stock/job-budget/formulas">
                <Button variant="secondary">Formula library</Button>
              </Link>
              {canManage ? (
                <Link href="/stock/job-budget/formulas/new">
                  <Button>New formula</Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Formula templates</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {formulasLoading ? '...' : formatCount(formulas.length)}
            </p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fabrication types</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {formulasLoading ? '...' : formatCount(fabricationTypes)}
            </p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Active variations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {jobsLoading ? '...' : formatCount(variationJobs.length)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Variation budgets</h2>
              <p className="mt-1 text-sm text-slate-500">Open a variation job to calculate budget vs actual consumption.</p>
            </div>
          </div>

          {jobsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : variationJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
              No active variation jobs found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {variationJobs.slice(0, 12).map((job) => (
                <div key={job.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{job.jobNumber}</p>
                    <p className="mt-1 text-sm text-slate-500">{job.customerName || job.projectName || job.description || 'Variation job'}</p>
                  </div>
                  <Link href={`/stock/job-budget/${job.id}`}>
                    <Button size="sm" variant="secondary">Open budget</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Link
            href="/stock/job-budget/formulas"
            className="block rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
          >
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Formula library</p>
            <p className="mt-2 text-sm leading-6 text-emerald-800/80 dark:text-emerald-200/75">
              Create and maintain reusable formulas for GRP, MEP, steel, and other fabrication scopes.
            </p>
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Flow</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <p>Formula defines dynamic inputs and rules.</p>
              <p>Variation job stores job items using those formulas.</p>
              <p>Budget compares theoretical material demand with actual FIFO stock issues.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
