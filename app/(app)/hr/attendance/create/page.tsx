'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AttendanceEntryGrid, {
  type AttendanceGridDraftRow,
  type AttendanceGridEmployee,
} from '@/components/hr/AttendanceEntryGrid';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
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
  customerName: string | null;
  siteName: string | null;
  projectDetails: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  breakWindow: string | null;
  teamLeaderEmployeeId?: string | null;
  driver1EmployeeId?: string | null;
  driver2EmployeeId?: string | null;
  members?: Array<{ employeeId?: string }>;
}

function assignmentFromScheduleRaw(
  raw: Record<string, unknown>,
  scheduleClientDisplayName?: string | null
): AssignmentRow {
  const job = (raw.job as Record<string, unknown> | null) ?? null;
  const customer = (job?.customer as Record<string, unknown> | null) ?? null;
  const customerName =
    String(raw.clientNameSnapshot ?? '').trim() ||
    String(customer?.name ?? '').trim() ||
    String(scheduleClientDisplayName ?? '').trim() ||
    null;
  const siteName = String(raw.siteNameSnapshot ?? '').trim() || String(job?.site ?? '').trim() || null;
  const projectDetails =
    String(raw.projectDetailsSnapshot ?? '').trim() || String(job?.projectDetails ?? '').trim() || null;
  const jobNumber =
    String(raw.jobNumberSnapshot ?? '').trim() || String(job?.jobNumber ?? '').trim() || null;

  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    jobNumberSnapshot: jobNumber,
    siteNameSnapshot: raw.siteNameSnapshot != null ? String(raw.siteNameSnapshot) : null,
    customerName,
    siteName,
    projectDetails,
    shiftStart: (raw.shiftStart as string | null | undefined) ?? null,
    shiftEnd: (raw.shiftEnd as string | null | undefined) ?? null,
    breakWindow: (raw.breakWindow as string | null | undefined) ?? null,
    teamLeaderEmployeeId: (raw.teamLeaderEmployeeId as string | null | undefined) ?? null,
    driver1EmployeeId: (raw.driver1EmployeeId as string | null | undefined) ?? null,
    driver2EmployeeId: (raw.driver2EmployeeId as string | null | undefined) ?? null,
    members: Array.isArray(raw.members) ? (raw.members as AssignmentRow['members']) : [],
  };
}

function assignmentFromAttendanceWorkAssignment(raw: Record<string, unknown>): AssignmentRow {
  const costing = (raw.costingSnapshot as Record<string, unknown> | null) ?? null;
  const customerName =
    String(costing?.customerName ?? raw.clientNameSnapshot ?? '').trim() || null;
  const siteName = String(costing?.siteName ?? raw.siteNameSnapshot ?? '').trim() || null;
  const projectDetails =
    String(costing?.projectDetails ?? raw.projectDetailsSnapshot ?? '').trim() || null;
  const jobNumber = String(costing?.jobNumber ?? raw.jobNumberSnapshot ?? '').trim() || null;

  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    jobNumberSnapshot: jobNumber,
    siteNameSnapshot: raw.siteNameSnapshot != null ? String(raw.siteNameSnapshot) : null,
    customerName,
    siteName,
    projectDetails,
    shiftStart: (raw.shiftStart as string | null | undefined) ?? null,
    shiftEnd: (raw.shiftEnd as string | null | undefined) ?? null,
    breakWindow: (raw.breakWindow as string | null | undefined) ?? null,
    teamLeaderEmployeeId: null,
    driver1EmployeeId: null,
    driver2EmployeeId: null,
    members: [],
  };
}

type AttendanceDraftRow = AttendanceGridDraftRow;

const EMPLOYEE_TYPE_ORDER: Record<NonNullable<EmployeeRow['employeeType']>, number> = {
  LABOUR_WORKER: 0,
  DRIVER: 1,
  HYBRID_STAFF: 2,
  OFFICE_STAFF: 3,
};

interface SchedulePayload {
  id?: string;
  status?: string;
  clientDisplayName?: string | null;
  assignments?: AssignmentRow[];
  absences?: Array<{ employee?: { id?: string } }>;
}

function scheduleStatusBadgeProps(status: string | undefined) {
  if (!status) {
    return {
      label: 'No schedule',
      className:
        'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100',
    };
  }
  if (status === 'PUBLISHED') {
    return {
      label: 'Published',
      className:
        'border-emerald-600/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100',
    };
  }
  if (status === 'LOCKED') {
    return {
      label: 'Locked',
      className: 'border-border bg-muted text-foreground',
    };
  }
  return {
    label: 'Draft',
    className:
      'border-sky-600/40 bg-sky-500/15 text-sky-950 dark:text-sky-100',
  };
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatWorkDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function cloneDraftRows(rows: AttendanceDraftRow[]): AttendanceDraftRow[] {
  return rows.map((row) => ({ ...row }));
}

const TOOLBAR_TAG_CLASS =
  'inline-flex h-auto shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-medium leading-none tracking-wide transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const DAY_SHEET_FIELD_CLASS =
  'h-7 min-h-7 rounded-md border border-border bg-background px-2 py-0 text-xs leading-7 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

function applyAbsentToDraft(draft: AttendanceDraftRow): AttendanceDraftRow {
  return {
    ...draft,
    status: 'ABSENT',
    checkInAt: '',
    checkOutAt: '',
    breakInAt: '',
    breakOutAt: '',
    source: draft.source === 'existing' ? 'existing' : 'manual',
  };
}

function toLocalTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
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

// function formatHourValue(minutes: number): string {
//   const hours = minutes / 60;
//   const rounded = Math.round(hours * 100) / 100;
//   return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} h`;
// }

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
        defaultTiming?.dutyStart ||
        '',
    checkOutAt: shouldClearTiming
      ? ''
      : toLocalTimeInput((row.checkOutAt as string | null) ?? null) ||
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

export default function AttendanceCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const workDate = searchParams.get('workDate') || todayYmd();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [drafts, setDrafts] = useState<AttendanceDraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'assigned' | 'exceptions'>('all');
  const [insertEmployeeId, setInsertEmployeeId] = useState('');
  const [bulkAbsentSnapshot, setBulkAbsentSnapshot] = useState<AttendanceDraftRow[] | null>(null);
  const [bulkAbsentConfirm, setBulkAbsentConfirm] = useState<'mark' | 'undo' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const canEdit = isSA || perms.includes('hr.attendance.edit');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (bulkAbsentConfirm !== null) return;
      const key = e.key.toLowerCase();
      if (key !== 'f' || (!e.ctrlKey && !e.metaKey) || e.shiftKey || e.altKey) return;

      e.preventDefault();
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [bulkAbsentConfirm]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) {
        setLoading(true);
        setBulkAbsentSnapshot(null);
      }

      const [scheduleRes, attendanceRes] = await Promise.all([
        fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' }),
        fetch(`/api/hr/attendance?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' }),
      ]);
      const [scheduleJson, attendanceJson] = await Promise.all([scheduleRes.json(), attendanceRes.json()]);
      if (cancelled) return;

      const scheduleData: SchedulePayload | null = scheduleRes.ok && scheduleJson?.success ? scheduleJson.data : null;
      const asgs: AssignmentRow[] = Array.isArray(scheduleData?.assignments)
        ? scheduleData.assignments.map((assignment) =>
            assignmentFromScheduleRaw(assignment as unknown as Record<string, unknown>, scheduleData?.clientDisplayName)
          )
        : [];

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

          const workAssignment = (row.workAssignment as Record<string, unknown> | null) ?? null;
          const assignmentId = String((workAssignment?.id as string | undefined) ?? '');
          if (workAssignment && assignmentId && !asgs.some((item) => item.id === assignmentId)) {
            asgs.push(assignmentFromAttendanceWorkAssignment(workAssignment));
          }
        }
      }

      setAssignments(asgs);
      setSchedule(scheduleData);

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

      const hasExistingAttendance = existingByEmp.size > 0;

      let activeEmployees: EmployeeRow[] = [];
      if (!hasExistingAttendance) {
        const empRes = await fetch('/api/hr/employees?status=ACTIVE', { cache: 'no-store' });
        const empJson = await empRes.json();
        if (empRes.ok && empJson?.success) {
          activeEmployees = empJson.data as EmployeeRow[];
        }
      }

      if (cancelled) return;

      const nextEmployees = new Map<string, EmployeeRow>();
      for (const employee of activeEmployees) nextEmployees.set(employee.id, employee);
      for (const [employeeId, employee] of existingEmployees) nextEmployees.set(employeeId, employee);

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

      if (hasExistingAttendance) {
        void fetch('/api/hr/employees?status=ACTIVE', { cache: 'no-store' })
          .then(async (empRes) => {
            const empJson = await empRes.json();
            if (cancelled || !empRes.ok || !empJson?.success) return;
            setEmployees((prev) => {
              const merged = new Map(prev.map((employee) => [employee.id, employee]));
              for (const employee of empJson.data as EmployeeRow[]) {
                merged.set(employee.id, employee);
              }
              return [...merged.values()];
            });
          })
          .catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, workDate]);

  const assignmentsById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments]
  );

  const assignmentOptions = useMemo(
    () =>
      assignments.map((assignment) => ({
        value: assignment.id,
        label: assignment.jobNumberSnapshot || '',
        searchText: [
          assignment.jobNumberSnapshot,
          assignment.label,
          assignment.customerName,
          assignment.siteName,
          assignment.projectDetails,
        ]
          .filter(Boolean)
          .join(' '),
      })),
    [assignments]
  );

  const employeeById = useMemo(
    () => new Map<string, AttendanceGridEmployee>(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

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
        const assignment = draft.workAssignmentId
          ? assignmentsById.get(draft.workAssignmentId)
          : undefined;
        const matchesSearch =
          !deferredSearch ||
          [
            employee?.fullName ?? '',
            employee?.preferredName ?? '',
            employee?.employeeCode ?? '',
            draft.jobNumber,
            assignment?.customerName ?? '',
            assignment?.siteName ?? '',
            assignment?.projectDetails ?? '',
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
  }, [assignmentsById, deferredSearch, drafts, employeeById, scopeFilter]);

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

  const openBulkAbsentConfirm = () => {
    if (!canEdit || drafts.length === 0) return;
    setBulkAbsentConfirm(bulkAbsentSnapshot ? 'undo' : 'mark');
  };

  const confirmBulkAbsent = () => {
    if (!bulkAbsentConfirm) return;

    if (bulkAbsentConfirm === 'undo' && bulkAbsentSnapshot) {
      setDrafts(cloneDraftRows(bulkAbsentSnapshot));
      setBulkAbsentSnapshot(null);
    } else if (bulkAbsentConfirm === 'mark') {
      setBulkAbsentSnapshot(cloneDraftRows(drafts));
      setDrafts((prev) => prev.map(applyAbsentToDraft));
    }

    setBulkAbsentConfirm(null);
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

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view HR attendance.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="h-112 animate-pulse rounded-lg border border-border bg-muted/30" />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/hr/attendance?workDate=${encodeURIComponent(workDate)}`}
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Attendance
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Attendance day sheet · {formatWorkDateLabel(workDate)}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Preloads from the schedule when available. Edit duty times, job assignments, and status in one worksheet.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {(() => {
            const scheduleTag = scheduleStatusBadgeProps(schedule?.status);
            return (
              <Link
                href={`/hr/schedule?workDate=${encodeURIComponent(workDate)}`}
                title="Open work schedule for this date"
                className={cn(
                  'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  scheduleTag.className
                )}
              >
                Schedule · {scheduleTag.label}
              </Link>
            );
          })()}
          <Badge variant="outline" className="tabular-nums">
            {stats.total} rows
          </Badge>
          {stats.exceptions > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
            >
              {stats.exceptions} exception{stats.exceptions === 1 ? '' : 's'}
            </Badge>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              disabled={drafts.length === 0}
              onClick={openBulkAbsentConfirm}
              className={cn(
                TOOLBAR_TAG_CLASS,
                bulkAbsentSnapshot
                  ? 'border-border bg-primary text-primary-foreground'
                  : 'border-destructive/45 bg-destructive/12 text-destructive dark:text-destructive-foreground'
              )}
            >
              {bulkAbsentSnapshot ? 'Undo all absent' : 'Mark all absent'}
            </button>
          ) : null}
          <Link
            href={`/hr/attendance?workDate=${encodeURIComponent(workDate)}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            Cancel
          </Link>
          {canEdit ? (
            <Button type="submit" form="attendance-create-form" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save attendance'}
            </Button>
          ) : null}
        </div>
      </header>

      <form
        id="attendance-create-form"
        onSubmit={(e) => {
          e.preventDefault();
          void saveAll();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="flex flex-col"
      >
        <AttendanceEntryGrid
          rows={visibleDrafts}
          employeesById={employeeById}
          assignmentsById={assignmentsById}
          assignmentOptions={assignmentOptions}
          canEdit={canEdit}
          emptyMessage="No employees match the current filters."
          onUpdateRow={updateDraft}
          onAssignmentChange={onAssignmentChange}
          filters={
            <>
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search… (Ctrl+F)"
                aria-label="Search employees"
                className={cn(DAY_SHEET_FIELD_CLASS, 'w-36 min-w-34 sm:w-44')}
              />
              <select
                value={scopeFilter}
                onChange={(e) =>
                  setScopeFilter(e.target.value as 'all' | 'assigned' | 'exceptions')
                }
                aria-label="Scope filter"
                className={cn(DAY_SHEET_FIELD_CLASS, 'w-32 min-w-30')}
              >
                <option value="all">All employees</option>
                <option value="assigned">Assigned only</option>
                <option value="exceptions">Exceptions only</option>
              </select>
              <div className="min-w-36 max-w-56 flex-1">
                <SearchSelect
                  items={insertableEmployees.map((employee) => ({
                    id: employee.id,
                    label: employeeDisplayName(employee),
                    searchText: `${employee.employeeCode} ${employee.fullName} ${employee.employeeType ?? ''}`,
                  }))}
                  value={insertEmployeeId}
                  onChange={setInsertEmployeeId}
                  placeholder="Add employee…"
                  minCharactersToSearch={0}
                  openOnFocus
                  dropdownInPortal
                  inputProps={{
                    className: cn(
                      DAY_SHEET_FIELD_CLASS,
                      'w-full !rounded-md !border-border !bg-background !px-2 !py-0 !text-xs !leading-7 focus:!ring-2 focus:!ring-ring dark:!bg-background'
                    ),
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={insertEmployeeRow}
                disabled={!insertEmployeeId || !canEdit}
              >
                Insert
              </Button>
            </>
          }
          chromeStats={
            <>
              <Badge variant="secondary" className="h-auto px-1.5 py-0.5 text-[9px] font-normal tabular-nums">
                {stats.assigned} assigned
              </Badge>
              <Badge variant="secondary" className="h-auto px-1.5 py-0.5 text-[9px] font-normal tabular-nums">
                {stats.existing} saved
              </Badge>
              <span className="text-[9px] text-muted-foreground">
                Showing {visibleDrafts.length} of {drafts.length}
              </span>
            </>
          }
        />
      </form>

      <Modal
        isOpen={bulkAbsentConfirm !== null}
        onClose={() => setBulkAbsentConfirm(null)}
        title={bulkAbsentConfirm === 'undo' ? 'Undo all absent?' : 'Mark all employees absent?'}
        size="sm"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setBulkAbsentConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={bulkAbsentConfirm === 'mark' ? 'destructive' : 'default'}
              onClick={confirmBulkAbsent}
            >
              {bulkAbsentConfirm === 'undo' ? 'Restore rows' : 'Mark all absent'}
            </Button>
          </>
        }
      >
        {bulkAbsentConfirm === 'mark' ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              You are about to mark all <strong className="text-foreground">{drafts.length}</strong> employees
              absent for <strong className="text-foreground">{formatWorkDateLabel(workDate)}</strong>.
            </p>
            <Alert variant="destructive">
              <AlertDescription>
                Check-in, check-out, and break times will be cleared on every row. Changes are not saved until you
                click Save. You can undo from the toolbar before saving.
              </AlertDescription>
            </Alert>
          </div>
        ) : bulkAbsentConfirm === 'undo' ? (
          <p className="text-sm text-muted-foreground">
            Restore attendance rows for{' '}
            <strong className="text-foreground">{formatWorkDateLabel(workDate)}</strong> to how they were before
            marking all absent?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
