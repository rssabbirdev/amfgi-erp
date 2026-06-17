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
import { useGetHrAttendanceOverviewQuery } from '@/store/api/endpoints/hr';

function currentMonthYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthFromSearchParams(searchParams: URLSearchParams | null) {
  const raw = searchParams?.get('month')?.trim().slice(0, 7) ?? '';
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function toDateYmd(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDateLabel(value: string | Date) {
  const ymd = toDateYmd(value);
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function scheduleListHref(workDateYmd: string) {
  return `/hr/schedule?workDate=${encodeURIComponent(workDateYmd)}`;
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

async function fetchScheduleForDate(workDateYmd: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDateYmd)}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || !json?.success) return null;
  return json.data ?? null;
}

function AttendanceStatusBadge({ variant }: { variant: 'pending' | 'saved' }) {
  const className =
    variant === 'saved'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300';

  return (
    <Badge variant="outline" className={cn('font-medium text-[10px]', className)}>
      {variant === 'saved' ? 'Saved' : 'Needs attendance'}
    </Badge>
  );
}

const thClass =
  'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5';
const tdClass = 'px-4 py-3 align-middle text-sm text-foreground first:pl-5 last:pr-5';

export default function HrAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedMonth = monthFromSearchParams(searchParams);
  const { data: session } = useSession();
  const [month, setMonth] = useState(() => linkedMonth || currentMonthYmd());

  useEffect(() => {
    if (linkedMonth) setMonth(linkedMonth);
  }, [linkedMonth]);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(todayYmd());
  const [noScheduleDate, setNoScheduleDate] = useState<string | null>(null);
  const [checkingSchedule, setCheckingSchedule] = useState(false);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const canEdit = isSA || perms.includes('hr.attendance.edit');

  const {
    data: overview,
    isLoading: loading,
    isFetching: refreshing,
    refetch: refreshOverview,
  } = useGetHrAttendanceOverviewQuery({ month }, { skip: !canView });

  const goToAttendanceSheet = (dateYmd: string) => {
    router.push(`/hr/attendance/create?workDate=${encodeURIComponent(dateYmd)}`);
    setNoScheduleDate(null);
  };

  const openAttendanceSheetWithScheduleCheck = async (dateYmd: string) => {
    setCheckingSchedule(true);
    try {
      const schedule = await fetchScheduleForDate(dateYmd);
      if (!schedule) {
        setNoScheduleDate(dateYmd);
        return;
      }
      goToAttendanceSheet(dateYmd);
    } finally {
      setCheckingSchedule(false);
    }
  };

  const openCreateSheetPicker = () => {
    setPickerDate(todayYmd());
    setDatePickerOpen(true);
  };

  const confirmPickerDate = async () => {
    const ymd = pickerDate.trim();
    if (!ymd) {
      toast.error('Choose a work date');
      return;
    }
    setDatePickerOpen(false);
    await openAttendanceSheetWithScheduleCheck(ymd);
  };

  const deleteAttendanceByDate = async (dateYmd: string) => {
    if (!window.confirm(`Delete all attendance entries for ${dateYmd}?`)) return;
    setDeletingDate(dateYmd);
    const res = await fetch(`/api/hr/attendance?workDate=${encodeURIComponent(dateYmd)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Delete failed');
    } else {
      toast.success(`Deleted ${json.data?.deletedRows ?? 0} rows`);
      await refreshOverview();
    }
    setDeletingDate(null);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view HR attendance.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const monthStats = overview?.monthStats;
  const days = overview?.days ?? [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR attendance</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Attendance overview</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Pending published schedules and saved day sheets for the selected month.
          </p>
          {monthStats ? (
            <p className="text-xs text-muted-foreground">
              {monthStats.pendingScheduleDays} pending · {monthStats.fulfilledScheduleDays} completed ·{' '}
              {monthStats.attendanceRowCount} rows saved
              {refreshing ? ' · refreshing…' : ''}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={openCreateSheetPicker} disabled={checkingSchedule}>
              Create new sheet
            </Button>
          </div>
        ) : null}
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Attendance days</h2>
            <p className="text-sm text-muted-foreground">
              Needs attendance = published schedule with no rows yet. Saved = attendance already recorded.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
            <label htmlFor="attendance-overview-month" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Month
            </label>
            <Input
              id="attendance-overview-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 w-full min-w-42 sm:w-auto"
            />
          </div>
        </div>

        {loading && !overview ? (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className={thClass}>Work date</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Assignment groups</th>
                  <th className={thClass}>Attendance rows</th>
                  <th className={thClass}>Status</th>
                  <th className={cn(thClass, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={6} />
              </tbody>
            </table>
          </div>
        ) : days.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No pending schedules or saved attendance for {formatMonthLabel(month)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className={thClass}>Work date</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Assignment groups</th>
                  <th className={thClass}>Attendance rows</th>
                  <th className={thClass}>Status</th>
                  <th className={cn(thClass, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const dateYmd = toDateYmd(day.workDate);
                  const isPending = day.kind === 'pending';

                  return (
                    <tr
                      key={`${day.kind}-${dateYmd}`}
                      className="border-b border-border transition-colors hover:bg-muted/40"
                    >
                      <td className={cn(tdClass, 'font-medium')}>{formatDateLabel(dateYmd)}</td>
                      <td className={cn(tdClass, 'text-muted-foreground')}>
                        {isPending ? 'Schedule' : 'Day sheet'}
                      </td>
                      <td className={cn(tdClass, 'tabular-nums')}>
                        {isPending ? day.assignmentCount : '—'}
                      </td>
                      <td className={cn(tdClass, 'tabular-nums')}>
                        {isPending ? '—' : day.attendanceRows}
                      </td>
                      <td className={tdClass}>
                        <AttendanceStatusBadge variant={isPending ? 'pending' : 'saved'} />
                      </td>
                      <td className={cn(tdClass, 'text-right')}>
                        <div className="flex flex-wrap justify-end gap-2">
                          {isPending ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(scheduleListHref(dateYmd))}
                              >
                                Schedule
                              </Button>
                              {canEdit ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={checkingSchedule}
                                  onClick={() => void openAttendanceSheetWithScheduleCheck(dateYmd)}
                                >
                                  Open sheet
                                </Button>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={checkingSchedule}
                                onClick={() => void openAttendanceSheetWithScheduleCheck(dateYmd)}
                              >
                                Open sheet
                              </Button>
                              {canEdit ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={deletingDate === dateYmd}
                                  onClick={() => void deleteAttendanceByDate(dateYmd)}
                                >
                                  {deletingDate === dateYmd ? 'Deleting…' : 'Delete'}
                                </Button>
                              ) : null}
                            </>
                          )}
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
        isOpen={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        title="Create attendance sheet"
        description="Choose the work date for the new day sheet."
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setDatePickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={checkingSchedule} onClick={() => void confirmPickerDate()}>
              {checkingSchedule ? 'Checking…' : 'Continue'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label htmlFor="attendance-sheet-date" className="text-sm font-medium text-foreground">
            Work date
          </label>
          <Input
            id="attendance-sheet-date"
            type="date"
            value={pickerDate}
            onChange={(e) => setPickerDate(e.target.value)}
            className="h-11 w-full text-base sm:text-sm"
          />
        </div>
      </Modal>

      <Modal
        isOpen={noScheduleDate !== null}
        onClose={() => setNoScheduleDate(null)}
        title="No schedule for this date"
        description={
          noScheduleDate
            ? `No work schedule exists for ${formatDateLabel(noScheduleDate)}.`
            : undefined
        }
        size="sm"
        actions={
          noScheduleDate ? (
            <>
              <Button type="button" variant="outline" onClick={() => setNoScheduleDate(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const ymd = noScheduleDate;
                  setNoScheduleDate(null);
                  router.push(scheduleListHref(ymd));
                }}
              >
                <span className="sm:hidden">Create schedule</span>
                <span className="hidden sm:inline">Create schedule first</span>
              </Button>
              <Button type="button" onClick={() => goToAttendanceSheet(noScheduleDate)}>
                Continue anyway
              </Button>
            </>
          ) : null
        }
      >
        {noScheduleDate ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Assignment and absence data from a published schedule will not be pre-filled on the attendance sheet. Create
            a schedule for this date first, or continue with a blank sheet.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
