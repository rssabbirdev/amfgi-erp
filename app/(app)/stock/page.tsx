'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { useGetMaterialsQuery, useGetStockBatchesQuery, useGetStockValuationQuery } from '@/store/hooks';

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function panelStyle(tone: 'emerald' | 'slate' | 'blue' | 'amber') {
  const map = {
    emerald:
      'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    slate:
      'border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/60',
    blue:
      'border-blue-200 bg-blue-50/80 dark:border-blue-900/40 dark:bg-blue-950/20',
    amber:
      'border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20',
  };

  return map[tone];
}

export default function StockPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;

  const canSeeMaterials = isSA || perms.includes('material.view');
  const canSeeReceipts = isSA || perms.includes('transaction.stock_in');
  const canSeeDispatch = isSA || perms.includes('transaction.stock_out');
  const canSeeBatches = isSA || perms.includes('material.view') || perms.includes('transaction.stock_in');
  const canSeeTransfers = isSA || perms.includes('transaction.transfer');
  const canSeeReconcile = isSA || perms.includes('transaction.reconcile');
  const canViewStock = canSeeMaterials || canSeeReceipts || canSeeDispatch || canSeeBatches || canSeeTransfers || canSeeReconcile;

  const { data: valuation, isFetching: valuationLoading } = useGetStockValuationQuery(undefined, {
    skip: !canViewStock,
  });
  const { data: materials = [], isFetching: materialsLoading } = useGetMaterialsQuery(undefined, {
    skip: !canSeeMaterials,
  });
  const { data: batches = [], isFetching: batchesLoading } = useGetStockBatchesQuery(undefined, {
    skip: !canSeeBatches,
  });

  const activeMaterials = useMemo(
    () => materials.filter((material) => material.isActive),
    [materials]
  );
  const openBatches = useMemo(
    () => batches.filter((batch) => batch.quantityAvailable > 0),
    [batches]
  );
  const lowStockCount = useMemo(
    () =>
      activeMaterials.filter(
        (material) =>
          typeof material.reorderLevel === 'number' && material.currentStock <= material.reorderLevel
      ).length,
    [activeMaterials]
  );

  const preferredValue = valuation?.summary.fifoStockValue ?? 0;
  const movingAverageValue = valuation?.summary.movingAverageStockValue ?? 0;
  const currentValue = valuation?.summary.currentStockValue ?? 0;

  const modules = [
    {
      href: '/stock/materials',
      title: 'Materials',
      description: 'Maintain items, UOM, stock definitions, and current balance.',
      enabled: canSeeMaterials,
      meta: `${formatCount(activeMaterials.length)} active materials`,
      tone: 'emerald' as const,
    },
    {
      href: '/stock/goods-receipt',
      title: 'Goods Receipt',
      description: 'Create receipts, reopen bills, and trace incoming stock.',
      enabled: canSeeReceipts,
      meta: `${formatCount(openBatches.length)} open batches in stock`,
      tone: 'blue' as const,
    },
    {
      href: '/stock/dispatch',
      title: 'Dispatch',
      description: 'Issue material, create delivery notes, and follow stock-out flow.',
      enabled: canSeeDispatch,
      meta: `${formatCount(lowStockCount)} materials need attention`,
      tone: 'amber' as const,
    },
    {
      href: '/stock/stock-batches',
      title: 'Stock Batches',
      description: 'Inspect FIFO layers, remaining balance, and receipt-by-receipt cost.',
      enabled: canSeeBatches,
      meta: `${formatCount(batches.length)} total receipt batches`,
      tone: 'slate' as const,
    },
    {
      href: '/stock/inter-company-transfers',
      title: 'Inter-Company Transfers',
      description: 'Review transfer history and move stock between companies in a dedicated workspace.',
      enabled: canSeeTransfers,
      meta: 'Ledger and multi-item transfer',
      tone: 'blue' as const,
    },
    {
      href: '/stock/issue-reconcile',
      title: 'Issue Reconcile',
      description: 'Review reconcile history and manually distribute non-stock quantities into variation jobs.',
      enabled: canSeeReconcile,
      meta: 'History and create workspace',
      tone: 'amber' as const,
    },
  ].filter((module) => module.enabled);

  const workflow = [
    {
      label: 'Receive',
      body: 'Goods receipt creates stock batches and normalizes cost to the base unit.',
    },
    {
      label: 'Store',
      body: 'Materials keep the live current stock, while stock batches keep the open FIFO layers.',
    },
    {
      label: 'Issue',
      body: 'Dispatch consumes the oldest open batch first, then rolls to the next layer when needed.',
    },
    {
      label: 'Review',
      body: 'This Stock page gives the preferred FIFO value first, then moving average and current comparisons.',
    },
  ];

  if (!canViewStock) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            You do not have permission to view the stock workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Stock Workspace
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Inventory control in one place
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Open materials, receipts, dispatch, and batch layers from one page. FIFO stays the system priority, and the comparison cards below show how the same stock looks under other valuation views.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canSeeReceipts ? (
                <Link href="/stock/goods-receipt/receive">
                  <Button>New receipt</Button>
                </Link>
              ) : null}
              {canSeeDispatch ? (
                <>
                <Link href="/stock/dispatch/entry">
                  <Button variant="secondary">New dispatch</Button>
                  </Link>
                  <Link href="/stock/dispatch/delivery-note">
                                  <Button variant="secondary">New Delivery Note</Button>
                                </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
          <div className="bg-white px-5 py-5 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Preferred</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                  {valuationLoading ? '...' : formatMoney(preferredValue)}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">FIFO stock value</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                System priority
              </span>
            </div>
          </div>
          <div className="bg-white px-5 py-5 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Comparison</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {valuationLoading ? '...' : formatMoney(movingAverageValue)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Moving average value</p>
          </div>
          <div className="bg-white px-5 py-5 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Comparison</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {valuationLoading ? '...' : formatMoney(currentValue)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">Current material cost value</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.9fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
                Stock modules
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                Jump directly into the stock area you need without going back to the main sidebar.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500 dark:text-slate-500">
              {materialsLoading || batchesLoading ? 'Refreshing...' : `${modules.length} available modules`}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className={`rounded-2xl border px-4 py-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60 dark:hover:border-emerald-700/50 dark:hover:bg-emerald-950/20 ${panelStyle(module.tone)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{module.title}</h3>
                  <span className="rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400">
                    Open
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{module.description}</p>
                <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                  {module.meta}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
              Flow
            </h2>
            <div className="mt-4 space-y-3">
              {workflow.map((step, index) => (
                <div
                  key={step.label}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/70"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{step.label}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300/80">
              Quick read
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Active materials</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatCount(activeMaterials.length)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Open batches</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatCount(openBatches.length)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Low stock watch</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatCount(lowStockCount)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Prev. month consumption</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                  {valuationLoading ? '...' : formatMoney(valuation?.summary.prevMonthConsumptionValue ?? 0)}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
