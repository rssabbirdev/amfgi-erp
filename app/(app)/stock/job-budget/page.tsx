'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useGetFormulaLibrariesQuery, useGetJobsQuery } from '@/store/hooks';

const PAGE_SIZE = 10;

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function StockJobBudgetPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || (perms.includes('job.view') && perms.includes('material.view'));
  const canManage = isSA || perms.includes('settings.manage');

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data: formulas = [], isLoading: formulasLoading } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const { data: jobs = [], isLoading: jobsLoading } = useGetJobsQuery(undefined, { skip: !canView });

  const parentContractJobs = useMemo(
    () =>
      jobs
        .filter((job) => !job.parentJobId && job.status === 'ACTIVE')
        .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber)),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parentContractJobs;
    return parentContractJobs.filter((job) => {
      const hay = [job.jobNumber, job.customerName, job.projectName, job.description, job.site, job.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [parentContractJobs, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, safePage]);

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
                Manage formula templates and open parent contract jobs only: material budget lines live on the contract; dispatch and consumption on variations roll up in costing.
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Active contract jobs</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {jobsLoading ? '...' : formatCount(parentContractJobs.length)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Parent jobs only; variations are not listed here.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
                Contract job numbers
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Search by job number, customer, project, site, or address. Budget is always managed on these parent jobs.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:max-w-xs">
              <span className="sr-only">Search contract jobs</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500/30 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
              />
            </label>
          </div>

          {jobsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : parentContractJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
              No active parent contract jobs found.
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
              No jobs match your search.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {pageSlice.map((job) => (
                  <div key={job.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                        {job.jobNumber}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {job.customerName || job.projectName || job.description || 'Contract job'}
                      </p>
                    </div>
                    <Link href={`/stock/job-budget/${job.id}`} className="shrink-0">
                      <Button size="sm" variant="secondary">
                        Open budget
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
              {filteredJobs.length > PAGE_SIZE ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Page {safePage} of {totalPages} · {formatCount(filteredJobs.length)} job
                    {filteredJobs.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
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
              <p>Only the parent contract job stores budget lines (job items); variations cannot receive new budget lines from the API.</p>
              <p>Opening a variation URL under stock job-budget redirects to the parent contract.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
