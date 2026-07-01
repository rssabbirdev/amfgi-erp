'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useSession } from 'next-auth/react';
import SearchSelect from '@/components/ui/SearchSelect';
import LineGridColumnSettings, {
  type LineGridColumnConfig,
} from '@/components/stock/LineGridColumnSettings';
import {
  mergeLineGridInputProps,
  useLineGridKeyboardNav,
} from '@/lib/stock/lineGridKeyboardNav';
import { Badge } from '@/components/ui/shadcn/badge';
import {
  defaultUnpaidLeaveTypeId,
  isDraftNonWorking,
  type LeaveTypeOption,
} from '@/lib/hr/attendanceDraftStatus';
import TimeEntryInput, { TIME_ENTRY_FLAT_INPUT_CLASS } from '@/components/hr/TimeEntryInput';
import { cn } from '@/lib/utils';

export interface AttendanceGridEmployee {
  id: string;
  fullName: string;
  preferredName: string | null;
  employeeCode: string;
  status?: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';
  basicHoursPerDay?: number;
  employeeType?: 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER';
}

export interface AttendanceGridDraftRow {
  employeeId: string;
  /** Set when editing one employee across multiple dates (employee-month sheet). */
  workDate?: string;
  /** Persisted attendance row id — used for delete on employee-month sheet. */
  entryId?: string | null;
  workAssignmentId: string;
  /** Job picked from the full jobs list when it is not on today's schedule. */
  externalJobId?: string | null;
  jobNumber: string;
  status: 'PRESENT' | 'ABSENT';
  leaveTypeId?: string | null;
  /** Snapshotted basic duty hours for this day (from row or type settings at create). */
  basicHours?: number;
  checkInAt: string;
  checkOutAt: string;
  breakInAt: string;
  breakOutAt: string;
  remarks?: string;
  source: 'existing' | 'schedule' | 'manual';
  leaveRequestId?: string | null;
  attendanceSource?: string | null;
}

function draftBasicMinutes(draft: AttendanceGridDraftRow, employee: AttendanceGridEmployee | undefined): number {
  const hours = draft.basicHours ?? employee?.basicHoursPerDay ?? 0;
  return Math.round(hours * 60);
}

interface AssignmentOption {
  value: string;
  label: string;
  teamLabel: string;
  searchText: string;
}

export interface AttendanceGridAssignmentMeta {
  customerName: string | null;
  siteName: string | null;
  projectDetails: string | null;
}

interface AllJobOption {
  value: string;
  label: string;
  searchText: string;
  customerName: string;
  siteName: string;
}

interface AttendanceEntryGridProps {
  rows: AttendanceGridDraftRow[];
  employeesById: Map<string, AttendanceGridEmployee>;
  assignmentsById: Map<string, AttendanceGridAssignmentMeta>;
  assignmentJobIdByAssignmentId: Map<string, string>;
  externalJobMetaById: Map<string, AttendanceGridAssignmentMeta>;
  assignmentOptions: AssignmentOption[];
  /** Per-row schedule jobs when sheetMode is dates (keyed by workDate). */
  assignmentOptionsForRow?: (draft: AttendanceGridDraftRow) => AssignmentOption[];
  allJobOptions: AllJobOption[];
  allJobsLoading: boolean;
  includeAllJobs: boolean;
  onIncludeAllJobsChange: (value: boolean) => void;
  leaveTypes: LeaveTypeOption[];
  /** Approved leave preview — keyed by employeeId (day sheet) or workDate (employee-month). */
  leavePreviewByEmployeeId?: Record<string, string>;
  leavePreviewByRowKey?: Record<string, string>;
  /** Day sheet = one date, many employees. Employee-month = one employee, many dates. */
  sheetMode?: 'employees' | 'dates';
  resolveRowKey?: (draft: AttendanceGridDraftRow) => string;
  monthDateBounds?: { min: string; max: string };
  onWorkDateChange?: (rowKey: string, workDate: string) => void;
  onRemoveRow?: (rowKey: string) => void;
  /** Database + localStorage key for column layout; use a distinct key per attendance screen. */
  gridPreferenceKey?: string;
  canEdit: boolean;
  emptyMessage: string;
  /** Left side of the day-sheet chrome row (search, scope, add employee). */
  filters?: ReactNode;
  /** Shown to the right of the “Day sheet” label (e.g. assigned / worked stats). */
  chromeStats?: ReactNode;
  /** Optional block rendered below grid rows. */
  tableFooter?: ReactNode;
  /** Full editable rows shown below active employees, after a divider. */
  leaveSectionRows?: AttendanceGridDraftRow[];
  onUpdateRow: (employeeId: string, patch: Partial<AttendanceGridDraftRow>) => void;
  onAssignmentChange: (employeeId: string, assignmentId: string) => void;
  onAllJobsChange: (employeeId: string, jobId: string) => void;
}

/** Day sheet (`/hr/attendance/create`) — legacy key kept for existing saved layouts. */
export const ATTENDANCE_DAY_SHEET_GRID_PREFERENCE_KEY = 'hr-attendance-create-line-grid';
/** Employee-month sheet (`/hr/attendance/employee`). */
export const ATTENDANCE_EMPLOYEE_MONTH_GRID_PREFERENCE_KEY = 'hr-attendance-employee-month-line-grid';

function formatDateCellLabel(ymd: string): string {
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return ymd;
  }
}

function resolveDraftRowKey(
  draft: AttendanceGridDraftRow,
  resolveRowKey?: (draft: AttendanceGridDraftRow) => string
): string {
  if (resolveRowKey) return resolveRowKey(draft);
  return draft.workDate?.trim() || draft.employeeId;
}

const STATUS_OPTIONS: Array<{ value: AttendanceGridDraftRow['status']; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
];

type AttendanceGridColumnKey =
  | 'line'
  | 'employee'
  | 'job'
  | 'customer'
  | 'site'
  | 'project'
  | 'dutyIn'
  | 'breakOut'
  | 'breakIn'
  | 'dutyOut'
  | 'basicHr'
  | 'totalHr'
  | 'overtime'
  | 'status'
  | 'leave'
  | 'remarks';

const ATTENDANCE_NAVIGABLE_COLUMN_KEYS: AttendanceGridColumnKey[] = [
  'job',
  'dutyIn',
  'breakOut',
  'breakIn',
  'dutyOut',
  'status',
  'remarks',
];

const DEFAULT_GRID_COLUMNS: LineGridColumnConfig[] = [
  { key: 'line', label: '#', visible: true, width: 48, minWidth: 40, maxWidth: 72 },
  { key: 'employee', label: 'Employee', visible: true, width: 300, minWidth: 200, maxWidth: 420 },
  { key: 'job', label: 'Job num', visible: true, width: 148, minWidth: 110, maxWidth: 220 },
  { key: 'customer', label: 'Customer', visible: true, width: 180, minWidth: 120, maxWidth: 320 },
  { key: 'site', label: 'Site', visible: true, width: 160, minWidth: 100, maxWidth: 280 },
  { key: 'project', label: 'Project details', visible: true, width: 220, minWidth: 140, maxWidth: 400 },
  { key: 'dutyIn', label: 'Duty in', visible: true, width: 108, minWidth: 88, maxWidth: 160 },
  { key: 'breakOut', label: 'Break out', visible: true, width: 108, minWidth: 88, maxWidth: 160 },
  { key: 'breakIn', label: 'Break in', visible: true, width: 108, minWidth: 88, maxWidth: 160 },
  { key: 'dutyOut', label: 'Duty out', visible: true, width: 108, minWidth: 88, maxWidth: 160 },
  { key: 'basicHr', label: 'Basic hr', visible: true, width: 96, minWidth: 72, maxWidth: 140 },
  { key: 'totalHr', label: 'Total hr', visible: true, width: 96, minWidth: 72, maxWidth: 140 },
  { key: 'overtime', label: 'Overtime', visible: true, width: 96, minWidth: 72, maxWidth: 140 },
  { key: 'status', label: 'Status', visible: true, width: 112, minWidth: 96, maxWidth: 160 },
  { key: 'leave', label: 'Leave', visible: true, width: 148, minWidth: 120, maxWidth: 220 },
  { key: 'remarks', label: 'Remarks', visible: true, width: 180, minWidth: 120, maxWidth: 320 },
];

/** Row fill + left accent — higher opacity for readable contrast on card background. */
const EMPLOYEE_TYPE_ROW_TONE: Record<NonNullable<AttendanceGridEmployee['employeeType']>, string> = {
  LABOUR_WORKER:
    'border-l-[3px] border-l-emerald-600 bg-emerald-100/90 hover:bg-emerald-200/80 dark:border-l-emerald-400 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/75',
  DRIVER:
    'border-l-[3px] border-l-sky-600 bg-sky-100/90 hover:bg-sky-200/80 dark:border-l-sky-400 dark:bg-sky-950/70 dark:hover:bg-sky-900/75',
  HYBRID_STAFF:
    'border-l-[3px] border-l-violet-600 bg-violet-100/90 hover:bg-violet-200/80 dark:border-l-violet-400 dark:bg-violet-950/70 dark:hover:bg-violet-900/75',
  OFFICE_STAFF:
    'border-l-[3px] border-l-amber-600 bg-amber-100/90 hover:bg-amber-200/80 dark:border-l-amber-400 dark:bg-amber-950/70 dark:hover:bg-amber-900/75',
};

const ABSENT_ROW_TONE =
  'border-l-[3px] border-l-destructive bg-destructive/20 hover:bg-destructive/28 dark:bg-destructive/30 dark:hover:bg-destructive/38';

const LEAVE_SECTION_ROW_TONE =
  'border-l-[3px] border-l-amber-500 bg-amber-100/70 dark:border-l-amber-400 dark:bg-amber-950/50';

type EmployeeTypeKey = NonNullable<AttendanceGridEmployee['employeeType']>;

const EMPLOYEE_TYPE_TAG: Record<EmployeeTypeKey, { label: string; className: string }> = {
  OFFICE_STAFF: {
    label: 'Office',
    className:
      'border-amber-600/50 bg-amber-200/90 text-amber-950 dark:border-amber-400/50 dark:bg-amber-900/80 dark:text-amber-100',
  },
  DRIVER: {
    label: 'Driver',
    className:
      'border-sky-600/50 bg-sky-200/90 text-sky-950 dark:border-sky-400/50 dark:bg-sky-900/80 dark:text-sky-100',
  },
  HYBRID_STAFF: {
    label: 'Hybrid',
    className:
      'border-violet-600/50 bg-violet-200/90 text-violet-950 dark:border-violet-400/50 dark:bg-violet-900/80 dark:text-violet-100',
  },
  LABOUR_WORKER: {
    label: 'Worker',
    className:
      'border-emerald-600/50 bg-emerald-200/90 text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-900/80 dark:text-emerald-100',
  },
};

const EMPLOYEE_TYPE_SECTION_ORDER: EmployeeTypeKey[] = [
  'LABOUR_WORKER',
  'DRIVER',
  'HYBRID_STAFF',
  'OFFICE_STAFF',
];

const EMPLOYEE_TYPE_SECTION_HEADER: Record<
  EmployeeTypeKey,
  { title: string; borderClass: string; bgClass: string }
> = {
  LABOUR_WORKER: {
    title: 'Workers',
    borderClass: 'border-emerald-500/50',
    bgClass: 'bg-emerald-500/8',
  },
  DRIVER: {
    title: 'Drivers',
    borderClass: 'border-sky-500/50',
    bgClass: 'bg-sky-500/8',
  },
  HYBRID_STAFF: {
    title: 'Hybrid staff',
    borderClass: 'border-violet-500/50',
    bgClass: 'bg-violet-500/8',
  },
  OFFICE_STAFF: {
    title: 'Office staff',
    borderClass: 'border-amber-500/50',
    bgClass: 'bg-amber-500/8',
  },
};

const COMPACT_TAG_BASE =
  'inline-flex h-auto shrink-0 items-center rounded border px-1 py-px text-[9px] font-medium leading-none tracking-wide';

const FLAT_INPUT_CLASS = TIME_ENTRY_FLAT_INPUT_CLASS;

type LineGridPreferencePayload = {
  order: string[];
  visible: Record<string, boolean>;
  widths?: Record<string, number>;
};

function mergeStoredGridColumns(
  defaults: LineGridColumnConfig[],
  stored: Partial<LineGridPreferencePayload> | null | undefined
): LineGridColumnConfig[] {
  const defaultByKey = new Map(defaults.map((c) => [c.key, c]));
  const known = new Set(defaults.map((c) => c.key));
  const rawOrder = stored?.order?.length ? stored.order : defaults.map((c) => c.key);
  const order = rawOrder.filter((k) => known.has(k));
  for (const k of defaults.map((c) => c.key)) {
    if (!order.includes(k)) order.push(k);
  }
  return order.map((key) => {
    const base = defaultByKey.get(key)!;
    const v = stored?.visible?.[key];
    const w = stored?.widths?.[key];
    const width =
      typeof w === 'number' && Number.isFinite(w)
        ? Math.round(Math.max(base.minWidth ?? 64, Math.min(base.maxWidth ?? 420, w)))
        : base.width;
    const visible = typeof v === 'boolean' ? v : base.visible;
    return { ...base, visible, width };
  });
}

function gridColumnsToPreferencePayload(columns: LineGridColumnConfig[]): LineGridPreferencePayload {
  return {
    order: columns.map((c) => c.key),
    visible: Object.fromEntries(columns.map((c) => [c.key, c.visible])),
    widths: Object.fromEntries(columns.map((c) => [c.key, c.width])),
  };
}

function getAttendanceGridLocalStorageKey(companyId: string, preferenceKey: string) {
  return `attendance-line-grid:${preferenceKey}:${companyId}`;
}

function attendanceGridPreferenceSessionKey(preferenceKey: string, companyId: string | null | undefined) {
  return `${preferenceKey}:${companyId ?? ''}`;
}

function readAttendanceGridLocalPref(storageKey: string): Partial<LineGridPreferencePayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<LineGridPreferencePayload>;
  } catch {
    return null;
  }
}

function writeAttendanceGridLocalPref(storageKey: string, payload: LineGridPreferencePayload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function EmployeeTypeTag({ type }: { type: EmployeeTypeKey }) {
  const tag = EMPLOYEE_TYPE_TAG[type];
  return (
    <span className={cn(COMPACT_TAG_BASE, 'uppercase', tag.className)}>{tag.label}</span>
  );
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

function calculateWorkedMinutes(draft: AttendanceGridDraftRow): number {
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

function workedHourTone(minutes: number): string {
  const hours = minutes / 60;
  if (hours > 14) {
    return 'bg-destructive/30 font-semibold text-destructive ring-1 ring-destructive/50 dark:bg-destructive/40 dark:text-destructive-foreground';
  }
  if (hours > 12) {
    return 'bg-amber-400/35 font-semibold text-amber-950 ring-1 ring-amber-600/45 dark:bg-amber-500/35 dark:text-amber-50';
  }
  if (hours < 6) {
    return 'bg-sky-400/35 font-semibold text-sky-950 ring-1 ring-sky-600/45 dark:bg-sky-500/35 dark:text-sky-50';
  }
  return 'bg-muted/60 text-foreground ring-1 ring-border/60';
}

function employeeDisplayName(employee: AttendanceGridEmployee | undefined): string {
  return employee?.preferredName || employee?.fullName || '';
}

function ReadOnlyMetaCell({ value }: { value: string | null | undefined }) {
  const text = value?.trim() || '—';
  return (
    <span className="truncate text-xs text-foreground/90" title={text === '—' ? undefined : text}>
      {text}
    </span>
  );
}

function renderGridSectionHeader(
  gridTemplateColumns: string,
  title: string,
  description: string | undefined,
  accent: { borderClass: string; bgClass: string }
) {
  return (
    <div
      className={cn('grid border-t-2 border-dashed bg-muted/30', accent.borderClass, accent.bgClass)}
      style={{ gridTemplateColumns }}
    >
      <div className="col-span-full border-b border-border/80 px-4 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        {description ? <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export default function AttendanceEntryGrid({
  rows,
  employeesById,
  assignmentsById,
  assignmentJobIdByAssignmentId,
  externalJobMetaById,
  assignmentOptions,
  assignmentOptionsForRow,
  allJobOptions,
  allJobsLoading,
  includeAllJobs,
  onIncludeAllJobsChange,
  leaveTypes,
  leavePreviewByEmployeeId = {},
  leavePreviewByRowKey = {},
  sheetMode = 'employees',
  resolveRowKey,
  monthDateBounds,
  onWorkDateChange,
  onRemoveRow,
  gridPreferenceKey = ATTENDANCE_DAY_SHEET_GRID_PREFERENCE_KEY,
  canEdit,
  emptyMessage,
  filters,
  chromeStats,
  tableFooter,
  leaveSectionRows = [],
  onUpdateRow,
  onAssignmentChange,
  onAllJobsChange,
}: AttendanceEntryGridProps) {
  const { data: session, status: sessionStatus } = useSession();
  const companyId = session?.user?.activeCompanyId;
  const storageKey = useMemo(
    () => (companyId ? getAttendanceGridLocalStorageKey(companyId, gridPreferenceKey) : null),
    [companyId, gridPreferenceKey]
  );

  const preferenceSessionKey = useMemo(
    () => attendanceGridPreferenceSessionKey(gridPreferenceKey, companyId),
    [companyId, gridPreferenceKey]
  );

  const isDatesMode = sheetMode === 'dates';

  const defaultGridColumns = useMemo((): LineGridColumnConfig[] => {
    if (!isDatesMode) return DEFAULT_GRID_COLUMNS;
    return DEFAULT_GRID_COLUMNS.map((column) =>
      column.key === 'employee'
        ? { ...column, key: 'employee', label: 'Work date', width: 168, minWidth: 140, maxWidth: 220 }
        : column
    );
  }, [isDatesMode]);

  const [gridColumns, setGridColumns] = useState<LineGridColumnConfig[]>(defaultGridColumns);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadedPreferenceKeyRef = useRef<string | null>(null);

  const visibleGridColumns = useMemo(
    () => gridColumns.filter((column) => column.visible),
    [gridColumns]
  );

  const gridTemplateColumns = useMemo(
    () => visibleGridColumns.map((column) => `${column.width}px`).join(' '),
    [visibleGridColumns]
  );

  const employeeTypeSections = useMemo(() => {
    if (isDatesMode) {
      const sorted = [...rows].sort((a, b) =>
        String(a.workDate ?? '').localeCompare(String(b.workDate ?? ''))
      );
      return sorted.length
        ? [{ type: 'LABOUR_WORKER' as EmployeeTypeKey, rows: sorted }]
        : [];
    }
    const buckets = new Map<EmployeeTypeKey, AttendanceGridDraftRow[]>();
    for (const type of EMPLOYEE_TYPE_SECTION_ORDER) buckets.set(type, []);
    for (const draft of rows) {
      const type = employeesById.get(draft.employeeId)?.employeeType ?? 'LABOUR_WORKER';
      buckets.get(type)!.push(draft);
    }
    return EMPLOYEE_TYPE_SECTION_ORDER.map((type) => ({
      type,
      rows: buckets.get(type) ?? [],
    })).filter((section) => section.rows.length > 0);
  }, [employeesById, isDatesMode, rows]);

  const navigableColumns = useMemo(
    () =>
      visibleGridColumns
        .map((column) => column.key as AttendanceGridColumnKey)
        .filter((key) => ATTENDANCE_NAVIGABLE_COLUMN_KEYS.includes(key)),
    [visibleGridColumns]
  );

  const navigableRowCount = useMemo(() => {
    const mainCount = employeeTypeSections.reduce((sum, section) => sum + section.rows.length, 0);
    return mainCount + leaveSectionRows.length;
  }, [employeeTypeSections, leaveSectionRows.length]);

  const { getNavInputProps } = useLineGridKeyboardNav(navigableRowCount, navigableColumns.length);

  const navColIndex = useCallback(
    (key: AttendanceGridColumnKey) => navigableColumns.indexOf(key),
    [navigableColumns]
  );

  const cellNavInputProps = useCallback(
    (
      rowIndex: number,
      key: AttendanceGridColumnKey,
      existing?: InputHTMLAttributes<HTMLInputElement>
    ) => {
      const col = navColIndex(key);
      if (col < 0) return existing;
      return mergeLineGridInputProps(getNavInputProps(rowIndex, col), existing);
    },
    [getNavInputProps, navColIndex]
  );

  const cellNavSelectProps = useCallback(
    (
      rowIndex: number,
      key: AttendanceGridColumnKey
    ): {
      'data-line-grid-nav'?: 'true';
      'data-nav-row'?: string;
      'data-nav-col'?: string;
      onKeyDown?: SelectHTMLAttributes<HTMLSelectElement>['onKeyDown'];
    } => {
      const col = navColIndex(key);
      if (col < 0) return {};
      const props = getNavInputProps(rowIndex, col);
      return {
        'data-line-grid-nav': props['data-line-grid-nav'],
        'data-nav-row': props['data-nav-row'],
        'data-nav-col': props['data-nav-col'],
        onKeyDown: props.onKeyDown as SelectHTMLAttributes<HTMLSelectElement>['onKeyDown'],
      };
    },
    [getNavInputProps, navColIndex]
  );

  useLayoutEffect(() => {
    if (!storageKey) return;
    const stashed = readAttendanceGridLocalPref(storageKey);
    if (!stashed) return;
    setGridColumns(mergeStoredGridColumns(defaultGridColumns, stashed));
  }, [defaultGridColumns, storageKey]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!companyId) {
      setPreferencesLoaded(true);
      loadedPreferenceKeyRef.current = attendanceGridPreferenceSessionKey(gridPreferenceKey, undefined);
      return;
    }

    setPreferencesLoaded(false);
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(
          `/api/me/table-preferences/${encodeURIComponent(gridPreferenceKey)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) throw new Error('Failed to load table preferences');
        const json = (await response.json()) as { data?: Partial<LineGridPreferencePayload> | null };
        if (controller.signal.aborted) return;

        const remote = json.data;
        const mergedFromServer =
          remote != null ? mergeStoredGridColumns(defaultGridColumns, remote) : null;

        if (mergedFromServer) {
          setGridColumns(mergedFromServer);
          if (storageKey) {
            writeAttendanceGridLocalPref(storageKey, gridColumnsToPreferencePayload(mergedFromServer));
          }
        }

        loadedPreferenceKeyRef.current = preferenceSessionKey;
        setPreferencesLoaded(true);
      } catch {
        if (controller.signal.aborted) return;
        const fallback = storageKey ? readAttendanceGridLocalPref(storageKey) : null;
        setGridColumns(mergeStoredGridColumns(defaultGridColumns, fallback));
        loadedPreferenceKeyRef.current = preferenceSessionKey;
        setPreferencesLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [companyId, defaultGridColumns, gridPreferenceKey, preferenceSessionKey, sessionStatus, storageKey]);

  useEffect(() => {
    if (!preferencesLoaded || loadedPreferenceKeyRef.current !== preferenceSessionKey) {
      return;
    }
    if (!storageKey) return;

    const payload = gridColumnsToPreferencePayload(gridColumns);
    writeAttendanceGridLocalPref(storageKey, payload);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/me/table-preferences/${encodeURIComponent(gridPreferenceKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => undefined);
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [gridColumns, gridPreferenceKey, preferenceSessionKey, preferencesLoaded, storageKey]);

  const setGridColumnVisibility = (key: string) => {
    setGridColumns((current) => {
      const visibleCount = current.filter((column) => column.visible).length;
      return current.map((column) => {
        if (column.key !== key) return column;
        if (column.visible && visibleCount === 1) return column;
        return { ...column, visible: !column.visible };
      });
    });
  };

  const moveGridColumn = (key: string, direction: 'left' | 'right') => {
    setGridColumns((current) => {
      const index = current.findIndex((column) => column.key === key);
      if (index < 0) return current;
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [column] = next.splice(index, 1);
      next.splice(targetIndex, 0, column);
      return next;
    });
  };

  const beginHeaderResize = (e: React.PointerEvent<HTMLButtonElement>, columnKey: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const col = gridColumns.find((c) => c.key === columnKey);
    if (!col) return;

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startWidth = col.width;

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const next = startWidth + (moveEvent.clientX - startX);
      setGridColumns((current) =>
        current.map((column) =>
          column.key === columnKey
            ? {
                ...column,
                width: Math.max(column.minWidth ?? 64, Math.min(column.maxWidth ?? 420, next)),
              }
            : column
        )
      );
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const renderGridCell = (
    columnKey: AttendanceGridColumnKey,
    ctx: {
      draft: AttendanceGridDraftRow;
      idx: number;
      navRowIndex: number;
      employee: AttendanceGridEmployee | undefined;
      employeeType: EmployeeTypeKey;
      basicMinutes: number;
      workedMinutes: number;
      overtimeMinutes: number;
      sourceBadgeVariant: 'default' | 'secondary' | 'outline';
      assignmentMeta: AttendanceGridAssignmentMeta | undefined;
    }
  ) => {
    const cellClassName = 'min-w-0 border-r border-border/80 last:border-r-0';
    const { draft, idx, navRowIndex, employee, employeeType, basicMinutes, workedMinutes, overtimeMinutes, sourceBadgeVariant, assignmentMeta } =
      ctx;
    const rowKey = resolveDraftRowKey(draft, resolveRowKey);
    const rowAssignmentOptions = assignmentOptionsForRow?.(draft) ?? assignmentOptions;

    switch (columnKey) {
      case 'line':
        return (
          <div
            key={columnKey}
            className={cn(
              cellClassName,
              'bg-black/3 px-2 py-1.5 font-mono text-xs font-medium text-foreground dark:bg-white/4'
            )}
          >
            {idx + 1}
          </div>
        );
      case 'employee':
        if (isDatesMode) {
          return (
            <div key={columnKey} className={cn(cellClassName, 'px-2 py-1.5')}>
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="date"
                  value={draft.workDate ?? ''}
                  min={monthDateBounds?.min}
                  max={monthDateBounds?.max}
                  disabled={!canEdit || draft.source === 'existing' || !onWorkDateChange}
                  onChange={(e) => onWorkDateChange?.(rowKey, e.target.value)}
                  className={cn(FLAT_INPUT_CLASS, 'text-xs font-semibold')}
                />
                {draft.workDate ? (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {formatDateCellLabel(draft.workDate)}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={sourceBadgeVariant} className={cn(COMPACT_TAG_BASE, 'uppercase')}>
                  {draft.source}
                </Badge>
                {onRemoveRow && canEdit ? (
                  <button
                    type="button"
                    className={cn(
                      COMPACT_TAG_BASE,
                      'border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50'
                    )}
                    disabled={Boolean(draft.leaveRequestId)}
                    title={draft.leaveRequestId ? 'Linked to leave management' : 'Remove row'}
                    onClick={() => onRemoveRow(rowKey)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          );
        }
        return (
          <div key={columnKey} className={cn(cellClassName, 'px-2 py-1.5')}>
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                {employeeDisplayName(employee) || 'Unknown employee'}
              </p>
              <EmployeeTypeTag type={employeeType} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-medium text-foreground/75">{employee?.employeeCode ?? ''}</span>
              {employee?.status && employee.status !== 'ACTIVE' ? (
                <Badge variant="outline" className={cn(COMPACT_TAG_BASE, 'normal-case')}>
                  {employee.status.replace('_', ' ')}
                </Badge>
              ) : null}
              <Badge variant={sourceBadgeVariant} className={cn(COMPACT_TAG_BASE, 'uppercase')}>
                {draft.source}
              </Badge>
            </div>
          </div>
        );
      case 'job':
        if (includeAllJobs) {
          const selectedJobId =
            draft.externalJobId ||
            (draft.workAssignmentId
              ? assignmentJobIdByAssignmentId.get(draft.workAssignmentId) ?? ''
              : '');
          if (allJobsLoading) {
            return (
              <div
                key={columnKey}
                className={cn(
                  cellClassName,
                  'flex items-center bg-background/60 px-2 py-1.5 text-xs text-muted-foreground dark:bg-background/40'
                )}
              >
                Loading jobs…
              </div>
            );
          }
          return (
            <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
              <SearchSelect
                value={selectedJobId}
                onChange={(jobId) => onAllJobsChange(rowKey, jobId)}
                onBlurInputValue={(value) => {
                  if (value.trim() === '') onAllJobsChange(rowKey, '');
                }}
                placeholder={allJobOptions.length === 0 ? 'No active jobs' : 'Job num'}
                disabled={!canEdit || allJobOptions.length === 0}
                minCharactersToSearch={1}
                dropdownInPortal
                allowClearButton={false}
                passThroughArrowKeys
                renderItem={(item) => {
                  if (!item.id) return <span className="text-muted-foreground">—</span>;
                  const option = allJobOptions.find((entry) => entry.value === item.id);
                  const jobNumber = option?.label?.trim() ?? item.label;
                  const meta = [option?.customerName, option?.siteName].filter(Boolean).join(' · ');
                  return (
                    <div>
                      <div className="font-medium">{jobNumber}</div>
                      {meta ? <div className="text-[11px] text-muted-foreground">{meta}</div> : null}
                    </div>
                  );
                }}
                items={[
                  { id: '', label: '', searchText: '' },
                  ...allJobOptions.map((option) => ({
                    id: option.value,
                    label: option.label,
                    searchText: option.searchText,
                  })),
                ]}
                inputProps={cellNavInputProps(navRowIndex, 'job', {
                  className:
                    '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
                })}
              />
            </div>
          );
        }
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <SearchSelect
              value={draft.workAssignmentId}
              onChange={(value) => onAssignmentChange(rowKey, value)}
              onBlurInputValue={(value) => {
                if (value.trim() === '') onAssignmentChange(rowKey, '');
              }}
              placeholder="Job num"
              disabled={!canEdit}
              minCharactersToSearch={1}
              dropdownInPortal
              allowClearButton={false}
              passThroughArrowKeys
              renderItem={(item) => {
                if (!item.id) return <span className="text-muted-foreground">—</span>;
                const option = rowAssignmentOptions.find((entry) => entry.value === item.id);
                const teamLabel = option?.teamLabel?.trim() ?? '';
                const jobNumber = option?.label?.trim() ?? '';
                const text =
                  teamLabel && jobNumber
                    ? `${teamLabel} · ${jobNumber}`
                    : teamLabel || jobNumber || '—';
                return <div className="font-medium">{text}</div>;
              }}
              items={[
                { id: '', label: '', searchText: '' },
                ...rowAssignmentOptions.map((option) => ({
                  id: option.value,
                  label: option.label,
                  searchText: option.searchText,
                })),
              ]}
              inputProps={cellNavInputProps(navRowIndex, 'job', {
                className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
              })}
            />
          </div>
        );
      case 'customer':
        return (
          <div key={columnKey} className={cn(cellClassName, 'flex items-center px-2 py-1.5')}>
            <ReadOnlyMetaCell value={assignmentMeta?.customerName} />
          </div>
        );
      case 'site':
        return (
          <div key={columnKey} className={cn(cellClassName, 'flex items-center px-2 py-1.5')}>
            <ReadOnlyMetaCell value={assignmentMeta?.siteName} />
          </div>
        );
      case 'project':
        return (
          <div key={columnKey} className={cn(cellClassName, 'flex items-center px-2 py-1.5')}>
            <ReadOnlyMetaCell value={assignmentMeta?.projectDetails} />
          </div>
        );
      case 'dutyIn':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              {...cellNavInputProps(navRowIndex, 'dutyIn')}
              value={draft.checkInAt}
              onChange={(value) => onUpdateRow(rowKey, { checkInAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'breakOut':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              {...cellNavInputProps(navRowIndex, 'breakOut')}
              value={draft.breakInAt}
              onChange={(value) => onUpdateRow(rowKey, { breakInAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'breakIn':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              {...cellNavInputProps(navRowIndex, 'breakIn')}
              value={draft.breakOutAt}
              onChange={(value) => onUpdateRow(rowKey, { breakOutAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'dutyOut':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              {...cellNavInputProps(navRowIndex, 'dutyOut')}
              value={draft.checkOutAt}
              onChange={(value) => onUpdateRow(rowKey, { checkOutAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'basicHr':
        return (
          <div
            key={columnKey}
            className={cn(
              cellClassName,
              'flex items-center bg-black/2 px-2 py-1.5 text-right font-mono text-xs font-medium text-foreground dark:bg-white/3'
            )}
          >
            {formatHourValue(basicMinutes)}
          </div>
        );
      case 'totalHr':
        return (
          <div key={columnKey} className={cn(cellClassName, 'flex items-center px-2 py-1.5')}>
            <span
              className={cn(
                'inline-flex rounded-md px-2 py-0.5 font-mono text-xs font-medium tabular-nums',
                workedHourTone(workedMinutes)
              )}
            >
              {formatHourValue(workedMinutes)}
            </span>
          </div>
        );
      case 'overtime':
        return (
          <div
            key={columnKey}
            className={cn(
              cellClassName,
              'flex items-center px-2 py-1.5 font-mono text-xs font-medium tabular-nums',
              overtimeMinutes > 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-foreground/60'
            )}
          >
            {formatHourValue(overtimeMinutes)}
          </div>
        );
      case 'status': {
        const unpaidLeaveTypeId = defaultUnpaidLeaveTypeId(leaveTypes);

        return (
          <div key={columnKey} className={cn(cellClassName, 'py-1')}>
            <select
              {...cellNavSelectProps(navRowIndex, 'status')}
              value={draft.status}
              onChange={(e) => {
                const next = e.target.value as AttendanceGridDraftRow['status'];
                if (next === 'PRESENT') {
                  onUpdateRow(rowKey, {
                    status: 'PRESENT',
                    leaveTypeId: null,
                  });
                  return;
                }
                onUpdateRow(rowKey, {
                  status: 'ABSENT',
                  leaveTypeId: unpaidLeaveTypeId,
                  workAssignmentId: '',
                  externalJobId: null,
                  jobNumber: '',
                  checkInAt: '',
                  checkOutAt: '',
                  breakInAt: '',
                  breakOutAt: '',
                });
              }}
              disabled={!canEdit}
              className={cn(FLAT_INPUT_CLASS, 'text-xs')}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );
      }
      case 'leave': {
        const previewLabel = isDatesMode
          ? leavePreviewByRowKey[rowKey]
          : leavePreviewByEmployeeId[draft.employeeId];

        return (
          <div key={columnKey} className={cn(cellClassName, 'py-1.5 text-xs text-muted-foreground')}>
            {previewLabel ? (
              <span title="From approved leave in Leave management">{previewLabel}</span>
            ) : (
              <span className="text-foreground/40">—</span>
            )}
          </div>
        );
      }
      case 'remarks':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <input
              type="text"
              value={draft.remarks ?? ''}
              onChange={(e) => onUpdateRow(rowKey, { remarks: e.target.value })}
              disabled={!canEdit}
              placeholder="Notes…"
              {...cellNavInputProps(navRowIndex, 'remarks', {
                className: cn(FLAT_INPUT_CLASS, 'text-xs'),
              })}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const renderDraftGridRow = (
    draft: AttendanceGridDraftRow,
    idx: number,
    navRowIndex: number,
    leaveAccent = false
  ) => {
    const rowKey = resolveDraftRowKey(draft, resolveRowKey);
    const employee = employeesById.get(draft.employeeId);
    const basicMinutes = draftBasicMinutes(draft, employee);
    const workedMinutes = calculateWorkedMinutes(draft);
    const overtimeMinutes = isDraftNonWorking(draft) ? 0 : Math.max(0, workedMinutes - basicMinutes);
    const employeeType = employee?.employeeType ?? 'LABOUR_WORKER';
    const rowTone = isDraftNonWorking(draft) ? ABSENT_ROW_TONE : EMPLOYEE_TYPE_ROW_TONE[employeeType];
    const sourceBadgeVariant: 'default' | 'secondary' | 'outline' =
      draft.source === 'existing' ? 'default' : draft.source === 'schedule' ? 'secondary' : 'outline';
    const assignmentMeta = draft.workAssignmentId
      ? assignmentsById.get(draft.workAssignmentId)
      : draft.externalJobId
        ? externalJobMetaById.get(draft.externalJobId)
        : undefined;

    return (
      <div
        key={rowKey}
        className={cn('grid border-b border-border', rowTone, leaveAccent && LEAVE_SECTION_ROW_TONE)}
        style={{ gridTemplateColumns }}
      >
        {visibleGridColumns.map((column) =>
          renderGridCell(column.key as AttendanceGridColumnKey, {
            draft,
            idx,
            navRowIndex,
            employee,
            employeeType,
            basicMinutes,
            workedMinutes,
            overtimeMinutes,
            sourceBadgeVariant,
            assignmentMeta,
          })
        )}
      </div>
    );
  };

  return (
		<div className='flex flex-col'>
			<div className='shrink-0 border-b border-border bg-muted/40 px-2 py-1.5'>
				<div className='flex items-center justify-between gap-2'>
					<div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
						{filters}
					</div>
					<div className='flex shrink-0 items-center gap-1.5'>
						<div className='mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-medium leading-none text-muted-foreground'>
							<span className='font-semibold uppercase tracking-[0.14em] text-foreground'>
								{isDatesMode ? 'Day sheet' : 'Indicator'}
							</span>
							<span className='inline-flex items-center gap-1'>
								<span
									className='size-2 rounded-sm bg-sky-600 dark:bg-sky-400'
									aria-hidden
								/>
								&lt; 6 h
							</span>
							<span className='inline-flex items-center gap-1'>
								<span
									className='size-2 rounded-sm bg-amber-500'
									aria-hidden
								/>
								&gt; 12 h
							</span>
							<span className='inline-flex items-center gap-1'>
								<span
									className='size-2 rounded-sm bg-destructive'
									aria-hidden
								/>
								&gt; 14 h
							</span>
						</div>
						{chromeStats ? (
							<div className='flex shrink-0 items-center gap-1.5'>
								{chromeStats}
							</div>
						) : null}
						<LineGridColumnSettings
							columns={gridColumns}
							onToggle={setGridColumnVisibility}
							onMove={moveGridColumn}
							trigger='icon'
						/>
					</div>
				</div>
			</div>

			<div className='overflow-x-auto overscroll-x-contain'>
				<div className='min-w-max'>
					<div
						className='grid border-b border-border bg-muted/50'
						style={{ gridTemplateColumns }}
					>
						{visibleGridColumns.map((column) => (
							<div
								key={column.key}
								className='relative flex min-w-0 items-center border-r border-border py-1 pl-2 pr-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground last:border-r-0'
							>
								<div className='flex min-w-0 flex-1 items-center gap-1 pr-2'>
									<span className='min-w-0 flex-1 truncate'>
										{column.label}
									</span>
									{column.key === 'job' ? (
										<button
											type='button'
											title={
												includeAllJobs
													? 'Showing all active jobs'
													: 'Show all active jobs (not only schedule)'
											}
											aria-pressed={includeAllJobs}
											aria-label={
												includeAllJobs
													? 'Using all active jobs'
													: 'Use schedule jobs only'
											}
											onClick={() => onIncludeAllJobsChange(!includeAllJobs)}
											className={cn(
												'relative z-2 shrink-0 rounded border px-1 py-0.5 text-[8px] font-bold normal-case tracking-normal transition-colors',
												includeAllJobs
													? 'border-primary/50 bg-primary/15 text-primary'
													: 'border-border bg-background text-muted-foreground hover:bg-muted',
												allJobsLoading && includeAllJobs ? 'opacity-60' : ''
											)}
											disabled={allJobsLoading}
										>
											All
										</button>
									) : null}
								</div>
								<button
									type='button'
									aria-label={`Resize ${column.label} column`}
									className='absolute right-0 top-0 z-1 h-full w-2 max-w-[10px] touch-none cursor-col-resize border-0 bg-transparent p-0 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
									onPointerDown={(ev) =>
										beginHeaderResize(ev, column.key)
									}
								/>
							</div>
						))}
					</div>

					{rows.length === 0 && leaveSectionRows.length === 0 ? (
						<div className='px-4 py-8 text-center text-sm text-muted-foreground'>
							{emptyMessage}
						</div>
					) : (
						<>
							{(() => {
								let lineIndex = 0;
								let navRowIndex = 0;
								return employeeTypeSections.map((section) => {
									const header = EMPLOYEE_TYPE_SECTION_HEADER[section.type];
									return (
										<Fragment key={section.type}>
											{!isDatesMode
												? renderGridSectionHeader(
														gridTemplateColumns,
														header.title,
														`${section.rows.length} employee${section.rows.length === 1 ? '' : 's'}`,
														header
													)
												: null}
											{section.rows.map((draft) => {
												const row = renderDraftGridRow(draft, lineIndex, navRowIndex);
												lineIndex += 1;
												navRowIndex += 1;
												return row;
											})}
										</Fragment>
									);
								});
							})()}
							{leaveSectionRows.length > 0 ? (
								<>
									{renderGridSectionHeader(
										gridTemplateColumns,
										'On leave / assigned leave',
										'On-leave employees default to absent; set Present if they came to work.',
										{ borderClass: 'border-amber-500/50', bgClass: 'bg-amber-500/8' }
									)}
									{(() => {
										let lineIndex = employeeTypeSections.reduce(
											(sum, section) => sum + section.rows.length,
											0
										);
										let navRowIndex = lineIndex;
										return leaveSectionRows.map((draft) => {
											const row = renderDraftGridRow(draft, lineIndex, navRowIndex, true);
											lineIndex += 1;
											navRowIndex += 1;
											return row;
										});
									})()}
								</>
							) : null}
						</>
					)}
					{tableFooter}
				</div>
			</div>
		</div>
  );
}
