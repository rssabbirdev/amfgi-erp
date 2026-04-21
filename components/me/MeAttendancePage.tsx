'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function MeAttendancePage() {
  const { data: session } = useSession();
  const [month, setMonth] = useState(() => currentMonthValue());
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">My attendance</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Monthly attendance for your own employee record only.
            </p>
          </div>
          <label className="w-full max-w-[200px] text-sm font-medium text-slate-700 dark:text-slate-300">
            <span className="mb-1.5 block">Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Attendance days" value={String(attendanceSummary.days)} />
          <MetricCard label="Present" value={String(attendanceSummary.present)} tone="emerald" />
          <MetricCard label="Absent" value={String(attendanceSummary.absent)} tone="rose" />
          <MetricCard label="Worked hours" value={formatHours(attendanceSummary.workedMinutes)} />
          <MetricCard label="Overtime" value={formatHours(attendanceSummary.overtimeMinutes)} tone="sky" />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-5">
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
            <div className="grid gap-3 lg:hidden">
              {attendanceRows.map((row) => {
                const breakMinutes = diffMinutes(row.breakStartAt, row.breakEndAt);
                const workedMinutes = Math.max(0, diffMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
                return (
                  <article key={`${row.workDate}-${row.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(row.workDate)}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{workLocationLabel(row)}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(row.status)}`}>
                        {row.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MobileField label="Job no" value={jobNumberLabel(row) || '-'} />
                      <MobileField label="In / Out" value={`${formatTime(row.checkInAt)} / ${formatTime(row.checkOutAt)}`} />
                      <MobileField label="Break" value={breakMinutes ? formatHours(breakMinutes) : '-'} />
                      <MobileField label="Worked" value={workedMinutes ? formatHours(workedMinutes) : '-'} />
                      <MobileField label="Overtime" value={(row.overtimeMinutes ?? 0) > 0 ? formatHours(row.overtimeMinutes ?? 0) : '-'} />
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 lg:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/90">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Work location</th>
                      <th className="px-4 py-3">Job no</th>
                      <th className="px-4 py-3">In</th>
                      <th className="px-4 py-3">Out</th>
                      <th className="px-4 py-3">Break</th>
                      <th className="px-4 py-3">Worked</th>
                      <th className="px-4 py-3">OT</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700 dark:divide-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                    {attendanceRows.map((row) => {
                      const breakMinutes = diffMinutes(row.breakStartAt, row.breakEndAt);
                      const workedMinutes = Math.max(0, diffMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
                      return (
                        <tr key={`${row.workDate}-${row.id}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{formatDate(row.workDate)}</td>
                          <td className="px-4 py-3">{workLocationLabel(row)}</td>
                          <td className="px-4 py-3">{jobNumberLabel(row) || '-'}</td>
                          <td className="px-4 py-3">{formatTime(row.checkInAt)}</td>
                          <td className="px-4 py-3">{formatTime(row.checkOutAt)}</td>
                          <td className="px-4 py-3">{breakMinutes ? formatHours(breakMinutes) : '-'}</td>
                          <td className="px-4 py-3">{workedMinutes ? formatHours(workedMinutes) : '-'}</td>
                          <td className="px-4 py-3">{(row.overtimeMinutes ?? 0) > 0 ? formatHours(row.overtimeMinutes ?? 0) : '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(row.status)}`}>
                              {row.status.replaceAll('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
