'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AttendanceEntryGrid, {
  type AttendanceGridDraftRow,
  type AttendanceGridEmployee,
} from '@/components/hr/AttendanceEntryGrid';
import {
  defaultUnpaidLeaveTypeId,
  isDraftNonWorking,
  normalizeDraftStatusFromApi,
  type LeaveTypeOption,
} from '@/lib/hr/attendanceDraftStatus';
import { isEmployeeOnLeaveForWorkDate } from '@/lib/hr/employeeLeavePeriod';
import { dubaiWallTimeToUtc, parseTimeCell } from '@/lib/hr/dubaiShift';
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
  profileExtension?: unknown;
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

function applyAbsentToDraft(
  draft: AttendanceDraftRow,
  leaveTypes: LeaveTypeOption[]
): AttendanceDraftRow {
  return {
    ...draft,
    status: 'ABSENT',
    leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
    leaveRequestId: null,
    attendanceSource: null,
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
  const dubaiMs = dt.getTime() + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dubai.getUTCHours())}:${pad(dubai.getUTCMinutes())}`;
}

function parseBreakWindow(raw: string | null | undefined): { breakInAt: string; breakOutAt: string } {
  if (!raw) return { breakInAt: '', breakOutAt: '' };
  const m = raw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
  if (!m) return { breakInAt: '', breakOutAt: '' };
  return { breakInAt: m[1].padStart(5, '0'), breakOutAt: m[2].padStart(5, '0') };
}

function combineDateAndTimeToIso(workDate: string, timeVal: string): string | null {
  if (!timeVal) return null;
  const parsed = parseTimeCell(timeVal);
  if (!parsed) return null;
  return dubaiWallTimeToUtc(workDate, parsed.hour, parsed.minute).toISOString();
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
  if (isDraftNonWorking(draft)) return 0;
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

function buildAssignedByEmp(
  scheduleData: SchedulePayload | null,
  assignments: AssignmentRow[]
): Map<string, AssignmentRow[]> {
  const assignedByEmp = new Map<string, AssignmentRow[]>();

  const push = (employeeId: string | null | undefined, assignment: AssignmentRow) => {
    const id = String(employeeId ?? '').trim();
    if (!id) return;
    const existing = assignedByEmp.get(id) ?? [];
    if (existing.some((item) => item.id === assignment.id)) return;
    assignedByEmp.set(id, [...existing, assignment]);
  };

  for (const assignment of assignments) {
    push(assignment.teamLeaderEmployeeId, assignment);
    push(assignment.driver1EmployeeId, assignment);
    push(assignment.driver2EmployeeId, assignment);
    for (const member of assignment.members ?? []) {
      push(member.employeeId, assignment);
    }
  }

  if (scheduleData?.assignments) {
    for (const rawAssignment of scheduleData.assignments) {
      const raw = rawAssignment as unknown as Record<string, unknown>;
      const assignmentId = String(raw.id ?? '');
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (!assignment) continue;
      push(raw.teamLeaderEmployeeId as string | null | undefined, assignment);
      push(raw.driver1EmployeeId as string | null | undefined, assignment);
      push(raw.driver2EmployeeId as string | null | undefined, assignment);
      push((raw.teamLeader as { id?: string } | null | undefined)?.id, assignment);
      push((raw.driver1 as { id?: string } | null | undefined)?.id, assignment);
      push((raw.driver2 as { id?: string } | null | undefined)?.id, assignment);
      if (Array.isArray(raw.members)) {
        for (const member of raw.members) {
          const row = member as Record<string, unknown>;
          push(row.employeeId as string | null | undefined, assignment);
          push((row.employee as { id?: string } | null | undefined)?.id, assignment);
        }
      }
    }
  }

  return assignedByEmp;
}

function mergeActiveAndOnLeaveEmployees(
  activeEmployees: EmployeeRow[],
  onLeaveEmployees: EmployeeRow[]
): EmployeeRow[] {
  const merged = new Map<string, EmployeeRow>();
  for (const employee of activeEmployees) merged.set(employee.id, employee);
  for (const employee of onLeaveEmployees) merged.set(employee.id, employee);
  return [...merged.values()];
}

function buildInitialDraftForEmployee(
  employee: EmployeeRow,
  assigned: AssignmentRow | undefined,
  absentEmployeeIds: Set<string>,
  leaveTypes: LeaveTypeOption[],
  workDate: string
): AttendanceDraftRow {
  if (isEmployeeOnLeaveForWorkDate(employee, workDate) && !assigned) {
    return buildDraftForOnLeavePeriodEmployee(employee, leaveTypes);
  }
  return buildDraftFromDefaults(employee, assigned, absentEmployeeIds, leaveTypes);
}

function sortEmployeesForSheet(a: EmployeeRow, b: EmployeeRow): number {
  const typeDiff = employeeTypeSortValue(a) - employeeTypeSortValue(b);
  if (typeDiff !== 0) return typeDiff;
  return employeeDisplayName(a).localeCompare(employeeDisplayName(b), undefined, { sensitivity: 'base' });
}

function buildDraftFromDefaults(
  employee: EmployeeRow,
  assigned: AssignmentRow | undefined,
  absentEmployeeIds: Set<string>,
  leaveTypes: LeaveTypeOption[]
): AttendanceDraftRow {
  const employeeType = employee.employeeType ?? 'LABOUR_WORKER';
  const defaultTiming = employee.defaultTiming ?? null;
  const scheduledBreak = parseBreakWindow(assigned?.breakWindow);
  const basicHours = employee.basicHoursPerDay ?? 8;

  if (assigned && absentEmployeeIds.has(employee.id)) {
    return {
      employeeId: employee.id,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: assigned?.jobNumberSnapshot ?? '',
      status: 'ABSENT',
      leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
      basicHours,
      checkInAt: '',
      checkOutAt: '',
      breakInAt: '',
      breakOutAt: '',
      remarks: '',
      source: assigned ? 'schedule' : 'manual',
    };
  }

  if (employeeType === 'OFFICE_STAFF' || employeeType === 'DRIVER') {
    return {
      employeeId: employee.id,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: employeeType === 'DRIVER' ? assigned?.jobNumberSnapshot ?? '' : '',
      status: 'PRESENT',
      basicHours,
      checkInAt: defaultTiming?.dutyStart || '',
      checkOutAt: defaultTiming?.dutyEnd || '',
      breakInAt: defaultTiming?.breakStart || '',
      breakOutAt: defaultTiming?.breakEnd || '',
      remarks: '',
      source: assigned ? 'schedule' : 'manual',
    };
  }

  if (employeeType === 'HYBRID_STAFF') {
    return {
      employeeId: employee.id,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: assigned?.jobNumberSnapshot ?? '',
      status: 'PRESENT',
      basicHours,
      checkInAt: assigned?.shiftStart || defaultTiming?.dutyStart || '',
      checkOutAt: assigned?.shiftEnd || defaultTiming?.dutyEnd || '',
      breakInAt: assigned ? scheduledBreak.breakInAt : defaultTiming?.breakStart || '',
      breakOutAt: assigned ? scheduledBreak.breakOutAt : defaultTiming?.breakEnd || '',
      remarks: '',
      source: assigned ? 'schedule' : 'manual',
    };
  }

  return {
    employeeId: employee.id,
    workAssignmentId: assigned?.id ?? '',
    jobNumber: assigned?.jobNumberSnapshot ?? '',
    status: assigned ? 'PRESENT' : 'ABSENT',
    leaveTypeId: assigned ? undefined : defaultUnpaidLeaveTypeId(leaveTypes),
    basicHours,
    checkInAt: assigned?.shiftStart || '',
    checkOutAt: assigned?.shiftEnd || '',
    breakInAt: scheduledBreak.breakInAt,
    breakOutAt: scheduledBreak.breakOutAt,
    remarks: '',
    source: assigned ? 'schedule' : 'manual',
  };
}

function buildDraftForOnLeavePeriodEmployee(
  employee: EmployeeRow,
  leaveTypes: LeaveTypeOption[]
): AttendanceDraftRow {
  const basicHours = employee.basicHoursPerDay ?? 8;
  return {
    employeeId: employee.id,
    workAssignmentId: '',
    jobNumber: '',
    status: 'ABSENT',
    leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
    basicHours,
    checkInAt: '',
    checkOutAt: '',
    breakInAt: '',
    breakOutAt: '',
    remarks: '',
    source: 'manual',
  };
}

function isOnLeaveSectionEmployee(
  employee: EmployeeRow | AttendanceGridEmployee | undefined,
  workDate: string
): boolean {
  return isEmployeeOnLeaveForWorkDate(employee, workDate);
}

function buildDraftFromExistingRow(
  employee: EmployeeRow,
  row: Record<string, unknown>,
  leaveTypes: LeaveTypeOption[]
): AttendanceDraftRow {
  const existingAssignment = (row.workAssignment as Record<string, unknown> | null) ?? null;
  const scheduledBreak = parseBreakWindow((existingAssignment?.breakWindow as string | null | undefined) ?? undefined);
  const defaultTiming = employee.defaultTiming ?? null;
  const storedStatus = (row.status as AttendanceDraftRow['status'] | 'LEAVE' | 'HALF_DAY' | 'MISSING_PUNCH') ?? 'PRESENT';
  const normalized = normalizeDraftStatusFromApi(storedStatus, leaveTypes);
  const shouldClearTiming = isDraftNonWorking(normalized);

  const snapBasic = Number(row.basicHours);
  const basicHours = Number.isFinite(snapBasic) && snapBasic > 0 ? snapBasic : employee.basicHoursPerDay ?? 8;

  return {
    employeeId: employee.id,
    workAssignmentId: String((existingAssignment?.id as string | undefined) ?? ''),
    jobNumber: String((existingAssignment?.jobNumberSnapshot as string | undefined) ?? ''),
    status: normalized.status,
    leaveTypeId: normalized.leaveTypeId,
    basicHours,
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
    remarks: String((row.remarks as string | null | undefined) ?? ''),
    source: 'existing',
    leaveRequestId: (row.leaveRequestId as string | null | undefined) ?? null,
    attendanceSource: (row.source as string | null | undefined) ?? null,
  };
}

export default function AttendanceCreatePage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const workDate = searchParams.get('workDate') || todayYmd();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [onLeaveEmployees, setOnLeaveEmployees] = useState<EmployeeRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [drafts, setDrafts] = useState<AttendanceDraftRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
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
  const [reloadToken, setReloadToken] = useState(0);
  const [leavePreviewByEmployeeId, setLeavePreviewByEmployeeId] = useState<Record<string, string>>({});

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

      const [scheduleRes, attendanceRes, leaveTypesRes, activeEmpRes, onLeaveEmpRes, leavePreviewRes] =
        await Promise.all([
        fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' }),
        fetch(`/api/hr/attendance?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' }),
        fetch('/api/hr/leave-types', { cache: 'no-store' }),
        fetch('/api/hr/employees?status=ACTIVE', { cache: 'no-store' }),
        fetch('/api/hr/employees?status=ON_LEAVE', { cache: 'no-store' }),
        fetch(
          `/api/hr/leave-requests?workDate=${encodeURIComponent(workDate)}&status=APPROVED`,
          { cache: 'no-store' }
        ),
      ]);
      const [scheduleJson, attendanceJson, leaveTypesJson, activeEmpJson, onLeaveEmpJson, leavePreviewJson] =
        await Promise.all([
        scheduleRes.json(),
        attendanceRes.json(),
        leaveTypesRes.json(),
        activeEmpRes.json(),
        onLeaveEmpRes.json(),
        leavePreviewRes.json(),
      ]);
      if (cancelled) return;

      const loadedLeaveTypes: LeaveTypeOption[] =
        leaveTypesRes.ok && leaveTypesJson?.success && Array.isArray(leaveTypesJson.data)
          ? (leaveTypesJson.data as LeaveTypeOption[]).map((t) => ({
              id: t.id,
              code: t.code,
              name: t.name,
              isActive: t.isActive,
            }))
          : [];
      setLeaveTypes(loadedLeaveTypes);

      const previewMap: Record<string, string> = {};
      if (leavePreviewRes.ok && leavePreviewJson?.success && Array.isArray(leavePreviewJson.data)) {
        for (const req of leavePreviewJson.data as Array<{
          employee?: { id?: string };
          leaveTypeRef?: { name?: string } | null;
        }>) {
          const employeeId = req.employee?.id;
          if (!employeeId) continue;
          previewMap[employeeId] = req.leaveTypeRef?.name ?? 'Leave';
        }
      }
      setLeavePreviewByEmployeeId(previewMap);

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
            profileExtension: employee?.profileExtension,
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

      const assignedByEmp = buildAssignedByEmp(scheduleData, asgs);

      const absentEmployeeIds = new Set(
        Array.isArray(scheduleData?.absences)
          ? scheduleData.absences
              .map((absence) => absence.employee?.id)
              .filter((employeeId): employeeId is string => Boolean(employeeId))
          : []
      );

      const hasExistingAttendance = existingByEmp.size > 0;

      let activeEmployees: EmployeeRow[] = [];
      if (activeEmpRes.ok && activeEmpJson?.success && Array.isArray(activeEmpJson.data)) {
        activeEmployees = activeEmpJson.data as EmployeeRow[];
      }

      const loadedOnLeaveEmployees: EmployeeRow[] =
        onLeaveEmpRes.ok && onLeaveEmpJson?.success && Array.isArray(onLeaveEmpJson.data)
          ? (onLeaveEmpJson.data as EmployeeRow[])
          : [];

      if (cancelled) return;

      const rosterEmployees = mergeActiveAndOnLeaveEmployees(activeEmployees, loadedOnLeaveEmployees);

      const nextEmployees = new Map<string, EmployeeRow>();
      for (const employee of rosterEmployees) nextEmployees.set(employee.id, employee);
      for (const [employeeId, employee] of existingEmployees) nextEmployees.set(employeeId, employee);

      const nextDrafts = hasExistingAttendance
        ? [...existingByEmp.entries()].map(([employeeId, row]) => {
            const employee = nextEmployees.get(employeeId) ?? existingEmployees.get(employeeId)!;
            return buildDraftFromExistingRow(employee, row, loadedLeaveTypes);
          })
        : [...rosterEmployees].sort(sortEmployeesForSheet).map((employee) =>
            buildInitialDraftForEmployee(
              employee,
              assignedByEmp.get(employee.id)?.[0],
              absentEmployeeIds,
              loadedLeaveTypes,
              workDate
            )
          );

      if (hasExistingAttendance) {
        const draftEmployeeIds = new Set(nextDrafts.map((draft) => draft.employeeId));
        for (const employee of loadedOnLeaveEmployees) {
          if (
            !draftEmployeeIds.has(employee.id) &&
            isEmployeeOnLeaveForWorkDate(employee, workDate)
          ) {
            nextDrafts.push(buildDraftForOnLeavePeriodEmployee(employee, loadedLeaveTypes));
          }
        }
      }

      setEmployees([...nextEmployees.values()]);
      setOnLeaveEmployees(loadedOnLeaveEmployees);
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
        void fetch('/api/hr/employees?status=ON_LEAVE', { cache: 'no-store' })
          .then(async (empRes) => {
            const empJson = await empRes.json();
            if (cancelled || !empRes.ok || !empJson?.success) return;
            setOnLeaveEmployees(empJson.data as EmployeeRow[]);
          })
          .catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, workDate, reloadToken]);

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

  const employeeById = useMemo(() => {
    const map = new Map<string, AttendanceGridEmployee>();
    for (const employee of employees) map.set(employee.id, employee);
    for (const employee of onLeaveEmployees) map.set(employee.id, employee);
    return map;
  }, [employees, onLeaveEmployees]);

  const mainSheetDrafts = useMemo(
    () =>
      drafts.filter(
        (draft) => !isOnLeaveSectionEmployee(employeeById.get(draft.employeeId), workDate)
      ),
    [drafts, employeeById, workDate]
  );

  const onLeaveDrafts = useMemo(
    () =>
      drafts.filter((draft) => isOnLeaveSectionEmployee(employeeById.get(draft.employeeId), workDate)),
    [drafts, employeeById, workDate]
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
        const basicHours = row.basicHours ?? employee?.basicHoursPerDay ?? 0;
        const basicMinutes = Math.round(basicHours * 60);
        const workedMinutes = calculateWorkedMinutes(row);
        acc.total += 1;
        if (row.workAssignmentId) acc.assigned += 1;
        if (row.source === 'existing') acc.existing += 1;
        if (isDraftNonWorking(row)) acc.exceptions += 1;
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
        if (isOnLeaveSectionEmployee(employee, workDate)) return false;
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
        if (scopeFilter === 'exceptions') return isDraftNonWorking(draft) || !draft.workAssignmentId;
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
  }, [assignmentsById, deferredSearch, drafts, employeeById, scopeFilter, workDate]);

  const visibleOnLeaveEmployees = useMemo(() => {
    const merged = new Map<string, { employee: EmployeeRow; draft: AttendanceDraftRow | null }>();
    for (const draft of onLeaveDrafts) {
      const employee = employeeById.get(draft.employeeId);
      if (employee) merged.set(employee.id, { employee: employee as EmployeeRow, draft });
    }
    for (const employee of onLeaveEmployees) {
      if (
        !merged.has(employee.id) &&
        isEmployeeOnLeaveForWorkDate(employee, workDate)
      ) {
        merged.set(employee.id, { employee, draft: null });
      }
    }

    return [...merged.values()]
      .filter(({ employee }) => {
        if (!deferredSearch) return true;
        return [employee.fullName, employee.preferredName ?? '', employee.employeeCode]
          .join(' ')
          .toLowerCase()
          .includes(deferredSearch);
      })
      .sort((a, b) =>
        employeeDisplayName(a.employee).localeCompare(employeeDisplayName(b.employee), undefined, {
          sensitivity: 'base',
        })
      );
  }, [deferredSearch, employeeById, onLeaveDrafts, onLeaveEmployees, workDate]);

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
              if (isDraftNonWorking(next)) {
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
        leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
        checkInAt: '',
        checkOutAt: '',
        breakInAt: '',
        breakOutAt: '',
        source: 'manual',
      });
      return;
    }
    const next = buildDraftFromDefaults(employee, assignment, new Set<string>(), leaveTypes);
    updateDraft(employeeId, next);
  };

  const insertEmployeeRow = () => {
    if (!insertEmployeeId) return;
    const employee = employeeById.get(insertEmployeeId);
    if (!employee || drafts.some((draft) => draft.employeeId === insertEmployeeId)) return;
    setDrafts((prev) => [...prev, buildDraftFromDefaults(employee, undefined, new Set<string>(), leaveTypes)]);
    setInsertEmployeeId('');
  };

  const openBulkAbsentConfirm = () => {
    if (!canEdit || mainSheetDrafts.length === 0) return;
    setBulkAbsentConfirm(bulkAbsentSnapshot ? 'undo' : 'mark');
  };

  const confirmBulkAbsent = () => {
    if (!bulkAbsentConfirm) return;

    if (bulkAbsentConfirm === 'undo' && bulkAbsentSnapshot) {
      setDrafts(cloneDraftRows(bulkAbsentSnapshot));
      setBulkAbsentSnapshot(null);
    } else if (bulkAbsentConfirm === 'mark') {
      setBulkAbsentSnapshot(cloneDraftRows(drafts));
      setDrafts((prev) =>
        prev.map((draft) => {
          if (isOnLeaveSectionEmployee(employeeById.get(draft.employeeId), workDate)) return draft;
          return applyAbsentToDraft(draft, leaveTypes);
        })
      );
    }

    setBulkAbsentConfirm(null);
  };

  const saveAll = async () => {
    if (!canEdit) return;
    if (drafts.length === 0) {
      toast.error('No attendance rows to save');
      return;
    }
    setSaving(true);
    const payload = {
      workDate,
      rows: drafts.map((draft) => ({
        employeeId: draft.employeeId,
        workAssignmentId: draft.workAssignmentId || null,
        status: draft.status,
        leaveTypeId: draft.status === 'ABSENT' ? defaultUnpaidLeaveTypeId(leaveTypes) : null,
        remarks: draft.remarks?.trim() || null,
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
    const affectedRows = json.data?.affectedRows ?? 0;
    if (affectedRows === 0) {
      toast.error('No rows were saved. Check the data and try again.');
      return;
    }
    toast.success(`Saved ${affectedRows} attendance row${affectedRows === 1 ? '' : 's'}`);
    setReloadToken((value) => value + 1);
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
            Attendance records present or absent only. The Leave column previews approved leave from
            Leave management. Payroll combines both when calculating pay.
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
            <Button type="submit" form="attendance-create-form" size="sm" disabled={saving || drafts.length === 0}>
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
          leaveTypes={leaveTypes}
          leavePreviewByEmployeeId={leavePreviewByEmployeeId}
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
                Showing {visibleDrafts.length} of {mainSheetDrafts.length}
                {onLeaveDrafts.length > 0 ? ` · ${onLeaveDrafts.length} on leave` : ''}
              </span>
            </>
          }
          tableFooter={
            visibleOnLeaveEmployees.length > 0 ? (
              <div className="border-t border-border bg-muted/25">
                <div className="border-b border-border/80 px-4 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Employees on leave
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Saved as absent for this day. Official leave dates and balance are managed in Leave management.
                  </p>
                </div>
                <div className="divide-y divide-border/80">
                  {visibleOnLeaveEmployees.map(({ employee, draft }) => (
                    <div
                      key={employee.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
                    >
                      <span className="font-medium text-foreground">{employeeDisplayName(employee)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{employee.employeeCode}</span>
                      {draft ? (
                        <span className="text-xs text-muted-foreground capitalize">
                          {draft.status === 'ABSENT' ? 'Absent' : draft.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      ) : null}
                      <Badge
                        variant="outline"
                        className="h-auto border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-950 dark:text-amber-100"
                      >
                        On leave
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
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
              You are about to mark all <strong className="text-foreground">{mainSheetDrafts.length}</strong> employees
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
