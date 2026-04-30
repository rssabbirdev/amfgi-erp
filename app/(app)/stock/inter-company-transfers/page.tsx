'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { useGetTransferLedgerQuery } from '@/store/hooks';
import type { TransferLedgerItem } from '@/store/api/endpoints/transactions';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}

export default function InterCompanyTransfersPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('transaction.transfer');

  const { data: transfers = [], isFetching } = useGetTransferLedgerQuery(undefined, {
    skip: !canView,
    refetchOnMountOrArgChange: 30,
  });

  const inboundCount = useMemo(
    () => transfers.filter((transfer) => transfer.direction === 'IN').length,
    [transfers]
  );
  const outboundCount = useMemo(
    () => transfers.filter((transfer) => transfer.direction === 'OUT').length,
    [transfers]
  );
  const movedQty = useMemo(
    () => transfers.reduce((sum, transfer) => sum + transfer.quantity, 0),
    [transfers]
  );
  const counterpartCoverage = useMemo(
    () => new Set(transfers.map((transfer) => transfer.counterpartCompanyName).filter(Boolean)).size,
    [transfers]
  );

  const columns: Column<TransferLedgerItem>[] = [
    {
      key: 'direction',
      header: 'Direction',
      sortable: true,
      render: (transfer) => (
        <span
          className={[
            'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
            transfer.direction === 'IN'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300',
          ].join(' ')}
        >
          {transfer.direction === 'IN' ? 'Inbound' : 'Outbound'}
        </span>
      ),
    },
    {
      key: 'materialName',
      header: 'Material',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[220px]">
          <div className="font-medium text-slate-900 dark:text-white">{transfer.materialName}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{transfer.unit}</div>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[110px] text-right font-mono text-sm text-slate-900 dark:text-white">
          {formatQty(transfer.quantity)}
        </div>
      ),
    },
    {
      key: 'counterpartCompanyName',
      header: 'Counterpart',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[180px] text-sm text-slate-700 dark:text-slate-300">
          {transfer.counterpartCompanyName || transfer.counterpartCompanySlug || '-'}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (transfer) => (
        <div className="min-w-[120px] text-sm text-slate-700 dark:text-slate-300">
          {formatDate(transfer.date)}
        </div>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (transfer) => (
        <div className="max-w-[320px] truncate text-sm text-slate-500 dark:text-slate-400">
          {transfer.notes || 'No note'}
        </div>
      ),
    },
  ];

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inter-company transfers</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            You do not have permission to view inter-company transfers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 dark:text-blue-300/80">
                Transfer Ledger
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Inter-company stock movement
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review incoming and outgoing company-to-company stock movement with material, quantity, counterpart, and date in one ledger.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/stock/inter-company-transfers/new">
                <Button>New multi transfer</Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Transfers logged', value: String(transfers.length), note: 'Inbound and outbound rows' },
            { label: 'Inbound rows', value: String(inboundCount), note: 'Received from other companies' },
            { label: 'Outbound rows', value: String(outboundCount), note: 'Sent to other companies' },
            { label: 'Counterpart companies', value: String(counterpartCoverage), note: `${formatQty(movedQty)} total units moved` },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-950/80">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
              Transfer rows
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Each row reflects one transfer transaction recorded for the active company.
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500">
            {isFetching ? 'Refreshing...' : `${transfers.length} rows`}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={transfers}
          loading={isFetching && transfers.length === 0}
          emptyText="No inter-company transfers found."
          searchKeys={['materialName', 'counterpartCompanyName', 'counterpartCompanySlug', 'notes']}
        />
      </section>
    </div>
  );
}
