'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import SearchSelect from '@/components/ui/SearchSelect';
import toast from 'react-hot-toast';

interface EmployeeRow {
  id: string;
  fullName: string;
  preferredName: string | null;
  employeeCode: string;
  status?: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';
  basicHoursPerDay?: number;
  employeeType?: 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER';
  defaultTiming?: {
    dutyStart?: string;
    dutyEnd?: string;
    breakStart?: string;
    breakEnd?: string;
  } | null;
}

interface AssignmentRow {
  id: string;
  label: string;
  jobNumberSnapshot: string | null;
  siteNameSnapshot: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  breakWindow: string | null;
  teamLeaderEmployeeId?: string | null;
  driver1EmployeeId?: string | null;
  driver2EmployeeId?: string | null;
  members?: Array<{ employeeId?: string }>;
}

interface AttendanceDraftRow {
  employeeId: string;
  workAssignmentId: string;
  jobNumber: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY' | 'MISSING_PUNCH';
  checkInAt: string;
  checkOutAt: string;
  breakInAt: string;
  breakOutAt: string;
  source: 'existing' | 'schedule' | 'manual';
}

const EMPLOYEE_TYPE_ORDER: Record<NonNullable<EmployeeRow['employeeType']>, number> = {
  LABOUR_WORKER: 0,
  DRIVER: 1,
  HYBRID_STAFF: 2,
  OFFICE_STAFF: 3,
};

const EMPLOYEE_TYPE_ROW_TONE: Record<NonNullable<EmployeeRow['employeeType']>, string> = {
  LABOUR_WORKER: 'bg-emerald-600/18 hover:bg-emerald-600/24 dark:bg-emerald-500/[0.07] dark:hover:bg-emerald-500/[0.12]',
  DRIVER: 'bg-sky-600/18 hover:bg-sky-600/24 dark:bg-sky-500/[0.07] dark:hover:bg-sky-500/[0.12]',
  HYBRID_STAFF: 'bg-violet-600/18 hover:bg-violet-600/24 dark:bg-violet-500/[0.07] dark:hover:bg-violet-500/[0.12]',
  OFFICE_STAFF: 'bg-amber-500/18 hover:bg-amber-500/24 dark:bg-amber-500/[0.07] dark:hover:bg-amber-500/[0.12]',
};

interface SchedulePayload {
  id?: string;
  status?: string;
  title?: string | null;
  clientDisplayName?: string | null;
  assignments?: AssignmentRow[];
  absences?: Array<{ employee?: { id?: string } }>;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function toLocalTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function formatTimeForDisplay(timeVal: string): string {
  if (!/^\d{2}:\d{2}$/.test(timeVal)) return timeVal;
  const [hoursRaw, minutesRaw] = timeVal.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeVal;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function parseFlexibleTimeInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  const normalized = trimmed.replace(/\s+/g, '').replace(/\./g, ':');
  const meridiemMatch = normalized.match(/[ap]/);
  const meridiem = meridiemMatch?.[0] ?? null;
  const numericPart = normalized.replace(/[^0-9:]/g, '');
  if (!numericPart) return null;

  let hours: number | null = null;
  let minutes = 0;

  if (numericPart.includes(':')) {
    const [hourPart, minutePart] = numericPart.split(':');
    if (!hourPart || minutePart == null || minutePart === '') return null;
    hours = Number(hourPart);
    minutes = Number(minutePart);
  } else if (/^\d{3,4}$/.test(numericPart)) {
    const normalized = numericPart.padStart(4, '0');
    hours = Number(normalized.slice(0, 2));
    minutes = Number(normalized.slice(2, 4));
  } else if (/^\d{1,2}$/.test(numericPart)) {
    hours = Number(numericPart);
    minutes = 0;
  }

  if (hours == null || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    let hours24 = hours % 12;
    if (meridiem === 'p') hours24 += 12;
    return `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (numericPart.includes(':')) {
    if (hours < 0 || hours > 23) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (numericPart.length >= 3) {
    if (hours < 0 || hours > 23) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
}

function parseBreakWindow(raw: string | null | undefined): { breakInAt: string; breakOutAt: string } {
  if (!raw) return { breakInAt: '', breakOutAt: '' };
  const m = raw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
  if (!m) return { breakInAt: '', breakOutAt: '' };
  return { breakInAt: m[1].padStart(5, '0'), breakOutAt: m[2].padStart(5, '0') };
}

function combineDateAndTimeToIso(workDate: string, timeVal: string): string | null {
  if (!timeVal) return null;
  const d = new Date(`${workDate}T${timeVal}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function minutesFromTimeValue(timeVal: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(timeVal)) return null;
  const [hours, minutes] = timeVal.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function diffMinutes(start: string, end: string): number {
  const startMinutes = minutesFromTimeValue(start);
  const endMinutes = minutesFromTimeValue(end);
  if (startMinutes == null || endMinutes == null) return 0;
  if (endMinutes === startMinutes) return 0;
  return endMinutes > startMinutes ? endMinutes - startMinutes : 24 * 60 - startMinutes + endMinutes;
}

function calculateWorkedMinutes(draft: AttendanceDraftRow): number {
  if (draft.status === 'ABSENT' || draft.status === 'LEAVE') return 0;
  const dutyMinutes = diffMinutes(draft.checkInAt, draft.checkOutAt);
  const breakMinutes = diffMinutes(draft.breakInAt, draft.breakOutAt);
  return Math.max(0, dutyMinutes - breakMinutes);
}

function formatHourValue(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} h`;
}

function workedHourTone(minutes: number): string {
  const hours = minutes / 60;
  if (hours > 14) return 'bg-red-600/22 text-red-900 ring-1 ring-red-400/40 dark:bg-red-500/18 dark:text-red-100 dark:ring-red-400/30';
  if (hours > 12) return 'bg-amber-500/24 text-amber-950 ring-1 ring-amber-400/45 dark:bg-amber-500/18 dark:text-amber-100 dark:ring-amber-400/30';
  if (hours < 6) return 'bg-sky-500/22 text-sky-950 ring-1 ring-sky-400/45 dark:bg-sky-500/18 dark:text-sky-100 dark:ring-sky-400/30';
  return 'bg-transparent text-slate-900 dark:text-white';
}

function TimeEntryInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [rawValue, setRawValue] = useState(value ? formatTimeForDisplay(value) : '');
  const [isEditing, setIsEditing] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const displayValue = isEditing ? rawValue : value ? formatTimeForDisplay(value) : '';

  const commitValue = () => {
    const parsed = parseFlexibleTimeInput(rawValue);
    if (parsed == null) {
      if (rawValue.trim()) setIsInvalid(true);
      return;
    }
    setIsInvalid(false);
    setIsEditing(false);
    onChange(parsed);
    setRawValue(parsed ? formatTimeForDisplay(parsed) : '');
  };

  const inputClassName = [
    'w-full min-w-[88px] rounded-lg border px-2 py-1.5 text-[11px] outline-none transition-colors',
    isInvalid
      ? 'border-red-400 bg-red-50 text-red-900 ring-1 ring-red-300 dark:border-red-400 dark:bg-red-500/10 dark:text-red-100'
      : 'border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-white',
  ].join(' ');

  return (
    <input
      type="text"
      value={displayValue}
      disabled={disabled}
      placeholder="--:--"
      onFocus={(e) => {
        setRawValue(value ? formatTimeForDisplay(value) : '');
        setIsEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setRawValue(e.target.value);
        if (isInvalid) setIsInvalid(false);
      }}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitValue();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsInvalid(false);
          setIsEditing(false);
          setRawValue(value ? formatTimeForDisplay(value) : '');
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={inputClassName}
    />
  );
}

function employeeDisplayName(employee: EmployeeRow | undefined): string {
  return employee?.preferredName || employee?.fullName || '';
}

function employeeTypeSortValue(employee: EmployeeRow | undefined): number {
  const type = employee?.employeeType ?? 'LABOUR_WORKER';
  return EMPLOYEE_TYPE_ORDER[type];
}

function buildDraftFromDefaults(
  employee: EmployeeRow,
  assigned: AssignmentRow | undefined,
  absentEmployeeIds: Set<string>
): AttendanceDraftRow {
  const employeeType = employee.employeeType ?? 'LABOUR_WORKER';
  const defaultTiming = employee.defaultTiming ?? null;
  const scheduledBreak = parseBreakWindow(assigned?.breakWindow);

  if (assigned && absentEmployeeIds.has(employee.id)) {
    return {
      employeeId: employee.id,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: assigned?.jobNumberSnapshot ?? '',
      status: 'LEAVE',
      checkInAt: '',
      checkOutAt: '',
      breakInAt: '',
      breakOutAt: '',
      source: assigned ? 'schedule' : 'manual',
    };
  }

  if (employeeType === 'OFFICE_STAFF' || employeeType === 'DRIVER') {
    return {
      employeeId: employee.id,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: employeeType === 'DRIVER' ? assigned?.jobNumberSnapshot ?? '' : '',
      status: 'PRESENT',
      checkInAt: defaultTiming?.dutyStart || '',
      checkOutAt: defaultTiming?.dutyEnd || '',
      breakInAt: defaultTiming?.breakStart || '',
      breakOutAt: defaultTiming?.breakEnd || '',
      source: assigned ? 'schedule' : 'manual',
    };
  }

  if (employeeType === 'HYBRID_STAFF') {
    return {
      employeeId: employee.id,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: assigned?.jobNumberSnapshot ?? '',
      status: 'PRESENT',
      checkInAt: assigned?.shiftStart || defaultTiming?.dutyStart || '',
      checkOutAt: assigned?.shiftEnd || defaultTiming?.dutyEnd || '',
      breakInAt: assigned ? scheduledBreak.breakInAt : defaultTiming?.breakStart || '',
      breakOutAt: assigned ? scheduledBreak.breakOutAt : defaultTiming?.breakEnd || '',
      source: assigned ? 'schedule' : 'manual',
    };
  }

  return {
    employeeId: employee.id,
    workAssignmentId: assigned?.id ?? '',
    jobNumber: assigned?.jobNumberSnapshot ?? '',
    status: assigned ? 'PRESENT' : 'ABSENT',
    checkInAt: assigned?.shiftStart || '',
    checkOutAt: assigned?.shiftEnd || '',
    breakInAt: scheduledBreak.breakInAt,
    breakOutAt: scheduledBreak.breakOutAt,
    source: assigned ? 'schedule' : 'manual',
  };
}

function buildDraftFromExistingRow(
  employee: EmployeeRow,
  row: Record<string, unknown>
): AttendanceDraftRow {
  const existingAssignment = (row.workAssignment as Record<string, unknown> | null) ?? null;
  const scheduledBreak = parseBreakWindow((existingAssignment?.breakWindow as string | null | undefined) ?? undefined);
  const defaultTiming = employee.defaultTiming ?? null;
  const status = ((row.status as AttendanceDraftRow['status']) ?? 'PRESENT') as AttendanceDraftRow['status'];
  const shouldClearTiming = status === 'ABSENT' || status === 'LEAVE';

  return {
    employeeId: employee.id,
    workAssignmentId: String((existingAssignment?.id as string | undefined) ?? ''),
    jobNumber: String((existingAssignment?.jobNumberSnapshot as string | undefined) ?? ''),
    status,
    checkInAt: shouldClearTiming
      ? ''
      : toLocalTimeInput((row.checkInAt as string | null) ?? null) ||
        toLocalTimeInput((row.expectedShiftStart as string | null) ?? null) ||
        defaultTiming?.dutyStart ||
        '',
    checkOutAt: shouldClearTiming
      ? ''
      : toLocalTimeInput((row.checkOutAt as string | null) ?? null) ||
        toLocalTimeInput((row.expectedShiftEnd as string | null) ?? null) ||
        defaultTiming?.dutyEnd ||
        '',
    breakInAt: shouldClearTiming
      ? ''
      : toLocalTimeInput((row.breakStartAt as string | null) ?? null) ||
        scheduledBreak.breakInAt ||
        defaultTiming?.breakStart ||
        '',
    breakOutAt: shouldClearTiming
      ? ''
      : toLocalTimeInput((row.breakEndAt as string | null) ?? null) ||
        scheduledBreak.breakOutAt ||
        defaultTiming?.breakEnd ||
        '',
    source: 'existing',
  };
}

const STATUS_OPTIONS: Array<AttendanceDraftRow['status']> = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'MISSING_PUNCH'];

export default function AttendanceCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const initialDate = searchParams.get('workDate') || todayYmd();

  const [workDate, setWorkDate] = useState(initialDate);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [drafts, setDrafts] = useState<AttendanceDraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'assigned' | 'exceptions'>('all');
  const [insertEmployeeId, setInsertEmployeeId] = useState('');

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

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

      const [empRes, scheduleRes, attendanceRes] = await Promise.all([
        fetch('/api/hr/employees?status=ACTIVE', { cache: 'no-store' }),
        fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' }),
        fetch(`/api/hr/attendance?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' }),
      ]);
      const [empJson, scheduleJson, attendanceJson] = await Promise.all([
        empRes.json(),
        scheduleRes.json(),
        attendanceRes.json(),
      ]);
      if (cancelled) return;

      const activeEmployees: EmployeeRow[] = empRes.ok && empJson?.success ? empJson.data : [];
      const scheduleData: SchedulePayload | null = scheduleRes.ok && scheduleJson?.success ? scheduleJson.data : null;
      const asgs: AssignmentRow[] = Array.isArray(scheduleData?.assignments)
        ? scheduleData.assignments.map((assignment) => ({
            id: String(assignment.id),
            label: String(assignment.label ?? ''),
            jobNumberSnapshot: assignment.jobNumberSnapshot ?? null,
            siteNameSnapshot: assignment.siteNameSnapshot ?? null,
            shiftStart: assignment.shiftStart ?? null,
            shiftEnd: assignment.shiftEnd ?? null,
            breakWindow: assignment.breakWindow ?? null,
            teamLeaderEmployeeId: assignment.teamLeaderEmployeeId ?? null,
            driver1EmployeeId: assignment.driver1EmployeeId ?? null,
            driver2EmployeeId: assignment.driver2EmployeeId ?? null,
            members: Array.isArray(assignment.members) ? assignment.members : [],
          }))
        : [];

      setEmployees(activeEmployees);
      setAssignments(asgs);
      setSchedule(scheduleData);

      const existingByEmp = new Map<string, Record<string, unknown>>();
      const existingEmployees = new Map<string, EmployeeRow>();
      if (attendanceRes.ok && attendanceJson?.success && Array.isArray(attendanceJson.data)) {
        for (const row of attendanceJson.data as Array<Record<string, unknown>>) {
          const employee = (row.employee as Record<string, unknown> | null) ?? null;
          const employeeId = String((employee?.id as string | undefined) ?? '');
          if (!employeeId) continue;
          existingByEmp.set(employeeId, row);
          existingEmployees.set(employeeId, {
            id: employeeId,
            fullName: String((employee?.fullName as string | undefined) ?? ''),
            preferredName: (employee?.preferredName as string | null | undefined) ?? null,
            employeeCode: String((employee?.employeeCode as string | undefined) ?? ''),
            status: ((employee?.status as EmployeeRow['status'] | undefined) ?? 'ACTIVE'),
            employeeType: (employee?.employeeType as EmployeeRow['employeeType'] | undefined) ?? 'LABOUR_WORKER',
            basicHoursPerDay: Number((employee?.basicHoursPerDay as number | undefined) ?? 0) || undefined,
            defaultTiming: (employee?.defaultTiming as EmployeeRow['defaultTiming'] | undefined) ?? null,
          });
        }
      }

      const assignedByEmp = new Map<string, AssignmentRow[]>();
      for (const assignment of asgs) {
        const pushEmployee = (employeeId: string | null | undefined) => {
          if (!employeeId) return;
          const existing = assignedByEmp.get(employeeId) ?? [];
          if (existing.some((item) => item.id === assignment.id)) return;
          assignedByEmp.set(employeeId, [...existing, assignment]);
        };
        pushEmployee(assignment.teamLeaderEmployeeId);
        pushEmployee(assignment.driver1EmployeeId);
        pushEmployee(assignment.driver2EmployeeId);
        for (const member of assignment.members ?? []) {
          pushEmployee(member.employeeId ? String(member.employeeId) : '');
        }
      }

      const absentEmployeeIds = new Set(
        Array.isArray(scheduleData?.absences)
          ? scheduleData.absences
              .map((absence) => absence.employee?.id)
              .filter((employeeId): employeeId is string => Boolean(employeeId))
          : []
      );

      const nextEmployees = new Map<string, EmployeeRow>();
      for (const employee of activeEmployees) nextEmployees.set(employee.id, employee);
      for (const [employeeId, employee] of existingEmployees) nextEmployees.set(employeeId, employee);

      const hasExistingAttendance = existingByEmp.size > 0;
      const nextDrafts = hasExistingAttendance
        ? [...existingByEmp.entries()].map(([employeeId, row]) =>
            buildDraftFromExistingRow(nextEmployees.get(employeeId) ?? existingEmployees.get(employeeId)!, row)
          )
        : activeEmployees.map((employee) =>
            buildDraftFromDefaults(employee, assignedByEmp.get(employee.id)?.[0], absentEmployeeIds)
          );

      setEmployees([...nextEmployees.values()]);
      setDrafts(nextDrafts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, workDate]);

  const assignmentOptions = useMemo(
    () =>
      assignments.map((assignment) => ({
        value: assignment.id,
        label: assignment.jobNumberSnapshot || '',
        searchText: `${assignment.jobNumberSnapshot || ''} ${assignment.label} ${assignment.siteNameSnapshot || ''}`,
      })),
    [assignments]
  );

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const insertableEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.status === 'ACTIVE' && !drafts.some((draft) => draft.employeeId === employee.id))
        .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b), undefined, { sensitivity: 'base' })),
    [drafts, employees]
  );

  const stats = useMemo(() => {
    return drafts.reduce(
      (acc, row) => {
        const employee = employeeById.get(row.employeeId);
        const basicMinutes = Math.round((employee?.basicHoursPerDay ?? 0) * 60);
        const workedMinutes = calculateWorkedMinutes(row);
        acc.total += 1;
        if (row.workAssignmentId) acc.assigned += 1;
        if (row.source === 'existing') acc.existing += 1;
        if (row.status !== 'PRESENT') acc.exceptions += 1;
        acc.workedMinutes += workedMinutes;
        acc.overtimeMinutes += Math.max(0, workedMinutes - basicMinutes);
        return acc;
      },
      { total: 0, assigned: 0, existing: 0, exceptions: 0, workedMinutes: 0, overtimeMinutes: 0 }
    );
  }, [drafts, employeeById]);

  const visibleDrafts = useMemo(() => {
    return drafts
      .filter((draft) => {
        const employee = employeeById.get(draft.employeeId);
        const matchesSearch =
          !deferredSearch ||
          [
            employee?.fullName ?? '',
            employee?.preferredName ?? '',
            employee?.employeeCode ?? '',
            draft.jobNumber,
            draft.status,
          ]
            .join(' ')
            .toLowerCase()
            .includes(deferredSearch);
        if (!matchesSearch) return false;
        if (scopeFilter === 'assigned') return Boolean(draft.workAssignmentId);
        if (scopeFilter === 'exceptions') return draft.status !== 'PRESENT' || !draft.workAssignmentId;
        return true;
      })
      .sort((a, b) => {
        const employeeA = employeeById.get(a.employeeId);
        const employeeB = employeeById.get(b.employeeId);
        const typeDelta = employeeTypeSortValue(employeeA) - employeeTypeSortValue(employeeB);
        if (typeDelta !== 0) return typeDelta;
        return employeeDisplayName(employeeA).localeCompare(employeeDisplayName(employeeB), undefined, {
          sensitivity: 'base',
        });
      });
  }, [deferredSearch, drafts, employeeById, scopeFilter]);

  const updateDraft = (employeeId: string, patch: Partial<AttendanceDraftRow>) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.employeeId === employeeId
          ? (() => {
              const next: AttendanceDraftRow = {
                ...draft,
                ...patch,
                source: draft.source === 'existing' ? 'existing' : 'manual',
              };
              if (next.status === 'ABSENT' || next.status === 'LEAVE') {
                return {
                  ...next,
                  checkInAt: '',
                  checkOutAt: '',
                  breakInAt: '',
                  breakOutAt: '',
                };
              }
              return next;
            })()
          : draft
      )
    );
  };

  const onAssignmentChange = (employeeId: string, assignmentId: string) => {
    const employee = employeeById.get(employeeId);
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!employee) return;
    if (!assignment) {
      updateDraft(employeeId, {
        workAssignmentId: '',
        jobNumber: '',
        status: 'ABSENT',
        checkInAt: '',
        checkOutAt: '',
        breakInAt: '',
        breakOutAt: '',
        source: 'manual',
      });
      return;
    }
    const next = buildDraftFromDefaults(employee, assignment, new Set<string>());
    updateDraft(employeeId, next);
  };

  const insertEmployeeRow = () => {
    if (!insertEmployeeId) return;
    const employee = employeeById.get(insertEmployeeId);
    if (!employee || drafts.some((draft) => draft.employeeId === insertEmployeeId)) return;
    setDrafts((prev) => [...prev, buildDraftFromDefaults(employee, undefined, new Set<string>())]);
    setInsertEmployeeId('');
  };

  const saveAll = async () => {
    if (!canEdit) return;
    setSaving(true);
    const payload = {
      workDate,
      rows: drafts.map((draft) => ({
        employeeId: draft.employeeId,
        workAssignmentId: draft.workAssignmentId || null,
        status: draft.status,
        checkInAt: combineDateAndTimeToIso(workDate, draft.checkInAt),
        checkOutAt: combineDateAndTimeToIso(workDate, draft.checkOutAt),
        breakInAt: combineDateAndTimeToIso(workDate, draft.breakInAt),
        breakOutAt: combineDateAndTimeToIso(workDate, draft.breakOutAt),
      })),
    };
    const res = await fetch('/api/hr/attendance/bulk-upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save attendance');
      return;
    }
    toast.success(`Saved ${json.data?.affectedRows ?? 0} attendance rows`);
    router.push(`/hr/attendance?workDate=${encodeURIComponent(workDate)}`);
  };

  if (!canView) return <div className="text-slate-400">Forbidden</div>;
  if (loading) return <div className="text-slate-400">Loading...</div>;

  const handleWorkDateChange = (nextDate: string) => {
    setWorkDate(nextDate);
    router.replace(`/hr/attendance/create?workDate=${encodeURIComponent(nextDate)}`);
  };

  return (
		<div className='space-y-6'>
			<section className='rounded-3xl border border-white/10 bg-linear-to-br from-slate-950 via-slate-900 to-slate-900/80 p-6 shadow-2xl shadow-black/20'>
				<div className='flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between'>
					<div className='max-w-3xl'>
						<button
							type='button'
							onClick={() =>
								router.push(
									`/hr/attendance?workDate=${encodeURIComponent(workDate)}`,
								)
							}
							className='text-xs text-emerald-400 hover:text-emerald-300'
						>
							Back to attendance overview
						</button>
						<h1 className='mt-3 text-3xl font-semibold text-white'>
							Attendance day sheet
						</h1>
						<p className='mt-2 text-sm leading-6 text-slate-400'>
							The editor now preloads each employee from the
							selected schedule when available, so attendance can
							be reviewed as a continuation of planning instead of
							starting from a blank sheet.
						</p>
					</div>

					<div className='flex flex-wrap items-end gap-3'>
						<label className='text-sm text-slate-300'>
							<span className='mb-1 block text-xs uppercase tracking-wide text-slate-500'>
								Work date
							</span>
							<input
								type='date'
								value={workDate}
								onChange={(e) =>
									handleWorkDateChange(e.target.value)
								}
								className='rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white'
							/>
						</label>
						<Button
							type='button'
							variant='outline'
							onClick={() =>
								router.push(`/hr/schedule/${workDate}`)
							}
						>
							Open schedule
						</Button>
						{canEdit && (
							<Button
								type='button'
								onClick={saveAll}
								loading={saving}
							>
								Save attendance
							</Button>
						)}
					</div>
				</div>
			</section>

			<section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-6'>
				<div className='rounded-2xl border border-white/10 bg-slate-900/40 p-4'>
					<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
						Active employees
					</p>
					<p className='mt-2 text-2xl font-semibold text-white'>
						{stats.total}
					</p>
				</div>
				<div className='rounded-2xl border border-white/10 bg-slate-900/40 p-4'>
					<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
						Assigned from schedule
					</p>
					<p className='mt-2 text-2xl font-semibold text-emerald-300'>
						{stats.assigned}
					</p>
				</div>
				<div className='rounded-2xl border border-white/10 bg-slate-900/40 p-4'>
					<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
						Rows already existed
					</p>
					<p className='mt-2 text-2xl font-semibold text-white'>
						{stats.existing}
					</p>
				</div>
				<div className='rounded-2xl border border-white/10 bg-slate-900/40 p-4'>
					<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
						Exceptions to review
					</p>
					<p className='mt-2 text-2xl font-semibold text-amber-300'>
						{stats.exceptions}
					</p>
				</div>
				<div className='rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:col-span-2 xl:col-span-2'>
					<p className='text-[11px] uppercase tracking-[0.18em] text-slate-500'>
						Worked Hour Colors
					</p>
					<div className='mt-3 flex flex-wrap gap-2'>
						<span className='inline-flex rounded-full bg-sky-500/22 px-3 py-1 text-xs font-medium text-sky-950 ring-1 ring-sky-400/45 dark:bg-sky-500/18 dark:text-sky-100 dark:ring-sky-400/30'>
							Less than 6 h
						</span>
						<span className='inline-flex rounded-full bg-amber-500/24 px-3 py-1 text-xs font-medium text-amber-950 ring-1 ring-amber-400/45 dark:bg-amber-500/18 dark:text-amber-100 dark:ring-amber-400/30'>
							More than 12 h
						</span>
						<span className='inline-flex rounded-full bg-red-600/22 px-3 py-1 text-xs font-medium text-red-900 ring-1 ring-red-400/40 dark:bg-red-500/18 dark:text-red-100 dark:ring-red-400/30'>
							More than 14 h
						</span>
					</div>
					<p className='mt-3 text-xs text-slate-500'>
						Worked cells are highlighted automatically when a row
						falls into these review ranges.
					</p>
				</div>
			</section>

			<section className='rounded-2xl border border-white/10 bg-slate-900/40 p-5'>
				<div className='mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]'>
					<SearchSelect
						items={insertableEmployees.map((employee) => ({
							id: employee.id,
							label: employeeDisplayName(employee),
							searchText: `${employee.employeeCode} ${employee.fullName} ${employee.employeeType ?? ''}`,
						}))}
						value={insertEmployeeId}
						onChange={setInsertEmployeeId}
						placeholder='Insert new row for leftover employee'
						minCharactersToSearch={0}
						openOnFocus
					/>
					<Button
						type='button'
						variant='outline'
						onClick={insertEmployeeRow}
						disabled={!insertEmployeeId}
					>
						Insert row
					</Button>
				</div>
			</section>
			<section className='rounded-2xl border border-white/10 bg-slate-900/40 p-5'>
				<div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
					<div>
						<h2 className='text-lg font-semibold text-white'>
							Editing context
						</h2>
						<p className='mt-1 text-sm text-slate-400'>
							{schedule?.status
								? `Schedule status: ${schedule.status}`
								: 'No schedule created yet'}
						</p>
					</div>
					<div className='grid gap-3 sm:grid-cols-3'>
						<input
							type='search'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder='Search employee, code, job, or status'
							className='rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white sm:col-span-2'
						/>
						<select
							value={scopeFilter}
							onChange={(e) =>
								setScopeFilter(
									e.target.value as
										| 'all'
										| 'assigned'
										| 'exceptions',
								)
							}
							className='rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white'
						>
							<option value='all'>All employees</option>
							<option value='assigned'>Assigned only</option>
							<option value='exceptions'>Exceptions only</option>
						</select>
					</div>
				</div>
			</section>

			<div className='overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900/40'>
				<table className='w-full min-w-[1380px] text-left text-sm absolute'>
					<thead className='sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 text-xs uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/95'>
						<tr>
							<th className='px-4 py-3'>Employee</th>
							<th className='px-4 py-3'>Job Num</th>
							<th className='w-[104px] px-3 py-3'>Duty in</th>
							<th className='w-[104px] px-3 py-3'>Break out</th>
							<th className='w-[104px] px-3 py-3'>Break in</th>
							<th className='w-[104px] px-3 py-3'>Duty out</th>
							<th className='px-4 py-3'>Basic Hr</th>
							<th className='px-4 py-3'>Total Hr</th>
							<th className='px-4 py-3'>Overtime</th>
							<th className='px-4 py-3'>Status</th>
						</tr>
					</thead>
					<tbody className='divide-y divide-slate-200/70 text-slate-700 dark:divide-white/5 dark:text-slate-200'>
						{visibleDrafts.length === 0 ? (
							<tr>
								<td
									colSpan={10}
									className='px-4 py-10 text-center text-slate-500'
								>
									No employees match the current filters.
								</td>
							</tr>
						) : (
							visibleDrafts.map((draft) => {
								const employee = employeeById.get(
									draft.employeeId,
								);
								const basicMinutes = Math.round(
									(employee?.basicHoursPerDay ?? 0) * 60,
								);
								const workedMinutes =
									calculateWorkedMinutes(draft);
								const overtimeMinutes =
									draft.status === 'ABSENT' ||
									draft.status === 'LEAVE'
										? 0
										: Math.max(
												0,
												workedMinutes - basicMinutes,
											);
								const sourceTone =
									draft.source === 'existing'
										? 'bg-emerald-500/15 text-emerald-300'
										: draft.source === 'schedule'
											? 'bg-cyan-500/15 text-cyan-300'
											: 'bg-slate-500/15 text-slate-300';
								const employeeType =
									employee?.employeeType ?? 'LABOUR_WORKER';
								const rowTone =
									EMPLOYEE_TYPE_ROW_TONE[employeeType];

								return (
									<tr
										key={draft.employeeId}
										className={[
											'border border-white dark:border-white/10',
											draft.status === 'ABSENT'
												? 'bg-red-600/20 hover:bg-red-600/26 dark:bg-red-500/18 dark:hover:bg-red-500/24'
												: rowTone,
										].join(' ')}
									>
										<td className='px-4 py-3'>
											<p className='font-medium text-slate-900 dark:text-white'>
												{employee?.preferredName ||
													employee?.fullName ||
													'Unknown employee'}
											</p>
											<div className='mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500'>
												<span>
													{employee?.employeeCode ||
														''}
												</span>
												{employee?.status &&
												employee.status !== 'ACTIVE' ? (
													<span className='rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-700 dark:text-amber-300'>
														{employee.status.replace(
															'_',
															' ',
														)}
													</span>
												) : null}
												<span
													className={`rounded-full px-2 py-0.5 ${sourceTone}`}
												>
													{draft.source}
												</span>
											</div>
										</td>
										<td className='px-4 py-3'>
											<SearchSelect
												items={[
													{
														id: '',
														label: '',
														searchText: '',
													},
													...assignmentOptions.map(
														(option) => ({
															id: option.value,
															label: option.label,
															searchText:
																option.searchText,
														}),
													),
												]}
												value={draft.workAssignmentId}
												onChange={(value) =>
													onAssignmentChange(
														draft.employeeId,
														value,
													)
												}
												onBlurInputValue={(value) => {
													if (value.trim() === '') {
														onAssignmentChange(
															draft.employeeId,
															'',
														);
													}
												}}
												placeholder='Search job num'
												disabled={!canEdit}
												openOnFocus
												minCharactersToSearch={0}
											/>
										</td>
										<td className='px-3 py-2'>
											<TimeEntryInput
												value={draft.checkInAt}
												onChange={(value) =>
													updateDraft(
														draft.employeeId,
														{ checkInAt: value },
													)
												}
												disabled={!canEdit}
											/>
										</td>
										<td className='px-3 py-2'>
											<TimeEntryInput
												value={draft.breakInAt}
												onChange={(value) =>
													updateDraft(
														draft.employeeId,
														{ breakInAt: value },
													)
												}
												disabled={!canEdit}
											/>
										</td>
										<td className='px-3 py-2'>
											<TimeEntryInput
												value={draft.breakOutAt}
												onChange={(value) =>
													updateDraft(
														draft.employeeId,
														{ breakOutAt: value },
													)
												}
												disabled={!canEdit}
											/>
										</td>
										<td className='px-3 py-2'>
											<TimeEntryInput
												value={draft.checkOutAt}
												onChange={(value) =>
													updateDraft(
														draft.employeeId,
														{ checkOutAt: value },
													)
												}
												disabled={!canEdit}
											/>
										</td>
										<td className='px-4 py-3'>
											<div className='text-sm text-slate-800 dark:text-slate-200'>
												{formatHourValue(basicMinutes)}
											</div>
										</td>
										<td className='px-4 py-3'>
											<div
												className={`inline-flex rounded-lg px-2.5 py-1 text-sm font-medium ${workedHourTone(workedMinutes)}`}
											>
												{formatHourValue(workedMinutes)}
											</div>
										</td>
										<td className='px-4 py-3'>
											<div
												className={`text-sm font-medium ${overtimeMinutes > 0 ? 'text-emerald-300' : 'text-slate-300'}`}
											>
												{formatHourValue(
													overtimeMinutes,
												)}
											</div>
										</td>
										<td className='px-4 py-3'>
											<select
												value={draft.status}
												onChange={(e) =>
													updateDraft(
														draft.employeeId,
														{
															status: e.target
																.value as AttendanceDraftRow['status'],
														},
													)
												}
												disabled={!canEdit}
												className='w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-white'
											>
												{STATUS_OPTIONS.map(
													(status) => (
														<option
															key={status}
															value={status}
														>
															{status}
														</option>
													),
												)}
											</select>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</div>
  );
}
