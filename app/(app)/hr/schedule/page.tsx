'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { cn } from '@/lib/utils';
import { useGetHrSchedulesForMonthQuery } from '@/store/api/endpoints/hr';

async function readApiEnvelope<T>(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as { success?: boolean; data?: T; error?: string };
  } catch {
    return null;
  }
}

function currentMonthYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function monthFromSearchParams(searchParams: URLSearchParams | null) {
  const raw = searchParams?.get('month')?.trim().slice(0, 7) ?? '';
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function workDateFromSearchParams(searchParams: URLSearchParams | null) {
  const raw = searchParams?.get('workDate')?.trim().slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function formatDateLabel(ymd: string) {
  try {
    return new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function formatMonthLabel(monthYmd: string) {
  try {
    const [year, month] = monthYmd.split('-');
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthYmd;
  }
}

function workflowBadgeClasses(row: {
  status: string;
  attendanceRows: number;
}) {
  const attendanceReady = row.attendanceRows > 0;
  if (row.status === 'LOCKED') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300';
  }
  if (row.status === 'PUBLISHED') {
    return attendanceReady
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300';
  }
  return 'border-border bg-muted/50 text-muted-foreground';
}

export default function HrScheduleListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedWorkDate = workDateFromSearchParams(searchParams);
  const linkedMonth = monthFromSearchParams(searchParams);
  const { data: session } = useSession();
  const [month, setMonth] = useState(() => linkedMonth || linkedWorkDate.slice(0, 7) || currentMonthYmd());
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDate, setCreateDate] = useState(todayYmd());
  const [creating, setCreating] = useState(false);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');

  useEffect(() => {
    if (linkedMonth) setMonth(linkedMonth);
    else if (linkedWorkDate) setMonth(linkedWorkDate.slice(0, 7));
  }, [linkedMonth, linkedWorkDate]);

  useEffect(() => {
    if (linkedWorkDate) setCreateDate(linkedWorkDate);
  }, [linkedWorkDate]);

  const {
    data: schedules = [],
    isLoading: loading,
    isFetching: refreshing,
    refetch,
  } = useGetHrSchedulesForMonthQuery({ month }, { skip: !canView });

  const openCreateModal = () => {
    setCreateDate(linkedWorkDate || todayYmd());
    setCreateModalOpen(true);
  };

  const createSchedule = async () => {
    const ymd = createDate.trim();
    if (!ymd) {
      toast.error('Choose a work date');
      return;
    }
    setCreating(true);
    const res = await fetch('/api/hr/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: ymd }),
    });
    const json = await readApiEnvelope<{ id: string; workDate: string }>(res);
    setCreating(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to create schedule');
      return;
    }
    toast.success('Schedule draft created');
    setCreateModalOpen(false);
    const createdMonth = ymd.slice(0, 7);
    if (createdMonth !== month) setMonth(createdMonth);
    await refetch();
    router.push(`/hr/schedule?workDate=${encodeURIComponent(ymd)}`);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view HR schedules.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR planning</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Schedule planning</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Day schedules for the selected month. Create a draft, plan teams, then hand off to attendance.
          </p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={openCreateModal}>
              Create schedule draft
            </Button>
          </div>
        ) : null}
      </header>

      {linkedWorkDate ? (
        <Alert className="border-cyan-500/30 bg-cyan-500/10">
          <AlertDescription className="text-cyan-950 dark:text-cyan-100">
            Linked to <strong>{formatDateLabel(linkedWorkDate)}</strong>. Open <strong>Plan</strong> on that row, or
            create a new draft for the date.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Schedule register</h2>
            <p className="text-sm text-muted-foreground">
              {schedules.length} schedule{schedules.length === 1 ? '' : 's'} in {formatMonthLabel(month)}
              {refreshing ? ' · refreshing…' : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
            <label htmlFor="schedule-list-month" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Month
            </label>
            <Input
              id="schedule-list-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 w-full min-w-42 sm:w-auto"
            />
          </div>
        </div>

        {loading && schedules.length === 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {['Date', 'Workflow', 'Teams', 'Absences', 'Attendance', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={6} />
              </tbody>
            </table>
          </div>
        ) : schedules.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No schedules for {formatMonthLabel(month)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workflow</th>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Teams</th>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Absences</th>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Attendance</th>
                  <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {schedules.map((row) => {
                  const workDateYmd = row.workDate.slice(0, 10);
                  const attendanceReady = row.attendanceRows > 0;
                  const isLinkedRow = linkedWorkDate === workDateYmd;
                  const workflowLabel =
                    row.status === 'LOCKED'
                      ? 'Locked'
                      : row.status === 'PUBLISHED'
                        ? attendanceReady
                          ? 'Published and handed to attendance'
                          : 'Published, waiting for attendance'
                        : 'Draft planning in progress';

                  return (
                    <tr
                      key={row.id}
                      className={cn('transition-colors hover:bg-muted/40', isLinkedRow && 'bg-muted/25')}
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => router.push(`/hr/schedule/${workDateYmd}`)}
                          className="text-left"
                        >
                          <p className="font-medium text-foreground">{formatDateLabel(workDateYmd)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{workDateYmd}</p>
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className={cn('font-medium', workflowBadgeClasses(row))}>
                          {row.status}
                        </Badge>
                        <p className="mt-2 text-xs text-muted-foreground">{workflowLabel}</p>
                      </td>
                      <td className="px-5 py-4 tabular-nums">{row._count.assignments}</td>
                      <td className="px-5 py-4 tabular-nums">{row._count.absences}</td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            attendanceReady
                              ? 'font-medium text-emerald-600 dark:text-emerald-300'
                              : 'font-medium text-amber-700 dark:text-amber-300'
                          }
                        >
                          {row.attendanceRows}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {attendanceReady ? 'Rows available' : 'Not generated yet'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() =>
                              window.open(
                                `/hr/schedule/${workDateYmd}`,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                          >
                            Build Plan
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create schedule draft"
        description="Choose the work date for the new schedule."
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="button" disabled={creating} onClick={() => void createSchedule()}>
              {creating ? 'Creating…' : 'Create draft'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label htmlFor="schedule-create-date" className="text-sm font-medium text-foreground">
            Work date
          </label>
          <Input
            id="schedule-create-date"
            type="date"
            value={createDate}
            onChange={(e) => setCreateDate(e.target.value)}
            className="h-11 w-full text-base sm:text-sm"
          />
        </div>
      </Modal>
    </div>
  );
}
