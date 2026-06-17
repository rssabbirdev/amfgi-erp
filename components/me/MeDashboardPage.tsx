'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatHours, MetricCard } from '@/components/me/shared';
import { Badge } from '@/components/ui/shadcn/badge';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { readApiJson } from '@/lib/utils/readApiResponse';
import { cn } from '@/lib/utils';

type DashboardData = {
  employee: {
    fullName: string;
    preferredName: string | null;
    employeeCode: string;
    designation: string | null;
    department: string | null;
    status: string;
    onLeaveFrom: string | null;
  };
  leaveBalance: {
    year: number;
    entitlementDays: number;
    usedDays: number;
    adjustedDays: number;
    remainingDays: number;
  };
  leaveSummary: {
    pendingCount: number;
    approvedLeaveDaysYtd: number;
    activeApprovedLeave: {
      id: string;
      leaveType: string;
      startDate: string;
      endDate: string;
    } | null;
  };
  attendanceSummary: {
    month: string;
    days: number;
    present: number;
    absent: number;
    leave: number;
    workedMinutes: number;
    overtimeMinutes: number;
  };
  upcomingDocument: { name: string; expiryDate: string } | null;
  recentLeaveRequests: Array<{
    id: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    status: string;
    reason: string | null;
    reviewNote: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    submittedAt: string;
  }>;
};

function statusTone(status: string) {
  if (status === 'APPROVED') return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
  if (status === 'PENDING') return 'bg-amber-500/10 text-amber-800 dark:text-amber-300';
  if (status === 'REJECTED') return 'bg-red-500/10 text-red-800 dark:text-red-300';
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-300';
}

export default function MeDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await fetch('/api/me/dashboard', { cache: 'no-store' });
      const json = await readApiJson<DashboardData>(res);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? 'Could not load dashboard');
        setData(null);
      } else {
        setData(json.data as DashboardData);
        setError(null);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your dashboard…</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-red-600">{error ?? 'Dashboard unavailable'}</p>;
  }

  const displayName = data.employee.preferredName || data.employee.fullName;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300/80">
              Transparency dashboard
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {data.employee.employeeCode}
              {data.employee.designation ? ` · ${data.employee.designation}` : ''}
              {data.employee.department ? ` · ${data.employee.department}` : ''}
            </p>
            {data.employee.status === 'ON_LEAVE' ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                Profile status: On leave
                {data.employee.onLeaveFrom ? ` since ${data.employee.onLeaveFrom}` : ''}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/me/attendance" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Attendance
            </Link>
            <Link href="/me/leave" className={buttonVariants({ size: 'sm' })}>
              Leave requests
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={`Leave remaining (${data.leaveBalance.year})`}
            value={String(data.leaveBalance.remainingDays)}
            tone="emerald"
          />
          <MetricCard label="Leave used" value={String(data.leaveBalance.usedDays)} />
          <MetricCard label="Pending requests" value={String(data.leaveSummary.pendingCount)} tone="amber" />
          <MetricCard label="Approved leave days (YTD)" value={String(data.leaveSummary.approvedLeaveDaysYtd)} tone="sky" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Attendance this month ({data.attendanceSummary.month})
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Days recorded" value={String(data.attendanceSummary.days)} />
            <MetricCard label="Present" value={String(data.attendanceSummary.present)} tone="emerald" />
            <MetricCard label="Absent" value={String(data.attendanceSummary.absent)} tone="rose" />
            <MetricCard label="Worked hours" value={formatHours(data.attendanceSummary.workedMinutes)} />
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Daily absent rows during leave are tracked separately from approved leave assignments in HR.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Leave balance detail</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Entitled</dt>
              <dd className="font-medium tabular-nums">{data.leaveBalance.entitlementDays}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Adjusted</dt>
              <dd className="font-medium tabular-nums">{data.leaveBalance.adjustedDays}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Used (approved requests)</dt>
              <dd className="font-medium tabular-nums">{data.leaveBalance.usedDays}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
              <dt className="font-medium">Remaining</dt>
              <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {data.leaveBalance.remainingDays}
              </dd>
            </div>
          </dl>
          {data.leaveSummary.activeApprovedLeave ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <p className="font-medium text-emerald-800 dark:text-emerald-300">Active approved leave</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {data.leaveSummary.activeApprovedLeave.leaveType} ·{' '}
                {String(data.leaveSummary.activeApprovedLeave.startDate).slice(0, 10)} →{' '}
                {String(data.leaveSummary.activeApprovedLeave.endDate).slice(0, 10)}
              </p>
            </div>
          ) : null}
          {data.upcomingDocument ? (
            <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">Upcoming document expiry</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {data.upcomingDocument.name} · {String(data.upcomingDocument.expiryDate).slice(0, 10)}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent leave activity</h2>
          <Link href="/me/leave" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300">
            View all
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {data.recentLeaveRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No leave requests yet.</p>
          ) : (
            data.recentLeaveRequests.map((row) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {row.leaveType} · {String(row.startDate).slice(0, 10)}
                      {String(row.endDate).slice(0, 10) !== String(row.startDate).slice(0, 10)
                        ? ` → ${String(row.endDate).slice(0, 10)}`
                        : ''}
                    </p>
                    {row.reason ? <p className="mt-1 text-sm text-slate-500">{row.reason}</p> : null}
                    {row.reviewNote ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        HR note: {row.reviewNote}
                        {row.reviewedBy ? ` · ${row.reviewedBy}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <Badge className={cn('font-medium', statusTone(row.status))}>{row.status}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
