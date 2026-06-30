'use client';

import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import {
  type AttendanceRow,
  currentMonthValue,
  diffMinutes,
  formatDate,
  formatHours,
  formatTime,
  jobNumberLabel,
  MetricCard,
  monthBounds,
  statusTone,
  workLocationLabel,
} from './shared';

type AttendanceViewMode = 'table' | 'grid';

const VIEW_MODE_STORAGE_KEY = 'me-attendance-view-mode';

function attendanceRowMetrics(row: AttendanceRow) {
  const breakMinutes = diffMinutes(row.breakStartAt, row.breakEndAt);
  const workedMinutes = Math.max(0, diffMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
  return { breakMinutes, workedMinutes };
}

function initialViewMode(): AttendanceViewMode {
  if (typeof window === 'undefined') return 'table';
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  if (stored === 'table' || stored === 'grid') return stored;
  return window.matchMedia('(max-width: 767px)').matches ? 'grid' : 'table';
}

export default function MeAttendancePage() {
  const { data: session } = useSession();
  const [month, setMonth] = useState(() => currentMonthValue());
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AttendanceViewMode>('table');

  useEffect(() => {
    setViewMode(initialViewMode());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!session?.user?.linkedEmployeeId || !month) return;
      setLoading(true);
      setError(null);
      const { from, to } = monthBounds(month);
      const res = await fetch(`/api/me/attendance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (cancelled) return;

      if (!res.ok || !json?.success) {
        setError(json?.error ?? 'Could not load attendance.');
        setAttendanceRows([]);
      } else {
        setAttendanceRows((json.data as AttendanceRow[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [month, session?.user?.linkedEmployeeId]);

  const attendanceSummary = useMemo(() => {
    return attendanceRows.reduce(
      (acc, row) => {
        const breakMinutes = diffMinutes(row.breakStartAt, row.breakEndAt);
        const workedMinutes = Math.max(0, diffMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
        acc.days += 1;
        if (row.status === 'PRESENT') acc.present += 1;
        if (row.status === 'ABSENT') acc.absent += 1;
        if (row.status === 'LEAVE') acc.leave += 1;
        acc.workedMinutes += workedMinutes;
        acc.overtimeMinutes += row.overtimeMinutes ?? 0;
        return acc;
      },
      { days: 0, present: 0, absent: 0, leave: 0, workedMinutes: 0, overtimeMinutes: 0 }
    );
  }, [attendanceRows]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-white">My attendance</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Monthly attendance for your own employee record only.
            </p>
          </div>
          <label className="w-full shrink-0 text-sm font-medium text-slate-700 sm:max-w-[200px] dark:text-slate-300">
            <span className="mb-1.5 block">Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Attendance days" value={String(attendanceSummary.days)} />
          <MetricCard label="Present" value={String(attendanceSummary.present)} tone="emerald" />
          <MetricCard label="Absent" value={String(attendanceSummary.absent)} tone="rose" />
          <MetricCard label="Worked hours" value={formatHours(attendanceSummary.workedMinutes)} />
          <MetricCard label="Overtime" value={formatHours(attendanceSummary.overtimeMinutes)} tone="sky" />
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-5">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading attendance...</div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {error}
          </div>
        ) : attendanceRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No attendance entries were found for this month.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {attendanceRows.length} {attendanceRows.length === 1 ? 'entry' : 'entries'}
              </p>
              <AttendanceViewToggle viewMode={viewMode} onChange={setViewMode} />
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
                {attendanceRows.map((row) => (
                  <AttendanceGridCard key={`${row.workDate}-${row.id}`} row={row} />
                ))}
              </div>
            ) : (
              <AttendanceTableView rows={attendanceRows} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AttendanceViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: AttendanceViewMode;
  onChange: (mode: AttendanceViewMode) => void;
}) {
  return (
    <div
      className="flex w-full rounded-xl border border-slate-200 bg-slate-50 p-0.5 sm:inline-flex sm:w-auto dark:border-slate-700 dark:bg-slate-800/60"
      role="group"
      aria-label="Attendance view"
    >
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={viewMode === 'table'}
        aria-label="Table view"
        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition sm:flex-none sm:py-1.5 ${
          viewMode === 'table'
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        <Table2 className="size-3.5 shrink-0" />
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={viewMode === 'grid'}
        aria-label="Grid view"
        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition sm:flex-none sm:py-1.5 ${
          viewMode === 'grid'
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        <LayoutGrid className="size-3.5 shrink-0" />
        Grid
      </button>
    </div>
  );
}

function AttendanceTableView({ rows }: { rows: AttendanceRow[] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <AttendanceTableCompactRow key={`${row.workDate}-${row.id}`} row={row} />
        ))}
      </div>

      <div className="relative hidden min-w-0 md:block">
        <p className="mb-2 text-xs text-slate-500 lg:hidden dark:text-slate-400">Swipe horizontally to see all columns.</p>
        <div className="relative -mx-4 sm:-mx-5">
          <div className="overflow-x-auto overscroll-x-contain px-4 pb-1 sm:px-5 [scrollbar-width:thin]">
            <table className="min-w-[56rem] w-full divide-y divide-slate-200 text-sm dark:divide-slate-800 lg:min-w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/90">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:text-xs lg:tracking-[0.16em] dark:text-slate-400">
                  <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2.5 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.12)] lg:px-4 lg:py-3 dark:bg-slate-900/90 dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.35)]">
                    Date
                  </th>
                  <th className="hidden px-3 py-2.5 lg:table-cell lg:px-4 lg:py-3">Work location</th>
                  <th className="hidden px-3 py-2.5 xl:table-cell lg:px-4 lg:py-3">Job no</th>
                  <th className="whitespace-nowrap px-2 py-2.5 lg:px-4 lg:py-3">Duty in</th>
                  <th className="whitespace-nowrap px-2 py-2.5 lg:px-4 lg:py-3">Break out</th>
                  <th className="whitespace-nowrap px-2 py-2.5 lg:px-4 lg:py-3">Break in</th>
                  <th className="whitespace-nowrap px-2 py-2.5 lg:px-4 lg:py-3">Duty out</th>
                  <th className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell lg:px-4 lg:py-3">Break</th>
                  <th className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell lg:px-4 lg:py-3">Worked</th>
                  <th className="hidden whitespace-nowrap px-3 py-2.5 xl:table-cell lg:px-4 lg:py-3">OT</th>
                  <th className="sticky right-0 z-20 bg-slate-50 px-3 py-2.5 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.12)] lg:px-4 lg:py-3 dark:bg-slate-900/90 dark:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.35)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700 dark:divide-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                {rows.map((row) => (
                  <AttendanceTableRow key={`${row.workDate}-${row.id}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function AttendanceTableCompactRow({ row }: { row: AttendanceRow }) {
  const { breakMinutes, workedMinutes } = attendanceRowMetrics(row);
  const location = workLocationLabel(row);
  const jobNo = jobNumberLabel(row);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(row.workDate)}</p>
          {location !== '-' ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{location}</p>
          ) : null}
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <TimeField label="Duty in" value={formatTime(row.checkInAt)} />
        <TimeField label="Break out" value={formatTime(row.breakStartAt)} />
        <TimeField label="Break in" value={formatTime(row.breakEndAt)} />
        <TimeField label="Duty out" value={formatTime(row.checkOutAt)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
        {jobNo ? <span>Job {jobNo}</span> : null}
        <span>Break {breakMinutes ? formatHours(breakMinutes) : '-'}</span>
        <span>Worked {workedMinutes ? formatHours(workedMinutes) : '-'}</span>
        {(row.overtimeMinutes ?? 0) > 0 ? <span>OT {formatHours(row.overtimeMinutes ?? 0)}</span> : null}
      </div>
    </article>
  );
}

function AttendanceGridCard({ row }: { row: AttendanceRow }) {
  const { breakMinutes, workedMinutes } = attendanceRowMetrics(row);
  const location = workLocationLabel(row);

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(row.workDate)}</p>
          {location !== '-' ? (
            <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-600 sm:text-sm dark:text-slate-400">{location}</p>
          ) : null}
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <TimeField label="Duty in" value={formatTime(row.checkInAt)} />
        <TimeField label="Break out" value={formatTime(row.breakStartAt)} />
        <TimeField label="Break in" value={formatTime(row.breakEndAt)} />
        <TimeField label="Duty out" value={formatTime(row.checkOutAt)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 min-[480px]:grid-cols-4 dark:border-slate-700">
        <SummaryField label="Job no" value={jobNumberLabel(row) || '-'} />
        <SummaryField label="Break" value={breakMinutes ? formatHours(breakMinutes) : '-'} />
        <SummaryField label="Worked" value={workedMinutes ? formatHours(workedMinutes) : '-'} />
        <SummaryField label="Overtime" value={(row.overtimeMinutes ?? 0) > 0 ? formatHours(row.overtimeMinutes ?? 0) : '-'} />
      </div>
    </article>
  );
}

function AttendanceTableRow({ row }: { row: AttendanceRow }) {
  const { breakMinutes, workedMinutes } = attendanceRowMetrics(row);

  return (
    <tr className="group hover:bg-slate-50/80 dark:hover:bg-slate-900/50">
      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-medium text-slate-900 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] group-hover:bg-slate-50/80 lg:px-4 lg:py-3 dark:bg-slate-950/40 dark:text-white dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.3)] dark:group-hover:bg-slate-900/50">
        <span className="whitespace-nowrap">{formatDate(row.workDate)}</span>
      </td>
      <td className="hidden max-w-[12rem] truncate px-3 py-2.5 lg:table-cell lg:px-4 lg:py-3" title={workLocationLabel(row)}>
        {workLocationLabel(row)}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2.5 xl:table-cell lg:px-4 lg:py-3">{jobNumberLabel(row) || '-'}</td>
      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums lg:px-4 lg:py-3">{formatTime(row.checkInAt)}</td>
      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums lg:px-4 lg:py-3">{formatTime(row.breakStartAt)}</td>
      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums lg:px-4 lg:py-3">{formatTime(row.breakEndAt)}</td>
      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums lg:px-4 lg:py-3">{formatTime(row.checkOutAt)}</td>
      <td className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell lg:px-4 lg:py-3">{breakMinutes ? formatHours(breakMinutes) : '-'}</td>
      <td className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell lg:px-4 lg:py-3">{workedMinutes ? formatHours(workedMinutes) : '-'}</td>
      <td className="hidden whitespace-nowrap px-3 py-2.5 xl:table-cell lg:px-4 lg:py-3">
        {(row.overtimeMinutes ?? 0) > 0 ? formatHours(row.overtimeMinutes ?? 0) : '-'}
      </td>
      <td className="sticky right-0 z-10 bg-white px-3 py-2.5 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)] group-hover:bg-slate-50/80 lg:px-4 lg:py-3 dark:bg-slate-950/40 dark:shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.3)] dark:group-hover:bg-slate-900/50">
        <StatusBadge status={row.status} />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset sm:px-2.5 sm:py-1 sm:text-xs ${statusTone(status)}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function TimeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 sm:text-[11px] dark:text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 sm:text-[11px] dark:text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-slate-900 sm:text-sm dark:text-white">{value}</p>
    </div>
  );
}
