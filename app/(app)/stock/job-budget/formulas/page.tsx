'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useDeleteFormulaLibraryMutation, useGetFormulaLibrariesQuery } from '@/store/hooks';

type FormulaRuleCounts = {
  areas: number;
  materials: number;
  labor: number;
};

function countRules(formulaConfig: unknown): FormulaRuleCounts {
  if (typeof formulaConfig !== 'object' || formulaConfig === null || !('areas' in formulaConfig)) {
    return { areas: 0, materials: 0, labor: 0 };
  }
  const areas = Array.isArray((formulaConfig as { areas?: unknown }).areas)
    ? (formulaConfig as { areas: unknown[] }).areas
    : [];
  return areas.reduce<FormulaRuleCounts>(
    (total, area) => {
      const areaRecord = typeof area === 'object' && area !== null ? (area as { materials?: unknown; labor?: unknown }) : {};
      const hasValidStructure = Array.isArray(areaRecord.materials) || Array.isArray(areaRecord.labor);
      return {
        areas: total.areas + (hasValidStructure ? 1 : 0),
        materials: total.materials + (Array.isArray(areaRecord.materials) ? areaRecord.materials.length : 0),
        labor: total.labor + (Array.isArray(areaRecord.labor) ? areaRecord.labor.length : 0),
      };
    },
    { areas: 0, materials: 0, labor: 0 } satisfies FormulaRuleCounts
  );
}

export default function StockFormulaLibraryPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || (perms.includes('job.view') && perms.includes('material.view'));
  const canManage = isSA || perms.includes('settings.manage');

  const { data: formulas = [], isLoading } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const [deleteFormula, { isLoading: deleting }] = useDeleteFormulaLibraryMutation();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof formulas>();
    for (const formula of formulas) {
      const current = map.get(formula.fabricationType) ?? [];
      map.set(formula.fabricationType, [...current, formula]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [formulas]);

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete formula "${name}"? Existing job items using this formula may stop calculating.`)) return;
    try {
      await deleteFormula(id).unwrap();
      toast.success('Formula deleted');
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete formula';
      toast.error(message);
    }
  };

  if (!canView) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        You need job.view and material.view permission to view formulas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/stock/job-budget" className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
              Job Budget
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Formula library</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Manage formula templates used by variation job budgets. Create and edit formulas on dedicated pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/stock/job-budget">
              <Button variant="secondary">Back</Button>
            </Link>
            {canManage ? (
              <Link href="/stock/job-budget/formulas/new">
                <Button>New formula</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/70">
          No formulas yet.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([fabricationType, items]) => (
            <section key={fabricationType} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{fabricationType}</h2>
                  <p className="text-sm text-slate-500">{items.length} formula{items.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((formula) => {
                  const counts = countRules(formula.formulaConfig);
                  return (
                    <div key={formula.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">{formula.name}</h3>
                          <p className="mt-1 font-mono text-xs text-slate-500">{formula.slug}</p>
                        </div>
                        {canManage ? (
                          <div className="flex gap-2">
                            <Link href={`/stock/job-budget/formulas/${formula.id}/edit`}>
                              <Button size="sm" variant="secondary">Edit</Button>
                            </Link>
                            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => remove(formula.id, formula.name)}>
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{formula.description || 'No description yet.'}</p>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Areas</p>
                          <p className="mt-1 font-semibold text-slate-900 dark:text-white">{counts.areas}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Materials</p>
                          <p className="mt-1 font-semibold text-slate-900 dark:text-white">{counts.materials}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Labor</p>
                          <p className="mt-1 font-semibold text-slate-900 dark:text-white">{counts.labor}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
