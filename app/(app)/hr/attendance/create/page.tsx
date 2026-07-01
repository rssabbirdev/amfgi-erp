'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AttendanceEntryGrid, {
  ATTENDANCE_DAY_SHEET_GRID_PREFERENCE_KEY,
  type AttendanceGridAssignmentMeta,
  type AttendanceGridDraftRow,
  type AttendanceGridEmployee,
} from '@/components/hr/AttendanceEntryGrid';
import {
  defaultUnpaidLeaveTypeId,
  isDraftNonWorking,
  normalizeDraftStatusFromApi,
  type LeaveTypeOption,
} from '@/lib/hr/attendanceDraftStatus';
import {
  fetchJobById,
  jobToSearchItem,
  searchJobsApi,
  type ScheduleJobRow,
} from '@/lib/hr/scheduleSearchApi';
import { useJobLiveUpdate } from '@/lib/jobs/jobLiveUpdate';
import { dubaiWallTimeToUtc, parseTimeCell } from '@/lib/hr/dubaiShift';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import { Redo2, Undo2 } from 'lucide-react';
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
  jobId: string | null;
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

interface AllJobOption {
  value: string;
  label: string;
  searchText: string;
  customerName: string;
  siteName: string;
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
    jobId: String(raw.jobId ?? job?.id ?? '').trim() || null,
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
  const job = (raw.job as Record<string, unknown> | null) ?? null;
  const customerName =
    String(costing?.customerName ?? raw.clientNameSnapshot ?? '').trim() || null;
  const siteName = String(costing?.siteName ?? raw.siteNameSnapshot ?? '').trim() || null;
  const projectDetails =
    String(costing?.projectDetails ?? raw.projectDetailsSnapshot ?? '').trim() || null;
  const jobNumber = String(costing?.jobNumber ?? raw.jobNumberSnapshot ?? '').trim() || null;

  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    jobId: String(raw.jobId ?? job?.id ?? '').trim() || null,
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

function draftsEqual(a: AttendanceDraftRow[], b: AttendanceDraftRow[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const TOOLBAR_TAG_CLASS =
  'inline-flex h-auto shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-medium leading-none tracking-wide transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const DAY_SHEET_FIELD_CLASS =
  'h-7 min-h-7 rounded-md border border-border bg-background px-2 py-0 text-xs leading-7 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

function applyAbsentToDraft(
  draft: AttendanceDraftRow,
  leaveTypes: LeaveTypeOption[]
): AttendanceDraftRow {
  return sanitizeAbsentDraft({
    ...draft,
    status: 'ABSENT',
    leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
    leaveRequestId: null,
    attendanceSource: null,
    source: draft.source === 'existing' ? 'existing' : 'manual',
  });
}

function sanitizeAbsentDraft(draft: AttendanceDraftRow): AttendanceDraftRow {
  if (!isDraftNonWorking(draft)) return draft;
  return {
    ...draft,
    workAssignmentId: '',
    externalJobId: null,
    jobNumber: '',
    checkInAt: '',
    checkOutAt: '',
    breakInAt: '',
    breakOutAt: '',
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

function formatHourValue(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} h`;
}

function draftHasTimingFields(draft: AttendanceDraftRow): boolean {
  return [draft.checkInAt, draft.checkOutAt, draft.breakInAt, draft.breakOutAt].some(
    (value) => String(value ?? '').trim() !== ''
  );
}

type HourIndicatorKind = 'under_6' | 'over_12' | 'over_14';

function presentHourIndicatorWarning(
  draft: AttendanceDraftRow
): { kind: HourIndicatorKind; label: string; workedMinutes: number } | null {
  if (isDraftNonWorking(draft)) return null;
  const workedMinutes = calculateWorkedMinutes(draft);
  const hasTiming = draftHasTimingFields(draft);
  if (!hasTiming && workedMinutes === 0) return null;

  const hours = workedMinutes / 60;
  if (hours > 14) return { kind: 'over_14', label: 'More than 14 hours', workedMinutes };
  if (hours > 12) return { kind: 'over_12', label: 'More than 12 hours', workedMinutes };
  if (hours < 6) return { kind: 'under_6', label: 'Less than 6 hours', workedMinutes };
  return null;
}

type SaveValidationIssueRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  workedLabel?: string;
  indicatorLabel?: string;
  indicatorKind?: HourIndicatorKind;
};

type SaveValidationIssues = {
  absentWithTiming: SaveValidationIssueRow[];
  presentHourWarnings: SaveValidationIssueRow[];
  onLeaveMarkedPresent: SaveValidationIssueRow[];
};

function collectSaveValidationIssues(
  drafts: AttendanceDraftRow[],
  employeeById: Map<string, AttendanceGridEmployee>,
  leaveSectionEmployeeIdSet: Set<string>,
  leavePreviewByEmployeeId: Record<string, string>
): SaveValidationIssues {
  const absentWithTiming: SaveValidationIssueRow[] = [];
  const presentHourWarnings: SaveValidationIssueRow[] = [];
  const onLeaveMarkedPresent: SaveValidationIssueRow[] = [];

  for (const draft of drafts) {
    const employee = employeeById.get(draft.employeeId);
    const row: SaveValidationIssueRow = {
      employeeId: draft.employeeId,
      name: employeeDisplayName(employee as EmployeeRow | undefined),
      employeeCode: employee?.employeeCode ?? '',
    };

    if (draft.status === 'ABSENT' && draftHasTimingFields(draft)) {
      absentWithTiming.push(row);
    }

    if (leaveSectionEmployeeIdSet.has(draft.employeeId) && draft.status === 'PRESENT') {
      const approvedLeave = leavePreviewByEmployeeId[draft.employeeId];
      onLeaveMarkedPresent.push({
        ...row,
        indicatorLabel: approvedLeave
          ? `Approved leave · ${approvedLeave}`
          : isEmployeeMarkedOnLeave(employee)
            ? 'On leave status'
            : 'Assigned leave',
      });
    }

    const hourWarning = presentHourIndicatorWarning(draft);
    if (hourWarning) {
      presentHourWarnings.push({
        ...row,
        workedLabel: formatHourValue(hourWarning.workedMinutes),
        indicatorLabel: hourWarning.label,
        indicatorKind: hourWarning.kind,
      });
    }
  }

  absentWithTiming.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  presentHourWarnings.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  onLeaveMarkedPresent.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { absentWithTiming, presentHourWarnings, onLeaveMarkedPresent };
}

function hourIndicatorDotClass(kind: HourIndicatorKind | undefined): string {
  if (kind === 'over_14') return 'bg-destructive';
  if (kind === 'over_12') return 'bg-amber-500';
  return 'bg-sky-600 dark:bg-sky-400';
}

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
  _workDate: string
): AttendanceDraftRow {
  if (isEmployeeMarkedOnLeave(employee)) {
    return buildDraftForOnLeavePeriodEmployee(employee, leaveTypes, assigned);
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
    return sanitizeAbsentDraft({
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
      source: 'schedule',
    });
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
  leaveTypes: LeaveTypeOption[],
  _assigned?: AssignmentRow
): AttendanceDraftRow {
  const basicHours = employee.basicHoursPerDay ?? 8;
  return sanitizeAbsentDraft({
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
  });
}

function isEmployeeMarkedOnLeave(employee: { status?: string } | null | undefined): boolean {
  return employee?.status === 'ON_LEAVE';
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

  return sanitizeAbsentDraft({
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
  });
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
  const [saveValidationConfirm, setSaveValidationConfirm] = useState<SaveValidationIssues | null>(null);
  const [includeAllJobs, setIncludeAllJobs] = useState(false);
  const [allJobOptions, setAllJobOptions] = useState<AllJobOption[]>([]);
  const [allJobsLoading, setAllJobsLoading] = useState(false);
  const [jobsById, setJobsById] = useState<Map<string, ScheduleJobRow>>(new Map());
  const [jobCatalogVersion, setJobCatalogVersion] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useJobLiveUpdate(useCallback(() => setJobCatalogVersion((version) => version + 1), []));

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const canEdit = isSA || perms.includes('hr.attendance.edit');
  const [reloadToken, setReloadToken] = useState(0);
  const [leavePreviewByEmployeeId, setLeavePreviewByEmployeeId] = useState<Record<string, string>>({});
  const [leavePreviewEmployees, setLeavePreviewEmployees] = useState<
    Record<string, { fullName: string; preferredName: string | null; employeeCode: string }>
  >({});

  const draftsRef = useRef<AttendanceDraftRow[]>([]);
  const undoStackRef = useRef<AttendanceDraftRow[][]>([]);
  const redoStackRef = useRef<AttendanceDraftRow[][]>([]);
  const suspendHistoryRef = useRef(false);
  const editHistorySessionRef = useRef<{ employeeId: string | null; pushed: boolean }>({
    employeeId: null,
    pushed: false,
  });
  const editHistoryResetTimerRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const syncHistoryUi = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const clearHistoryStacks = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    editHistorySessionRef.current = { employeeId: null, pushed: false };
    if (editHistoryResetTimerRef.current != null) {
      window.clearTimeout(editHistoryResetTimerRef.current);
      editHistoryResetTimerRef.current = null;
    }
    syncHistoryUi();
  }, [syncHistoryUi]);

  const pushUndoSnapshot = useCallback(
    (snapshot: AttendanceDraftRow[]) => {
      undoStackRef.current = [...undoStackRef.current.slice(-39), cloneDraftRows(snapshot)];
      redoStackRef.current = [];
      editHistorySessionRef.current = { employeeId: null, pushed: false };
      syncHistoryUi();
    },
    [syncHistoryUi]
  );

  const resetEditHistorySession = useCallback(() => {
    editHistorySessionRef.current = { employeeId: null, pushed: false };
  }, []);

  const scheduleEditHistorySessionReset = useCallback(() => {
    if (editHistoryResetTimerRef.current != null) {
      window.clearTimeout(editHistoryResetTimerRef.current);
    }
    editHistoryResetTimerRef.current = window.setTimeout(() => {
      editHistoryResetTimerRef.current = null;
      resetEditHistorySession();
    }, 1200);
  }, [resetEditHistorySession]);

  const runWithoutHistory = useCallback((fn: () => void) => {
    suspendHistoryRef.current = true;
    fn();
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, []);

  const restoreDraftRows = useCallback(
    (snapshot: AttendanceDraftRow[]) => {
      suspendHistoryRef.current = true;
      const restored = cloneDraftRows(snapshot);
      draftsRef.current = restored;
      setDrafts(restored);
      resetEditHistorySession();
      queueMicrotask(() => {
        suspendHistoryRef.current = false;
      });
    },
    [resetEditHistorySession]
  );

  const applyDraftRows = useCallback(
    (
      updater: (current: AttendanceDraftRow[]) => AttendanceDraftRow[],
      options?: { recordUndo?: boolean }
    ) => {
      const current = draftsRef.current;
      const next = updater(current);
      if (draftsEqual(next, current)) return;

      if (!suspendHistoryRef.current && options?.recordUndo !== false) {
        pushUndoSnapshot(current);
        setBulkAbsentSnapshot(null);
      }

      draftsRef.current = next;
      setDrafts(next);
    },
    [pushUndoSnapshot]
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, cloneDraftRows(draftsRef.current)];
    restoreDraftRows(previous);
    setBulkAbsentSnapshot(null);
    syncHistoryUi();
  }, [restoreDraftRows, syncHistoryUi]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-39), cloneDraftRows(draftsRef.current)];
    restoreDraftRows(next);
    syncHistoryUi();
  }, [restoreDraftRows, syncHistoryUi]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (bulkAbsentConfirm !== null) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingContext =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;

      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !isTypingContext) {
        if (e.shiftKey && key === 'z') {
          e.preventDefault();
          redo();
          return;
        }
        if (!e.shiftKey && key === 'z') {
          e.preventDefault();
          undo();
          return;
        }
        if (!e.shiftKey && key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (key !== 'f' || (!e.ctrlKey && !e.metaKey) || e.shiftKey || e.altKey) return;

      e.preventDefault();
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [bulkAbsentConfirm, redo, undo]);

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
      const previewEmployees: Record<
        string,
        { fullName: string; preferredName: string | null; employeeCode: string }
      > = {};
      if (leavePreviewRes.ok && leavePreviewJson?.success && Array.isArray(leavePreviewJson.data)) {
        for (const req of leavePreviewJson.data as Array<{
          employee?: { id?: string; fullName?: string; preferredName?: string | null; employeeCode?: string };
          leaveTypeRef?: { name?: string } | null;
        }>) {
          const employeeId = req.employee?.id;
          if (!employeeId) continue;
          previewMap[employeeId] = req.leaveTypeRef?.name ?? 'Leave';
          previewEmployees[employeeId] = {
            fullName: String(req.employee?.fullName ?? ''),
            preferredName: req.employee?.preferredName ?? null,
            employeeCode: String(req.employee?.employeeCode ?? ''),
          };
        }
      }
      setLeavePreviewByEmployeeId(previewMap);
      setLeavePreviewEmployees(previewEmployees);

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
      for (const employee of loadedOnLeaveEmployees) nextEmployees.set(employee.id, employee);

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
          if (!draftEmployeeIds.has(employee.id) && isEmployeeMarkedOnLeave(employee)) {
            nextDrafts.push(
              buildDraftForOnLeavePeriodEmployee(
                employee,
                loadedLeaveTypes,
                assignedByEmp.get(employee.id)?.[0]
              )
            );
          }
        }
      }

      setEmployees([...nextEmployees.values()]);
      setOnLeaveEmployees(loadedOnLeaveEmployees);
      runWithoutHistory(() => {
        clearHistoryStacks();
        draftsRef.current = nextDrafts;
        setDrafts(nextDrafts);
      });
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

  const assignedByEmp = useMemo(
    () => buildAssignedByEmp(schedule, assignments),
    [schedule, assignments]
  );

  const assignmentMetaById = useMemo(
    () =>
      new Map<string, AttendanceGridAssignmentMeta>(
        assignments.map((assignment) => [
          assignment.id,
          {
            customerName: assignment.customerName,
            siteName: assignment.siteName,
            projectDetails: assignment.projectDetails,
          },
        ])
      ),
    [assignments]
  );

  const assignmentJobIdByAssignmentId = useMemo(
    () =>
      new Map(
        assignments
          .filter((assignment): assignment is AssignmentRow & { jobId: string } => Boolean(assignment.jobId))
          .map((assignment) => [assignment.id, assignment.jobId])
      ),
    [assignments]
  );

  const mergeJobs = useCallback((rows: ScheduleJobRow[]) => {
    if (rows.length === 0) return;
    setJobsById((prev) => {
      const next = new Map(prev);
      for (const row of rows) next.set(row.id, row);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!includeAllJobs) {
      setAllJobOptions([]);
      setAllJobsLoading(false);
      return;
    }

    let cancelled = false;
    setAllJobsLoading(true);
    void searchJobsApi({ search: '', status: 'ACTIVE', limit: 500 })
      .then((rows) => {
        if (cancelled) return;
        mergeJobs(rows);
        setAllJobOptions(
          rows.map((job) => {
            const item = jobToSearchItem(job);
            return {
              value: job.id,
              label: job.jobNumber,
              searchText: item.searchText ?? '',
              customerName: item.companyName,
              siteName: item.siteName,
            };
          })
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load jobs for attendance picker', error);
        toast.error('Failed to load jobs');
        setAllJobOptions([]);
      })
      .finally(() => {
        if (!cancelled) setAllJobsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [includeAllJobs, mergeJobs, jobCatalogVersion]);

  const externalJobMetaById = useMemo(() => {
    const map = new Map<string, AttendanceGridAssignmentMeta>();
    for (const [id, job] of jobsById) {
      map.set(id, {
        customerName: job.customerName ?? null,
        siteName: job.site ?? null,
        projectDetails: job.projectDetails ?? job.description ?? null,
      });
    }
    return map;
  }, [jobsById]);

  const assignmentOptions = useMemo(
    () =>
      assignments.map((assignment) => ({
        value: assignment.id,
        label: assignment.jobNumberSnapshot || '',
        teamLabel: assignment.label || '',
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
    for (const [employeeId, employee] of Object.entries(leavePreviewEmployees)) {
      if (map.has(employeeId)) continue;
      map.set(employeeId, {
        id: employeeId,
        fullName: employee.fullName,
        preferredName: employee.preferredName,
        employeeCode: employee.employeeCode,
        status: 'ACTIVE',
      });
    }
    return map;
  }, [employees, leavePreviewEmployees, onLeaveEmployees]);

  const leaveSectionEmployeeIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const [employeeId, leaveLabel] of Object.entries(leavePreviewByEmployeeId)) {
      if (leaveLabel) ids.add(employeeId);
    }
    for (const employee of employees) {
      if (isEmployeeMarkedOnLeave(employee)) ids.add(employee.id);
    }
    for (const employee of onLeaveEmployees) {
      ids.add(employee.id);
    }
    return ids;
  }, [employees, leavePreviewByEmployeeId, onLeaveEmployees]);

  const mainSheetDrafts = useMemo(
    () => drafts.filter((draft) => !leaveSectionEmployeeIdSet.has(draft.employeeId)),
    [drafts, leaveSectionEmployeeIdSet]
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
        if (row.workAssignmentId || row.externalJobId) acc.assigned += 1;
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
        if (leaveSectionEmployeeIdSet.has(draft.employeeId)) return false;
        const employee = employeeById.get(draft.employeeId);
        const assignment = draft.workAssignmentId
          ? assignmentsById.get(draft.workAssignmentId)
          : undefined;
        const externalJobMeta = draft.externalJobId
          ? externalJobMetaById.get(draft.externalJobId)
          : undefined;
        const matchesSearch =
          !deferredSearch ||
          [
            employee?.fullName ?? '',
            employee?.preferredName ?? '',
            employee?.employeeCode ?? '',
            draft.jobNumber,
            assignment?.customerName ?? externalJobMeta?.customerName ?? '',
            assignment?.siteName ?? externalJobMeta?.siteName ?? '',
            assignment?.projectDetails ?? externalJobMeta?.projectDetails ?? '',
            draft.status,
          ]
            .join(' ')
            .toLowerCase()
            .includes(deferredSearch);
        if (!matchesSearch) return false;
        if (scopeFilter === 'assigned') return Boolean(draft.workAssignmentId || draft.externalJobId);
        if (scopeFilter === 'exceptions') {
          return isDraftNonWorking(draft) || (!draft.workAssignmentId && !draft.externalJobId);
        }
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
  }, [assignmentsById, deferredSearch, drafts, employeeById, externalJobMetaById, leaveSectionEmployeeIdSet, scopeFilter]);

  const visibleLeaveSectionDrafts = useMemo(() => {
    return drafts
      .filter((draft) => leaveSectionEmployeeIdSet.has(draft.employeeId))
      .filter((draft) => {
        const employee = employeeById.get(draft.employeeId);
        if (!deferredSearch) return true;
        return [
          employee?.fullName ?? '',
          employee?.preferredName ?? '',
          employee?.employeeCode ?? '',
          leavePreviewByEmployeeId[draft.employeeId] ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(deferredSearch);
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
  }, [deferredSearch, drafts, employeeById, leavePreviewByEmployeeId, leaveSectionEmployeeIdSet]);

  useEffect(() => {
    if (loading) return;
    runWithoutHistory(() => {
      setDrafts((prev) => {
        const existingIds = new Set(prev.map((draft) => draft.employeeId));
        const toAdd: AttendanceDraftRow[] = [];

        for (const employeeId of leaveSectionEmployeeIdSet) {
          if (existingIds.has(employeeId)) continue;

          const rosterEmployee =
            employees.find((employee) => employee.id === employeeId) ??
            onLeaveEmployees.find((employee) => employee.id === employeeId);
          const preview = leavePreviewEmployees[employeeId];

          const employee: EmployeeRow | null =
            rosterEmployee ??
            (preview
              ? {
                  id: employeeId,
                  fullName: preview.fullName,
                  preferredName: preview.preferredName,
                  employeeCode: preview.employeeCode,
                  status: 'ACTIVE',
                  employeeType: 'LABOUR_WORKER',
                }
              : null);

          if (!employee) continue;

          toAdd.push(
            buildInitialDraftForEmployee(
              employee,
              assignedByEmp.get(employeeId)?.[0],
              new Set<string>(),
              leaveTypes,
              workDate
            )
          );
        }

        if (toAdd.length === 0) return prev;
        const next = [...prev, ...toAdd];
        draftsRef.current = next;
        return next;
      });
    });
  }, [
    assignedByEmp,
    employees,
    leavePreviewEmployees,
    leaveSectionEmployeeIdSet,
    leaveTypes,
    loading,
    onLeaveEmployees,
    runWithoutHistory,
    workDate,
  ]);

  const updateDraft = useCallback(
    (employeeId: string, patch: Partial<AttendanceDraftRow>) => {
      if (!suspendHistoryRef.current) {
        const session = editHistorySessionRef.current;
        if (session.employeeId !== employeeId || !session.pushed) {
          pushUndoSnapshot(draftsRef.current);
          editHistorySessionRef.current = { employeeId, pushed: true };
          setBulkAbsentSnapshot(null);
        }
        scheduleEditHistorySessionReset();
      }

      applyDraftRows(
        (prev) =>
          prev.map((draft) =>
            draft.employeeId === employeeId
              ? (() => {
                  const next: AttendanceDraftRow = {
                    ...draft,
                    ...patch,
                    source: draft.source === 'existing' ? 'existing' : 'manual',
                  };
                  return sanitizeAbsentDraft(next);
                })()
              : draft
          ),
        { recordUndo: false }
      );
    },
    [applyDraftRows, pushUndoSnapshot, scheduleEditHistorySessionReset]
  );

  const patchDraftRow = useCallback(
    (employeeId: string, patch: Partial<AttendanceDraftRow>) => {
      resetEditHistorySession();
      applyDraftRows((prev) =>
        prev.map((draft) => {
          if (draft.employeeId !== employeeId) return draft;
          const next: AttendanceDraftRow = {
            ...draft,
            ...patch,
            source: draft.source === 'existing' ? 'existing' : 'manual',
          };
          return sanitizeAbsentDraft(next);
        })
      );
    },
    [applyDraftRows, resetEditHistorySession]
  );

  const onAssignmentChange = (employeeId: string, assignmentId: string) => {
    const employee = employeeById.get(employeeId);
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!employee) return;
    if (!assignment) {
      patchDraftRow(employeeId, {
        workAssignmentId: '',
        externalJobId: null,
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
    const next = isEmployeeMarkedOnLeave(employee)
      ? buildDraftForOnLeavePeriodEmployee(employee, leaveTypes, assignment)
      : buildDraftFromDefaults(employee, assignment, new Set<string>(), leaveTypes);
    patchDraftRow(employeeId, { ...next, externalJobId: null });
  };

  const onAllJobsChange = (employeeId: string, jobId: string) => {
    const employee = employeeById.get(employeeId);
    if (!employee) return;
    if (!jobId) {
      patchDraftRow(employeeId, {
        workAssignmentId: '',
        externalJobId: null,
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

    const matchingAssignment = assignments.find((assignment) => assignment.jobId === jobId);
    if (matchingAssignment) {
      onAssignmentChange(employeeId, matchingAssignment.id);
      return;
    }

    void (async () => {
      let job = jobsById.get(jobId);
      if (!job) {
        const row = await fetchJobById(jobId);
        if (row) {
          mergeJobs([row]);
          job = row;
        }
      }
      const onLeave = isEmployeeMarkedOnLeave(employee);
      patchDraftRow(employeeId, {
        workAssignmentId: '',
        externalJobId: jobId,
        jobNumber: job?.jobNumber ?? '',
        status: onLeave ? 'ABSENT' : 'PRESENT',
        leaveTypeId: onLeave ? defaultUnpaidLeaveTypeId(leaveTypes) : null,
        ...(onLeave
          ? { checkInAt: '', checkOutAt: '', breakInAt: '', breakOutAt: '' }
          : {}),
        source: 'manual',
      });
    })();
  };

  const insertEmployeeRow = () => {
    if (!insertEmployeeId) return;
    const employee = employeeById.get(insertEmployeeId);
    if (!employee || drafts.some((draft) => draft.employeeId === insertEmployeeId)) return;
    applyDraftRows((prev) => [
      ...prev,
      buildInitialDraftForEmployee(employee, undefined, new Set<string>(), leaveTypes, workDate),
    ]);
    setInsertEmployeeId('');
  };

  const openBulkAbsentConfirm = () => {
    if (!canEdit || mainSheetDrafts.length === 0) return;
    setBulkAbsentConfirm(bulkAbsentSnapshot ? 'undo' : 'mark');
  };

  const confirmBulkAbsent = () => {
    if (!bulkAbsentConfirm) return;

    if (bulkAbsentConfirm === 'undo' && bulkAbsentSnapshot) {
      runWithoutHistory(() => {
        restoreDraftRows(bulkAbsentSnapshot);
        setBulkAbsentSnapshot(null);
      });
    } else if (bulkAbsentConfirm === 'mark') {
      setBulkAbsentSnapshot(cloneDraftRows(draftsRef.current));
      applyDraftRows((prev) =>
        prev.map((draft) => {
          if (leaveSectionEmployeeIdSet.has(draft.employeeId)) {
            return draft;
          }
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
      rows: drafts.map((draft) => {
        const isAbsent = draft.status === 'ABSENT';
        return {
          employeeId: draft.employeeId,
          workAssignmentId: (() => {
            if (draft.workAssignmentId) return draft.workAssignmentId;
            if (draft.externalJobId) {
              const match = assignments.find((assignment) => assignment.jobId === draft.externalJobId);
              return match?.id ?? null;
            }
            return null;
          })(),
          status: draft.status,
          leaveTypeId: isAbsent ? defaultUnpaidLeaveTypeId(leaveTypes) : null,
          remarks: draft.remarks?.trim() || null,
          checkInAt: isAbsent ? null : combineDateAndTimeToIso(workDate, draft.checkInAt),
          checkOutAt: isAbsent ? null : combineDateAndTimeToIso(workDate, draft.checkOutAt),
          breakInAt: isAbsent ? null : combineDateAndTimeToIso(workDate, draft.breakInAt),
          breakOutAt: isAbsent ? null : combineDateAndTimeToIso(workDate, draft.breakOutAt),
        };
      }),
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
    setSaveValidationConfirm(null);
    setReloadToken((value) => value + 1);
  };

  const requestSave = () => {
    if (!canEdit) return;
    if (drafts.length === 0) {
      toast.error('No attendance rows to save');
      return;
    }

    const issues = collectSaveValidationIssues(
      drafts,
      employeeById,
      leaveSectionEmployeeIdSet,
      leavePreviewByEmployeeId
    );
    if (
      issues.absentWithTiming.length === 0 &&
      issues.presentHourWarnings.length === 0 &&
      issues.onLeaveMarkedPresent.length === 0
    ) {
      void saveAll();
      return;
    }

    setSaveValidationConfirm(issues);
  };

  const confirmSaveAnyway = () => {
    setSaveValidationConfirm(null);
    void saveAll();
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
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canUndo}
                onClick={undo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="h-7 px-2"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canRedo}
                onClick={redo}
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
                className="h-7 px-2"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
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
            </>
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
          requestSave();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="flex flex-col"
      >
        <AttendanceEntryGrid
          gridPreferenceKey={ATTENDANCE_DAY_SHEET_GRID_PREFERENCE_KEY}
          rows={visibleDrafts}
          employeesById={employeeById}
          assignmentsById={assignmentMetaById}
          assignmentJobIdByAssignmentId={assignmentJobIdByAssignmentId}
          externalJobMetaById={externalJobMetaById}
          assignmentOptions={assignmentOptions}
          allJobOptions={allJobOptions}
          allJobsLoading={allJobsLoading}
          includeAllJobs={includeAllJobs}
          onIncludeAllJobsChange={setIncludeAllJobs}
          leaveTypes={leaveTypes}
          leavePreviewByEmployeeId={leavePreviewByEmployeeId}
          canEdit={canEdit}
          emptyMessage="No employees match the current filters."
          onUpdateRow={updateDraft}
          onAssignmentChange={onAssignmentChange}
          onAllJobsChange={onAllJobsChange}
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
                {visibleLeaveSectionDrafts.length > 0
                  ? ` · ${visibleLeaveSectionDrafts.length} on leave`
                  : ''}
              </span>
            </>
          }
          leaveSectionRows={visibleLeaveSectionDrafts}
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

      <Modal
        isOpen={saveValidationConfirm !== null}
        onClose={() => setSaveValidationConfirm(null)}
        title="Review before saving"
        size="md"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSaveValidationConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={confirmSaveAnyway} disabled={saving}>
              {saving ? 'Saving…' : 'Save anyway'}
            </Button>
          </>
        }
      >
        {saveValidationConfirm ? (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Fix the rows below or choose <strong className="text-foreground">Save anyway</strong> to continue for{' '}
              <strong className="text-foreground">{formatWorkDateLabel(workDate)}</strong>.
            </p>

            {saveValidationConfirm.absentWithTiming.length > 0 ? (
              <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                  <p>
                    <strong className="text-foreground">Absent rows must have 0 hours.</strong> Clear duty and break
                    times on absent employees before saving.
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {saveValidationConfirm.absentWithTiming.map((row) => (
                      <li key={row.employeeId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-foreground">
                          {row.name}
                          <span className="ml-1.5 text-muted-foreground">{row.employeeCode}</span>
                        </span>
                        <span className="shrink-0 font-medium text-destructive">Has times</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px]">
                    Saving anyway will store these rows as absent with no times.
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}

            {saveValidationConfirm.presentHourWarnings.length > 0 ? (
              <Alert>
                <AlertDescription className="space-y-2">
                  <p>
                    <strong className="text-foreground">Hour indicator warnings</strong> for present employees (same
                    rules as the total-hours column).
                  </p>
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                    {saveValidationConfirm.presentHourWarnings.map((row) => (
                      <li key={row.employeeId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-foreground">
                          {row.name}
                          <span className="ml-1.5 text-muted-foreground">{row.employeeCode}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5">
                          <span
                            className={cn('size-2 rounded-sm', hourIndicatorDotClass(row.indicatorKind))}
                            aria-hidden
                          />
                          <span className="font-mono tabular-nums text-foreground">{row.workedLabel}</span>
                          <span className="text-muted-foreground">· {row.indicatorLabel}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            {saveValidationConfirm.onLeaveMarkedPresent.length > 0 ? (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertDescription className="space-y-2">
                  <p>
                    <strong className="text-foreground">On-leave employees marked present.</strong> Confirm they really
                    came to work before saving.
                  </p>
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                    {saveValidationConfirm.onLeaveMarkedPresent.map((row) => (
                      <li key={row.employeeId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-foreground">
                          {row.name}
                          <span className="ml-1.5 text-muted-foreground">{row.employeeCode}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5">
                          <span className="font-medium text-amber-950 dark:text-amber-100">Present</span>
                          <span className="text-muted-foreground">· {row.indicatorLabel}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
