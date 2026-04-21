'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface ScheduleRow {
  id: string;
  workDate: string;
  status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
  createdAt: string;
  publishedAt: string | null;
  lockedAt: string | null;
  attendanceRows: number;
  _count: {
    assignments: number;
    absences: number;
  };
}

async function readApiEnvelope<T>(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as { success?: boolean; data?: T; error?: string };
  } catch {
    return null;
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : 'text-white';

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function HrScheduleListPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newDate, setNewDate] = useState(todayYmd);
  const [search, setSearch] = useState('');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');

  useEffect(() => {
    if (!canView) return;

    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetch('/api/hr/schedule', { cache: 'no-store' });
      const json = await readApiEnvelope<ScheduleRow[]>(res);
      if (!cancelled && res.ok && json?.success) setRows(json.data ?? []);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [canView]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.workDate, row.status]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    const today = todayYmd();
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === 'DRAFT') acc.draft += 1;
        if (row.status === 'PUBLISHED') acc.published += 1;
        if (row.status === 'LOCKED') acc.locked += 1;
        if (row.status === 'PUBLISHED' && row.attendanceRows === 0 && row.workDate.slice(0, 10) <= today) {
          acc.pendingAttendance += 1;
        }
        return acc;
      },
      { total: 0, draft: 0, published: 0, locked: 0, pendingAttendance: 0 }
    );
  }, [rows]);

  const createSchedule = async () => {
    if (!newDate) return;
    setCreating(true);
    const res = await fetch('/api/hr/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: newDate }),
    });
    const json = await readApiEnvelope<{ id: string; workDate: string }>(res);
    setCreating(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to create schedule');
      return;
    }
    toast.success('Schedule draft created');
    router.push(`/hr/schedule/${newDate}`);
  };

  if (!canView) return <div className="text-slate-400">Forbidden</div>;
  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl shadow-black/10">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_38%)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">HR Planning</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Schedule planning</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Create the day schedule, assign teams and drivers, then hand it off cleanly into attendance.
            </p>
          </div>

          {canEdit && (
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-sm xl:min-w-[22rem]">
              <label className="text-sm text-slate-300">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Work date</span>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setNewDate(todayYmd())}
                  className="text-xs text-emerald-400 transition-colors hover:text-emerald-300"
                >
                  Use today
                </button>
                <Button onClick={createSchedule} disabled={creating || !newDate} loading={creating}>
                  Create schedule draft
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total schedules" value={summary.total} />
        <StatCard label="Drafts" value={summary.draft} />
        <StatCard label="Published" value={summary.published} tone="emerald" />
        <StatCard label="Locked" value={summary.locked} />
        <StatCard label="Needs attendance" value={summary.pendingAttendance} tone="amber" />
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40">
        <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Schedule register</h2>
            <p className="text-sm text-slate-400">Recent days with planning progress and attendance handoff status.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date or status"
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white lg:max-w-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-white/10 bg-slate-950/50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Workflow</th>
                <th className="px-5 py-3">Teams</th>
                <th className="px-5 py-3">Absences</th>
                <th className="px-5 py-3">Attendance</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                    No schedules match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const workDateYmd = row.workDate.slice(0, 10);
                  const attendanceReady = row.attendanceRows > 0;
                  const workflowLabel =
                    row.status === 'LOCKED'
                      ? 'Locked'
                      : row.status === 'PUBLISHED'
                        ? attendanceReady
                          ? 'Published and handed to attendance'
                          : 'Published, waiting for attendance'
                        : 'Draft planning in progress';

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-white/5">
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => router.push(`/hr/schedule/${workDateYmd}`)}
                          className="text-left"
                        >
                          <p className="font-medium text-white">{formatDateLabel(row.workDate)}</p>
                          <p className="mt-1 text-xs text-slate-500">{workDateYmd}</p>
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={[
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            row.status === 'LOCKED'
                              ? 'bg-amber-500/20 text-amber-300'
                              : row.status === 'PUBLISHED'
                                ? attendanceReady
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-cyan-500/20 text-cyan-300'
                                : 'bg-slate-500/20 text-slate-300',
                          ].join(' ')}
                        >
                          {row.status}
                        </span>
                        <p className="mt-2 text-xs text-slate-400">{workflowLabel}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-300">{row._count.assignments}</td>
                      <td className="px-5 py-4 text-slate-300">{row._count.absences}</td>
                      <td className="px-5 py-4">
                        <span className={attendanceReady ? 'text-emerald-300' : 'text-amber-300'}>
                          {row.attendanceRows}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          {attendanceReady ? 'Rows available' : 'Not generated yet'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/hr/schedule/${workDateYmd}`)}
                          >
                            Plan
                          </Button>
                          <Button
                            size="sm"
                            variant={attendanceReady ? 'secondary' : 'primary'}
                            onClick={() => router.push(`/hr/attendance?workDate=${encodeURIComponent(workDateYmd)}`)}
                          >
                            {attendanceReady ? 'Attendance' : 'Create attendance'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
