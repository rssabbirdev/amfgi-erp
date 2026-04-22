'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { useGetStockBatchesQuery } from '@/store/hooks';
import type { StockBatch } from '@/store/api/endpoints/stockBatches';

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
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

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function ratio(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function StockBatchesPage() {
  const { data: session } = useSession();
  const [todayMs] = useState(() => Date.now());
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView =
    isSA ||
    perms.includes('material.view') ||
    perms.includes('transaction.stock_in') ||
    perms.includes('transaction.stock_out');

  const { data: batches = [], isFetching } = useGetStockBatchesQuery(undefined, { skip: !canView });
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null,
    [batches, selectedBatchId]
  );

  const openBatchCount = useMemo(
    () => batches.filter((batch) => batch.quantityAvailable > 0).length,
    [batches]
  );
  const expiringSoonCount = useMemo(
    () =>
      batches.filter((batch) => {
        if (!batch.expiryDate || batch.quantityAvailable <= 0) return false;
        const days = (new Date(batch.expiryDate).getTime() - todayMs) / (1000 * 60 * 60 * 24);
        return days >= 0 && days <= 30;
      }).length,
    [batches, todayMs]
  );
  const availableValue = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.quantityAvailable * batch.unitCost, 0),
    [batches]
  );
  const materialCoverage = useMemo(
    () => new Set(batches.map((batch) => batch.materialId)).size,
    [batches]
  );

  const columns: Column<StockBatch>[] = [
    {
      key: 'batchNumber',
      header: 'Batch',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[180px]">
          <div className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            {batch.batchNumber}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            Receipt {batch.receiptNumber || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'materialName',
      header: 'Material',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[220px]">
          <div className="font-medium text-slate-900 dark:text-white">{batch.materialName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
            <span>{batch.materialUnit}</span>
            {batch.warehouse ? (
              <>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span>{batch.warehouse}</span>
              </>
            ) : null}
            {batch.stockType ? (
              <>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span>{batch.stockType}</span>
              </>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'supplierName',
      header: 'Supplier',
      sortable: true,
      render: (batch) =>
        batch.supplierName ? (
          <span className="text-sm text-slate-700 dark:text-slate-300">{batch.supplierName}</span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">Walk-in / not linked</span>
        ),
    },
    {
      key: 'quantityAvailable',
      header: 'Available',
      sortable: true,
      render: (batch) => {
        const fill = ratio(batch.quantityAvailable, batch.quantityReceived);
        return (
          <div className="min-w-[170px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatQty(batch.quantityAvailable)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-500">
                of {formatQty(batch.quantityReceived)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${fill}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'unitCost',
      header: 'Base Cost',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[110px] text-sm text-slate-700 dark:text-slate-300">
          {formatMoney(batch.unitCost)}
        </div>
      ),
    },
    {
      key: 'receivedDate',
      header: 'Received',
      sortable: true,
      render: (batch) => (
        <div className="min-w-[120px] text-sm text-slate-700 dark:text-slate-300">
          {formatDate(batch.receivedDate)}
        </div>
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock batches</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            You do not have permission to view stock batches.
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
                Batch Ledger
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Stock batch control
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Track every received batch, what is still available, and how dispatch consumes stock behind the screen.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/stock/goods-receipt">
                <Button variant="secondary">Receipt history</Button>
              </Link>
              <Link href="/stock/goods-receipt/receive">
                <Button>New receipt</Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Batches in view',
              value: String(batches.length),
              note: 'All received stock batches',
            },
            {
              label: 'Open batches',
              value: String(openBatchCount),
              note: 'Still carrying available stock',
            },
            {
              label: 'Available value',
              value: formatMoney(availableValue),
              note: 'Available qty x base unit cost',
            },
            {
              label: 'Material coverage',
              value: String(materialCoverage),
              note: `${expiringSoonCount} expiring within 30 days`,
            },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-950/80">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.95fr)]">
        <SectionShell
          title="Batch list"
          description="Search by batch, material, supplier, or receipt number. Select a row to inspect the costing and consumption flow."
        >
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">
              FIFO-ready receipt batches
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">
              Base cost stored per unit
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-transparent">
              Click row for detail
            </span>
          </div>

          <DataTable
            columns={columns}
            data={batches}
            loading={isFetching && batches.length === 0}
            emptyText="No stock batches found."
            searchKeys={['batchNumber', 'receiptNumber', 'materialName', 'supplierName']}
            onRowClick={(batch) => setSelectedBatchId(batch.id)}
            onRowDoubleClick={(batch) => setSelectedBatchId(batch.id)}
            selectedRowId={selectedBatch?.id ?? null}
          />
        </SectionShell>

        <div className="space-y-4">
          <SectionShell
            title="Batch detail"
            description="The selected batch shows what was received, what remains, and when this layer was last touched."
          >
            {selectedBatch ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300/80">
                    Selected batch
                  </p>
                  <h3 className="mt-2 font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                    {selectedBatch.batchNumber}
                  </h3>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                    {selectedBatch.materialName} {selectedBatch.receiptNumber ? `· ${selectedBatch.receiptNumber}` : ''}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Available', `${formatQty(selectedBatch.quantityAvailable)} ${selectedBatch.materialUnit}`],
                    ['Consumed', `${formatQty(selectedBatch.quantityConsumed)} ${selectedBatch.materialUnit}`],
                    ['Base unit cost', formatMoney(selectedBatch.unitCost)],
                    ['Batch value', formatMoney(selectedBatch.totalCost)],
                    ['Supplier', selectedBatch.supplierName || 'Not linked'],
                    ['Latest usage', formatDate(selectedBatch.latestUsageDate)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/70"
                    >
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-950/60">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-500">
                    <span>Remaining layer</span>
                    <span>{ratio(selectedBatch.quantityAvailable, selectedBatch.quantityReceived).toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${ratio(selectedBatch.quantityAvailable, selectedBatch.quantityReceived)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Received on {formatDate(selectedBatch.receivedDate)}
                    {selectedBatch.expiryDate ? ` · expires ${formatDate(selectedBatch.expiryDate)}` : ''}
                    {selectedBatch.issueLinkCount > 0 ? ` · linked to ${selectedBatch.issueLinkCount} issue transaction${selectedBatch.issueLinkCount === 1 ? '' : 's'}` : ' · not consumed yet'}
                  </p>
                </div>

                {selectedBatch.notes ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/60">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Notes</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedBatch.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Select a batch from the list to inspect it.</p>
            )}
          </SectionShell>

          <SectionShell
            title="Behind The Screen"
            description="This page also explains the operational flow so batch valuation stays traceable."
          >
            <div className="space-y-3">
              {[
                {
                  step: '1. Goods receipt creates the batch',
                  body: 'When a material is received, the system creates one stock batch row with receipt number, received quantity, available quantity, and the base-unit cost.',
                },
                {
                  step: '2. Cost is normalized to base unit',
                  body: 'If the user buys in a larger UOM like drum, the entered cost is converted to the material base unit before saving. That keeps inventory valuation consistent.',
                },
                {
                  step: '3. Dispatch consumes from the oldest open batch',
                  body: 'On stock-out, the system links the issue transaction to one or more receipt batches. Quantity is reduced from the oldest available batch first, then moves to the next batch when needed.',
                },
                {
                  step: '4. This page reads the live layer status',
                  body: 'The batch list shows the remaining quantity, how much each batch already supplied, and when that batch was last used in a transaction.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/70"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.step}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.body}</p>
                </div>
              ))}

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300/80">
                  Example flow
                </p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                  <p>
                    Acetone base unit is <strong>kg</strong>.
                  </p>
                  <p>
                    Receipt 1: buy <strong>1 drum = 190 kg</strong> for <strong>AED 950</strong>. The system saves batch cost as <strong>AED 5 per kg</strong>.
                  </p>
                  <p>
                    Receipt 2: later receive another <strong>100 kg</strong> for <strong>AED 520</strong>. That batch saves as <strong>AED 5.20 per kg</strong>.
                  </p>
                  <p>
                    Dispatch 210 kg: the system first consumes all 190 kg from the older batch, then takes 20 kg from the newer batch. This page lets the team see those layers clearly.
                  </p>
                </div>
              </div>
            </div>
          </SectionShell>
        </div>
      </div>
    </div>
  );
}
