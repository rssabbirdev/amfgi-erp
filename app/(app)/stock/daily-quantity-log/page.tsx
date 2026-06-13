'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { useGetDailyQuantityLogPendingPageQuery } from '@/store/hooks';

type RowStatus = 'PENDING' | 'FINALIZED';

type Row = {
  workDate: string;
  status: RowStatus;
  scheduleId: string | null;
  clientDisplayName: string | null;
  assignmentCount: number | null;
  submittedAt: string | Date | null;
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatLongDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(value: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DailyQuantityLogLandingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('job.view');
  const canEdit = isSA || perms.includes('job.edit');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_LIST_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<'ALL' | RowStatus>('ALL');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDate, setCreateDate] = useState(todayYmd());

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize]);

  const listOffset = (page - 1) * pageSize;
  const { data, isLoading, error } = useGetDailyQuantityLogPendingPageQuery(
    {
      limit: pageSize,
      offset: listOffset,
      status: statusFilter,
    },
    { skip: !canView },
  );

  const pageRows: Row[] = useMemo(
    () =>
      (data?.items ?? []).map((row) => ({
        workDate: row.workDate,
        status: row.status,
        scheduleId: row.scheduleId,
        clientDisplayName: row.clientDisplayName,
        assignmentCount: row.assignmentCount,
        submittedAt: row.submittedAt,
      })),
    [data?.items],
  );

  const totalRows = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const counts = data?.counts ?? { pending: 0, finalized: 0, total: 0 };
  const finalizedDates = data?.finalizedDates ?? [];

  const errorMessage = useMemo(() => {
    if (!error) return null;
    if (typeof error === 'object' && error !== null && 'data' in error) {
      const d = (error as { data?: { error?: unknown } }).data;
      if (d && typeof d.error === 'string') return d.error;
    }
    return 'Failed to load';
  }, [error]);

  const openDate = (ymd: string) => {
    router.push(`/stock/daily-quantity-log/${ymd}`);
  };

  const handleCreate = () => {
    if (!createDate || !/^\d{4}-\d{2}-\d{2}$/.test(createDate)) {
      toast.error('Pick a valid date');
      return;
    }
    const finalizedSet = new Set(finalizedDates);
    if (finalizedSet.has(createDate)) {
      toast(`That day is already finalized — opening in edit mode.`);
    }
    setCreateModalOpen(false);
    openDate(createDate);
  };

  const setFilter = (next: 'ALL' | RowStatus) => {
    setStatusFilter(next);
    setPage(1);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Production log</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to view jobs.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock workspace</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Production log</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            One <strong className="font-medium text-foreground">production log entry</strong> per calendar day. Open a{' '}
            <strong className="font-medium text-foreground">Pending</strong> day to record quantities, or a{' '}
            <strong className="font-medium text-foreground">Finalized</strong> day to adjust saved values. Finalized days
            cannot accept new progress lines.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setCreateDate(todayYmd());
              setCreateModalOpen(true);
            }}
          >
            + Create new
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <FilterChip label="All" count={counts.total} active={statusFilter === 'ALL'} onClick={() => setFilter('ALL')} />
        <FilterChip
          label="Pending"
          count={counts.pending}
          active={statusFilter === 'PENDING'}
          onClick={() => setFilter('PENDING')}
          tone="amber"
        />
        <FilterChip
          label="Finalized"
          count={counts.finalized}
          active={statusFilter === 'FINALIZED'}
          onClick={() => setFilter('FINALIZED')}
          tone="emerald"
        />
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
          <Spinner size="lg" />
        </div>
      ) : totalRows === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-semibold text-foreground">
            {statusFilter === 'PENDING'
              ? 'No pending days right now.'
              : statusFilter === 'FINALIZED'
                ? 'No finalized days yet.'
                : 'Nothing here yet.'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canEdit
              ? 'Use “Create new” above to open a date and start logging.'
              : 'Ask an admin to schedule work or finalize a production log entry.'}
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Schedule / details</Th>
                  <Th align="right">Jobs</Th>
                  <Th align="right">
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map((row) => (
                  <tr
                    key={`${row.status}-${row.workDate}-${row.scheduleId ?? 'fin'}`}
                    onClick={() => openDate(row.workDate)}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      {row.status === 'PENDING' ? (
                        <Badge label="Pending" variant="yellow" />
                      ) : (
                        <Badge label="Finalized" variant="green" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle">
                      <span className="font-semibold text-foreground">{formatLongDate(row.workDate)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{row.workDate}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {row.status === 'PENDING' ? (
                        <span className="text-sm text-foreground">
                          {row.clientDisplayName || 'Work schedule'}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Submitted {formatRelative(row.submittedAt)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                      {row.assignmentCount !== null ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                          {row.assignmentCount} {row.assignmentCount === 1 ? 'job' : 'jobs'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                      <span className="text-xs font-semibold text-primary">{row.status === 'PENDING' ? 'Open →' : 'Edit →'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DirectoryListPagination
            page={safePage}
            pageSize={pageSize}
            totalPages={totalPages}
            total={totalRows}
            pageStart={listOffset}
            pageEnd={listOffset + pageRows.length}
            pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </section>
      )}

      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create production log entry"
        size="sm"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleCreate}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pick a calendar date. We&apos;ll open the production log entry where you can add jobs and quantities. If the
            date is already finalized, you&apos;ll land in edit mode.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Work date
            <input
              type="date"
              value={createDate}
              onChange={(e) => setCreateDate(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone = 'slate',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'slate' | 'amber' | 'emerald';
}) {
  const toneActive: Record<typeof tone, string> = {
    slate: 'border-border bg-muted text-foreground',
    amber: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/60 dark:bg-amber-900/40 dark:text-amber-100',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-600/60 dark:bg-emerald-900/40 dark:text-emerald-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
        active
          ? toneActive[tone]
          : 'border-border bg-card text-foreground hover:bg-muted/50',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{count}</span>
    </button>
  );
}
