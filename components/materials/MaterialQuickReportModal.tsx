'use client';

import { useEffect, useMemo, useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import {
  DATE_RANGE_PRESET_OPTIONS,
  getDateRangeForPreset,
  type DateRangePreset,
} from '@/lib/reports/dateRangePresets';
import { MATERIAL_TRANSACTION_REPORT_TYPE_OPTIONS } from '@/lib/materials/materialTransactionReport';
import { cn } from '@/lib/utils';
import { useLazyGetMaterialTransactionReportQuery } from '@/store/hooks';

type MaterialSummary = {
  id: string;
  name: string;
  unit: string;
  externalItemName?: string | null;
};

function defaultThisMonthRange() {
  return getDateRangeForPreset('this_month') ?? { from: '', to: '' };
}

function formatMoney(value: number, currencyCode = 'AED') {
  return `${currencyCode} ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

export default function MaterialQuickReportModal({
  material,
  isOpen,
  onClose,
  currencyCode = 'AED',
}: {
  material: MaterialSummary | null;
  isOpen: boolean;
  onClose: () => void;
  currencyCode?: string;
}) {
  const [trigger, { data, isFetching, isLoading, error }] = useLazyGetMaterialTransactionReportQuery();

  const initialRange = defaultThisMonthRange();
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [typeFilter, setTypeFilter] = useState<(typeof MATERIAL_TRANSACTION_REPORT_TYPE_OPTIONS)[number]['value']>('all');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !material) return;
    const range = defaultThisMonthRange();
    setDatePreset('this_month');
    setFrom(range.from);
    setTo(range.to);
    setTypeFilter('all');
    setHasGenerated(true);
    setSelectedRowId(null);
    void trigger({
      materialId: material.id,
      from: range.from || undefined,
      to: range.to || undefined,
    });
  }, [isOpen, material, trigger]);

  const dateRangeLabel = useMemo(() => {
    if (!from && !to) return 'All dates';
    if (from && to) return `${from} to ${to}`;
    if (from) return `From ${from}`;
    return `Until ${to}`;
  }, [from, to]);

  const applyPreset = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = getDateRangeForPreset(preset);
    if (!range) {
      setFrom('');
      setTo('');
      return;
    }
    setFrom(range.from);
    setTo(range.to);
  };

  const handleGenerate = async () => {
    if (!material) return;
    setHasGenerated(true);
    setSelectedRowId(null);
    await trigger({
      materialId: material.id,
      from: from || undefined,
      to: to || undefined,
    });
  };

  const rows = data?.rows ?? [];
  const filteredRows = useMemo(
    () => (typeFilter === 'all' ? rows : rows.filter((row) => row.kind === typeFilter)),
    [rows, typeFilter],
  );
  const loading = isFetching || isLoading;

  const openEntryLink = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={material ? `Quick report — ${material.name}` : 'Material quick report'}
      description={
        material
          ? `Stock movements for this item${material.externalItemName ? ` (${material.externalItemName})` : ''}.`
          : undefined
      }
      size="2xl"
      actions={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={!material || loading}>
            {loading ? 'Loading…' : hasGenerated ? 'Refresh' : 'Generate report'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date range
            </label>
            <Select
              value={datePreset}
              onChange={(event) => applyPreset(event.target.value as DateRangePreset)}
            >
              {DATE_RANGE_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="material-report-from" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              From
            </label>
            <Input
              id="material-report-from"
              type="date"
              value={from}
              onChange={(event) => {
                setDatePreset('custom');
                setFrom(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="material-report-to" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              To
            </label>
            <Input
              id="material-report-to"
              type="date"
              value={to}
              onChange={(event) => {
                setDatePreset('custom');
                setTo(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <Select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as (typeof MATERIAL_TRANSACTION_REPORT_TYPE_OPTIONS)[number]['value']);
                setSelectedRowId(null);
              }}
            >
              {MATERIAL_TRANSACTION_REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load material transactions.
          </div>
        ) : null}

        {loading && hasGenerated ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}

        {!hasGenerated ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
            Choose a date range, then generate the report to list transactions for this material.
          </div>
        ) : null}

        {hasGenerated && !loading ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {filteredRows.length} entr{filteredRows.length === 1 ? 'y' : 'ies'}
              {typeFilter !== 'all' ? ` (${typeFilter.replace('_', ' ')})` : ''} in {data?.dateRangeLabel ?? dateRangeLabel}.
            </p>
            {filteredRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                No entries found for this material in the selected range{typeFilter !== 'all' ? ' and type' : ''}.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Date
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Type
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Job #
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Party
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Qty
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const isSelected = selectedRowId === row.id;
                        return (
                        <tr
                          key={row.id}
                          className={cn(
                            'border-b border-border transition-colors',
                            isSelected
                              ? 'border-emerald-400/50 bg-emerald-50 hover:bg-emerald-100/70 dark:border-emerald-500/40 dark:bg-emerald-600/15 dark:hover:bg-emerald-600/20'
                              : 'hover:bg-muted/20',
                            row.href ? 'cursor-pointer' : '',
                          )}
                          onClick={() => setSelectedRowId(row.id)}
                          onDoubleClick={() => {
                            if (row.href) openEntryLink(row.href);
                          }}
                        >
                          <td className="px-3 py-2.5 whitespace-nowrap text-foreground">{row.date}</td>
                          <td className="px-3 py-2.5 text-foreground">{row.kindLabel}</td>
                          <td className="px-3 py-2.5 text-foreground">{row.jobNumber ?? '—'}</td>
                          <td className="px-3 py-2.5 text-foreground">{row.partyName ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                            {formatQty(row.quantity)} {row.unit}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                            {formatMoney(row.value, currencyCode)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Returns are rolled into dispatch and note quantities. Click to select a row; double-click to open the linked document in a new tab.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
