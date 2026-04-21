'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

type OverviewPayload = {
  selectedDay: {
    workDate: string;
    attendanceRows: number;
    hasAttendance: boolean;
    schedule: {
      id: string;
      workDate: string;
      title: string | null;
      clientDisplayName: string | null;
      status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
      publishedAt: string | null;
      lockedAt: string | null;
      needsAttendance: boolean;
      _count: {
        assignments: number;
        absences: number;
      };
    } | null;
  };
  monthStats: {
    month: string;
    publishedScheduleDays: number;
    fulfilledScheduleDays: number;
    pendingScheduleDays: number;
    attendanceRowCount: number;
  };
  pendingSchedules: Array<{
    id: string;
    workDate: string;
    title: string | null;
    assignmentCount: number;
    attendanceRows: number;
  }>;
  previousAttendanceDays: Array<{ workDate: string; rows: number }>;
};

function formatDateLabel(value: string) {
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function StatusPill({ status }: { status: 'DRAFT' | 'PUBLISHED' | 'LOCKED' }) {
  const toneClass =
    status === 'LOCKED'
      ? 'bg-amber-500/20 text-amber-300'
      : status === 'PUBLISHED'
        ? 'bg-emerald-500/20 text-emerald-300'
        : 'bg-slate-500/20 text-slate-300';

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${toneClass}`}>{status}</span>;
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint: string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const valueClass =
    tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-white';

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({ message, tone = 'default' }: { message: string; tone?: 'default' | 'emerald' }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm ${
        tone === 'emerald' ? 'text-emerald-400' : 'text-slate-500'
      }`}
    >
      {message}
    </div>
  );
}

export default function HrAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [workDate] = useState(searchParams.get('workDate') || todayYmd());
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [convertingScheduleId, setConvertingScheduleId] = useState<string | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const canEdit = isSA || perms.includes('hr.attendance.edit');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setLoading(true);
      const ovRes = await fetch(`/api/hr/attendance/overview?workDate=${encodeURIComponent(workDate)}`, {
        cache: 'no-store',
      });
      const ovJson = await ovRes.json();
      if (!cancelled && ovRes.ok && ovJson?.success) setOverview(ovJson.data);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, workDate]);

  const refreshOverview = async () => {
    const ovRes = await fetch(`/api/hr/attendance/overview?workDate=${encodeURIComponent(workDate)}`, {
      cache: 'no-store',
    });
    const ovJson = await ovRes.json();
    if (ovRes.ok && ovJson?.success) setOverview(ovJson.data);
  };

  const convertScheduleToAttendance = async (scheduleId: string) => {
    setConvertingScheduleId(scheduleId);
    const res = await fetch(`/api/hr/schedule/${scheduleId}/generate-attendance`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Failed to convert schedule');
    else {
      toast.success('Attendance generated from published schedule');
      const generatedDate =
        String(json?.data?.workDate ?? '').slice(0, 10) ||
        overview?.pendingSchedules.find((item) => item.id === scheduleId)?.workDate?.slice(0, 10) ||
        workDate;
      router.push(`/hr/attendance/create?workDate=${encodeURIComponent(generatedDate)}`);
    }
    setConvertingScheduleId(null);
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

  const selectedSchedule = overview?.selectedDay.schedule ?? null;
  const hasAttendance = overview?.selectedDay.hasAttendance ?? false;
  const nextPendingSchedule = overview?.pendingSchedules[0] ?? null;
  const nextPendingDate = nextPendingSchedule ? String(nextPendingSchedule.workDate).slice(0, 10) : null;

  const dayState = useMemo(() => {
    if (!selectedSchedule) {
      return {
        title: 'Schedule missing',
        description: 'Create the day schedule first, then return here to generate or review attendance.',
        tone: 'text-slate-300',
      };
    }
    if (selectedSchedule.status === 'DRAFT') {
      return {
        title: 'Planning still in draft',
        description: 'Teams and timing need to be finalized and published before attendance can be generated cleanly.',
        tone: 'text-amber-300',
      };
    }
    if (selectedSchedule.needsAttendance) {
      return {
        title: 'Ready for attendance generation',
        description: 'The schedule is published and waiting to be converted into attendance rows.',
        tone: 'text-emerald-300',
      };
    }
    return {
      title: 'Attendance already available',
      description: 'Rows exist for this date and can be reviewed, adjusted, or cleared if needed.',
      tone: 'text-emerald-300',
    };
  }, [selectedSchedule]);

  if (!canView) return <div className="text-slate-400">Forbidden</div>;

  return (
		<div className='space-y-6'>
			<section className='rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-sm'>
				<div className='flex flex-col gap-6'>
					<div className='max-w-3xl'>
						<p className='text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80'>
							HR Attendance
						</p>
						<h1 className='mt-2 text-3xl font-semibold text-white'>
							Attendance overview
						</h1>
						<p className='mt-3 text-sm leading-6 text-slate-400'>
							A clean control point for daily attendance
							generation, review, and corrections.
						</p>
					</div>
				</div>
			</section>

			{overview ? (
				<section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
					<SummaryCard
						label='Published schedules'
						value={overview.monthStats.publishedScheduleDays}
						hint='Days already planned and published this month'
					/>
					<SummaryCard
						label='Attendance completed'
						value={overview.monthStats.fulfilledScheduleDays}
						hint='Published days already converted to attendance'
						tone='emerald'
					/>
					<SummaryCard
						label='Waiting to convert'
						value={overview.monthStats.pendingScheduleDays}
						hint='Published days that still need attendance rows'
						tone='amber'
					/>
					<SummaryCard
						label='Rows this month'
						value={overview.monthStats.attendanceRowCount}
						hint='Saved attendance rows across the current month'
					/>
				</section>
			) : null}

			<section className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'>
				<Panel
					title='Next Pending Attendance'
					description='The next published schedule that still needs attendance rows, with the fastest action to move it forward.'
				>
					<div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]'>
						<div className='space-y-4'>
							<div className='rounded-2xl border border-white/10 bg-slate-950/50 p-4'>
								<div className='flex flex-wrap items-start justify-between gap-3'>
									<div>
										<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
											Next pending date
										</p>
										<h2 className='mt-2 text-xl font-semibold text-white'>
											{nextPendingDate
												? formatDateLabel(
														nextPendingDate,
													)
												: formatDateLabel(workDate)}
										</h2>
										<p
											className={`mt-2 text-sm font-medium ${nextPendingSchedule ? 'text-emerald-300' : dayState.tone}`}
										>
											{nextPendingSchedule
												? 'Ready for attendance generation'
												: dayState.title}
										</p>
										<p className='mt-2 text-sm leading-6 text-slate-400'>
											{nextPendingSchedule
												? 'This is the earliest published schedule still waiting to be converted into attendance rows.'
												: 'There are no pending published schedules right now, so you can review the currently selected date instead.'}
										</p>
									</div>
									{nextPendingSchedule ? (
										<StatusPill status='PUBLISHED' />
									) : selectedSchedule ? (
										<StatusPill
											status={selectedSchedule.status}
										/>
									) : null}
								</div>
							</div>

							<div className='grid gap-3 sm:grid-cols-3'>
								<div className='rounded-xl border border-white/10 bg-slate-950/50 p-4'>
									<p className='text-[11px] uppercase tracking-wide text-slate-500'>
										Groups planned
									</p>
									<p className='mt-2 text-2xl font-semibold text-white'>
										{nextPendingSchedule?.assignmentCount ??
											selectedSchedule?._count
												.assignments ??
											0}
									</p>
								</div>
								<div className='rounded-xl border border-white/10 bg-slate-950/50 p-4'>
									<p className='text-[11px] uppercase tracking-wide text-slate-500'>
										Pending published days
									</p>
									<p className='mt-2 text-2xl font-semibold text-amber-300'>
										{overview?.monthStats
											.pendingScheduleDays ?? 0}
									</p>
								</div>
								<div className='rounded-xl border border-white/10 bg-slate-950/50 p-4'>
									<p className='text-[11px] uppercase tracking-wide text-slate-500'>
										Existing rows
									</p>
									<p
										className={`mt-2 text-2xl font-semibold ${nextPendingSchedule ? 'text-amber-300' : hasAttendance ? 'text-emerald-300' : 'text-amber-300'}`}
									>
										{nextPendingSchedule?.attendanceRows ??
											overview?.selectedDay
												.attendanceRows ??
											0}
									</p>
								</div>
							</div>
						</div>

						<div className='rounded-2xl border border-white/10 bg-slate-950/50 p-4'>
							<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
								Next action
							</p>
							{nextPendingSchedule ? (
								<div className='mt-4 space-y-3'>
									<p className='text-sm text-slate-400'>
										Adjust timing or team if need to changes.
									</p>
									<Button
										type='button'
										fullWidth
										variant='outline'
										onClick={() =>
											router.push(
												`/hr/schedule/${nextPendingDate}`,
											)
										}
									>
										Open schedule
									</Button>
									{canEdit && (
										<Button
											type='button'
											fullWidth
											onClick={() =>
												convertScheduleToAttendance(
													nextPendingSchedule.id,
												)
											}
											loading={
												convertingScheduleId ===
												nextPendingSchedule.id
											}
										>
											Generate attendance
										</Button>
									)}
								</div>
							) : !selectedSchedule ? (
								<div className='mt-4 space-y-3'>
									<p className='text-sm text-slate-400'>
										Create the schedule first, then return
										here.
									</p>
									<Button
										type='button'
										fullWidth
										onClick={() =>
											router.push(
												`/hr/schedule/${workDate}`,
											)
										}
									>
										Create schedule
									</Button>
								</div>
							) : selectedSchedule.status === 'DRAFT' ? (
								<div className='mt-4 space-y-3'>
									<p className='text-sm text-slate-400'>
										Finish planning and publish the day.
									</p>
									<Button
										type='button'
										fullWidth
										variant='outline'
										onClick={() =>
											router.push(
												`/hr/schedule/${workDate}`,
											)
										}
									>
										Finish planning
									</Button>
								</div>
							) : selectedSchedule.needsAttendance ? (
								<div className='mt-4 space-y-3'>
									<p className='text-sm text-slate-400'>
										Generate attendance from the published
										schedule.
									</p>
									{canEdit && (
										<Button
											type='button'
											fullWidth
											onClick={() =>
												convertScheduleToAttendance(
													selectedSchedule.id,
												)
											}
											loading={
												convertingScheduleId ===
												selectedSchedule.id
											}
										>
											Generate attendance
										</Button>
									)}
									<Button
										type='button'
										fullWidth
										variant='outline'
										onClick={() =>
											router.push(
												`/hr/attendance/create?workDate=${encodeURIComponent(workDate)}`,
											)
										}
									>
										Open manual sheet
									</Button>
								</div>
							) : (
								<div className='mt-4 space-y-3'>
									<p className='text-sm text-slate-400'>
										Open the saved rows to review or correct
										the day.
									</p>
									<Button
										type='button'
										fullWidth
										onClick={() =>
											router.push(
												`/hr/attendance/create?workDate=${encodeURIComponent(workDate)}`,
											)
										}
									>
										Review rows
									</Button>
									{canEdit && (
										<Button
											type='button'
											fullWidth
											variant='danger'
											onClick={() =>
												deleteAttendanceByDate(workDate)
											}
											loading={deletingDate === workDate}
										>
											Clear this day
										</Button>
									)}
								</div>
							)}
						</div>
					</div>
				</Panel>

				<Panel
					title='Pending days'
					description='Published schedules that still need attendance rows.'
				>
					<div className='space-y-3'>
						{!overview ? (
							<EmptyState message='Loading pending days...' />
						) : overview.pendingSchedules.length === 0 ? (
							<EmptyState
								message='No pending published schedules.'
								tone='emerald'
							/>
						) : (
							overview.pendingSchedules.map((pending) => {
								const dateYmd = String(pending.workDate).slice(
									0,
									10,
								);
								return (
									<div
										key={pending.id}
										className='rounded-xl border border-white/10 bg-slate-950/55 p-4'
									>
										<div className='flex flex-wrap items-start justify-between gap-3'>
											<div>
												<p className='text-sm font-medium text-white'>
													{formatDateLabel(dateYmd)}
												</p>
												<p className='mt-1 text-xs text-slate-400'>
													{pending.assignmentCount}{' '}
													assignment groups
												</p>
											</div>
											<div className='flex gap-2'>
												<Button
													size='sm'
													variant='outline'
													onClick={() =>
														router.push(
															`/hr/schedule/${dateYmd}`,
														)
													}
												>
													Open
												</Button>
												{canEdit && (
													<Button
														size='sm'
														onClick={() =>
															convertScheduleToAttendance(
																pending.id,
															)
														}
														loading={
															convertingScheduleId ===
															pending.id
														}
													>
														Generate
													</Button>
												)}
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				</Panel>
			</section>

			<Panel
				title='Recent attendance days'
				description='Fast access to days that were already saved and may need follow-up changes.'
				action={
					canEdit ? (
						<Button
							type='button'
							variant='outline'
							onClick={() =>
								router.push(
									`/hr/attendance/create?workDate=${encodeURIComponent(workDate)}`,
								)
							}
						>
							Open current day
						</Button>
					) : null
				}
			>
				<div className='space-y-3'>
					{loading ? (
						<EmptyState message='Loading recent attendance days...' />
					) : !overview ||
					  overview.previousAttendanceDays.length === 0 ? (
						<EmptyState message='No previous attendance entries found.' />
					) : (
						overview.previousAttendanceDays.map((day) => {
							const dateYmd = String(day.workDate).slice(0, 10);
							return (
								<div
									key={dateYmd}
									className='rounded-xl border border-white/10 bg-slate-950/55 p-4'
								>
									<div className='flex flex-wrap items-center justify-between gap-3'>
										<div>
											<p className='text-sm font-medium text-white'>
												{formatDateLabel(dateYmd)}
											</p>
											<p className='mt-1 text-xs text-slate-400'>
												{day.rows} rows saved
											</p>
										</div>
										<div className='flex gap-2'>
											<Button
												size='sm'
												variant='secondary'
												onClick={() =>
													router.push(
														`/hr/attendance/create?workDate=${encodeURIComponent(dateYmd)}`,
													)
												}
											>
												Edit
											</Button>
											{canEdit && (
												<Button
													size='sm'
													variant='danger'
													onClick={() =>
														deleteAttendanceByDate(
															dateYmd,
														)
													}
													loading={
														deletingDate === dateYmd
													}
												>
													Delete
												</Button>
											)}
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</Panel>
		</div>
  );
}
