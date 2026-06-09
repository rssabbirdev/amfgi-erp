'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';

type AbsenceRow = { employeeId: string; reason?: string | null; notes?: string | null };

type LeaveOnDate = {
  id: string;
  leaveType: string;
  status: string;
  employee: { fullName: string; employeeCode: string };
};

type Props = {
  scheduleId: string | null;
  workDate: string;
  initialAbsences: AbsenceRow[];
  employees: Array<{ id: string; fullName: string; employeeCode: string }>;
  disabled?: boolean;
};

export default function ScheduleAbsencesPanel({
  scheduleId,
  workDate,
  initialAbsences,
  employees,
  disabled,
}: Props) {
  const [absentIds, setAbsentIds] = useState<Set<string>>(() => new Set(initialAbsences.map((a) => a.employeeId)));
  const [pickId, setPickId] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaveOnDate, setLeaveOnDate] = useState<LeaveOnDate[]>([]);

  useEffect(() => {
    if (!workDate) return;
    void fetch(`/api/hr/leave-requests?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) setLeaveOnDate((json.data as LeaveOnDate[]).filter((l) => l.status !== 'CANCELLED'));
      })
      .catch(() => setLeaveOnDate([]));
  }, [workDate]);

  useEffect(() => {
    setAbsentIds(new Set(initialAbsences.map((a) => a.employeeId)));
  }, [initialAbsences]);

  const items = useMemo(
    () =>
      employees
        .filter((e) => !absentIds.has(e.id))
        .map((e) => ({
          id: e.id,
          label: `${e.fullName} (${e.employeeCode})`,
          searchText: `${e.fullName} ${e.employeeCode}`,
        })),
    [employees, absentIds]
  );

  const absentList = useMemo(
    () => employees.filter((e) => absentIds.has(e.id)),
    [employees, absentIds]
  );

  const save = async () => {
    if (!scheduleId) return;
    setSaving(true);
    const res = await fetch(`/api/hr/schedule/${scheduleId}/absences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        absences: [...absentIds].map((employeeId) => ({
          employeeId,
          reason: 'ON_LEAVE',
        })),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save absences');
      return;
    }
    toast.success('Schedule absences saved');
  };

  return (
    <section className="w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-foreground">Day absences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mark employees on leave for this schedule date. Flows into attendance when you open the day sheet.
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {leaveOnDate.length > 0 ? (
          <div className="rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2">
            <p className="text-xs font-medium text-sky-900 dark:text-sky-200">Leave requests this date</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {leaveOnDate.map((lr) => (
                <li key={lr.id}>
                  {lr.employee.fullName} ({lr.employee.employeeCode}) — {lr.leaveType.replace('_', ' ')} ·{' '}
                  <span className="font-medium">{lr.status}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {absentList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No absences marked.</p>
          ) : (
            absentList.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs"
              >
                {e.fullName}
                {!disabled ? (
                  <button
                    type="button"
                    className="text-amber-900 hover:underline"
                    onClick={() =>
                      setAbsentIds((prev) => {
                        const next = new Set(prev);
                        next.delete(e.id);
                        return next;
                      })
                    }
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>
        {!disabled && scheduleId ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <SearchSelect
                items={items}
                value={pickId}
                onChange={setPickId}
                placeholder="Add absent employee…"
                minCharactersToSearch={0}
                openOnFocus
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pickId}
              onClick={() => {
                if (!pickId) return;
                setAbsentIds((prev) => new Set(prev).add(pickId));
                setPickId('');
              }}
            >
              Mark absent
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save absences'}
            </Button>
          </div>
        ) : (
          <p className={cn('text-xs text-muted-foreground')}>
            {!scheduleId ? 'Create or load the schedule first.' : 'Schedule is locked.'}
          </p>
        )}
      </div>
    </section>
  );
}
