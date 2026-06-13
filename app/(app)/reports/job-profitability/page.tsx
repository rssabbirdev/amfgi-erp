'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { useGetJobProfitabilityQuery } from '@/store/hooks';
import { cn } from '@/lib/utils';

function formatMoney(value: number | null) {
  if (value == null) return '-';
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

function formatPct(value: number | null) {
  if (value == null) return '-';
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function jobStatusBadge(status: string) {
  const label = status.replace(/_/g, ' ');
  const cls =
    status === 'ACTIVE'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      : status === 'COMPLETED'
        ? 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200'
        : status === 'ON_HOLD'
          ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : status === 'CANCELLED'
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/50 text-muted-foreground';
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium uppercase tracking-wide', cls)}>
      {label}
    </Badge>
  );
}

function SummaryTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        emphasize
          ? 'border-amber-500/35 bg-amber-500/10'
          : 'border-border bg-muted/30',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-base font-semibold tabular-nums text-foreground sm:text-lg')}>{value}</p>
    </div>
  );
}

export default function JobProfitabilityPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetJobProfitabilityQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [focus, setFocus] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (focus === 'over_budget' && row.materialCostVariance <= 0.005) return false;
      if (focus === 'unbudgeted' && row.unbudgetedMaterialCount <= 0) return false;
      if (focus === 'reconcile' && row.reconcileCost <= 0.005) return false;
      if (!query) return true;

      const haystack = [
        row.customerName,
        row.parentJobNumber,
        row.variationJobNumber,
        row.variationDescription ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [focus, rows, search, status]);

  const handleExport = () => {
    if (filteredRows.length === 0) return;

    const headers = [
      'Customer',
      'Parent Job',
      'Variation Job',
      'Status',
      'Budget Material Cost',
      'Net Material Cost',
      'Material Cost Variance',
      'Unbudgeted Material Cost',
      'Reconcile Cost',
      'Variation Job Work Value',
      'Material Margin Against Variation Value',
    ];

    const csvRows = filteredRows.map((row) =>
      [
        row.customerName,
        row.parentJobNumber,
        row.variationJobNumber,
        row.status,
        row.budgetMaterialCost.toFixed(2),
        row.netMaterialCost.toFixed(2),
        row.materialCostVariance.toFixed(2),
        row.unbudgetedMaterialCost.toFixed(2),
        row.reconcileCost.toFixed(2),
        row.variationJobWorkValue == null ? '' : row.variationJobWorkValue.toFixed(2),
        row.materialMarginAgainstVariationValue == null ? '' : row.materialMarginAgainstVariationValue.toFixed(2),
      ].join(','),
    );

    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `job-profitability-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Job profitability</CardTitle>
            <CardDescription>You do not have permission to view this report.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insights</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Customer and job profitability</h1>
          <p className="text-sm text-muted-foreground">
            Variation jobs rolled up with customer, parent job, material budget, issued cost, returns, and
            reconcile-linked consumption.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleExport} disabled={filteredRows.length === 0}>
            Export CSV
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <p className="w-full text-right text-xs tabular-nums text-muted-foreground sm:w-auto sm:pl-2">
            {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryTile label="Variations" value={summary?.totalVariations ?? 0} />
        <SummaryTile label="Customers" value={summary?.customersCovered ?? 0} />
        <SummaryTile label="Over budget" value={summary?.overBudgetCount ?? 0} emphasize />
        <SummaryTile label="Budget cost" value={formatMoney(summary?.totalBudgetMaterialCost ?? 0)} />
        <SummaryTile label="Net cost" value={formatMoney(summary?.totalNetMaterialCost ?? 0)} />
        <SummaryTile label="Unbudgeted jobs" value={summary?.withUnbudgetedMaterialCount ?? 0} />
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem_12rem]">
          <div className="space-y-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Customer, parent job, variation, description…"
            />
          </div>
          <div className="space-y-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On hold</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Focus</span>
            <Select value={focus} onChange={(event) => setFocus(event.target.value)}>
              <option value="all">All jobs</option>
              <option value="over_budget">Over budget only</option>
              <option value="unbudgeted">Unbudgeted issues</option>
              <option value="reconcile">Reconcile linked</option>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Net cost = stock out minus returns. Reconcile cost is a subset of issued cost.
        </p>
      </section>

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load the profitability report. Try refresh.</AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-20 min-w-[260px] border-r border-border bg-muted/50 px-3 py-3 backdrop-blur-sm">
                    Customer / Job
                  </th>
                  <th className="min-w-[90px] px-3 py-3">Status</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Budget qty</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Budget cost</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Net qty</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Net cost</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Variance</th>
                  <th className="min-w-[110px] px-3 py-3 text-right">Variance %</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Unbudgeted</th>
                  <th className="min-w-[130px] px-3 py-3 text-right">Reconcile</th>
                  <th className="min-w-[150px] px-3 py-3 text-right">Variation value</th>
                  <th className="min-w-[150px] px-3 py-3 text-right">Material margin</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                      No rows match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.variationJobId}
                      className="border-b border-border odd:bg-background even:bg-muted/25 transition-colors hover:bg-muted/40"
                    >
                      <td className="sticky left-0 z-10 border-r border-border bg-inherit px-3 py-2.5 align-top backdrop-blur-sm">
                        <p className="font-medium text-foreground">{row.customerName}</p>
                        <div className="mt-1 space-y-1 text-xs">
                          <p className="text-muted-foreground">
                            Parent:{' '}
                            <Link
                              href={`/customers/jobs/${row.parentJobId}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {row.parentJobNumber}
                            </Link>
                          </p>
                          <p className="text-muted-foreground">
                            Variation:{' '}
                            <Link
                              href={`/customers/jobs/${row.variationJobId}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {row.variationJobNumber}
                            </Link>
                          </p>
                          {row.variationDescription ? (
                            <p className="line-clamp-2 text-muted-foreground">{row.variationDescription}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">{jobStatusBadge(row.status)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.budgetMaterialQuantity)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatMoney(row.budgetMaterialCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.netMaterialQuantity)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatMoney(row.netMaterialCost)}</td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right tabular-nums',
                          row.materialCostVariance > 0.005
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {formatMoney(row.materialCostVariance)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right tabular-nums',
                          row.materialCostVariance > 0.005
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatPct(row.budgetVariancePct)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatMoney(row.unbudgetedMaterialCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatMoney(row.reconcileCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatMoney(row.variationJobWorkValue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.materialMarginAgainstVariationValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Use{' '}
        <Link href="/reports/supplier-traceability" className="font-medium text-primary underline-offset-4 hover:underline">
          supplier traceability
        </Link>{' '}
        for inbound-to-dispatch tracking,{' '}
        <Link href="/reports/stock-exceptions" className="font-medium text-primary underline-offset-4 hover:underline">
          stock exceptions
        </Link>{' '}
        for override and adjustment trails,{' '}
        <Link href="/reports/stock-adjustments" className="font-medium text-primary underline-offset-4 hover:underline">
          stock adjustments
        </Link>{' '}
        for manual correction value trail, and{' '}
        <Link href="/stock/integrity" className="font-medium text-primary underline-offset-4 hover:underline">
          Stock integrity
        </Link>{' '}
        if the numbers drift.
      </p>
    </div>
  );
}
