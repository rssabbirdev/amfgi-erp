'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import SearchSelect from '@/components/ui/SearchSelect';
import LineGridColumnSettings, {
  type LineGridColumnConfig,
} from '@/components/stock/LineGridColumnSettings';
import { Badge } from '@/components/ui/shadcn/badge';
import {
  defaultUnpaidLeaveTypeId,
  isDraftNonWorking,
  type LeaveTypeOption,
} from '@/lib/hr/attendanceDraftStatus';
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
  workAssignmentId: string;
  jobNumber: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY' | 'MISSING_PUNCH';
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
  searchText: string;
}

export interface AttendanceGridAssignmentMeta {
  customerName: string | null;
  siteName: string | null;
  projectDetails: string | null;
}

interface AttendanceEntryGridProps {
  rows: AttendanceGridDraftRow[];
  employeesById: Map<string, AttendanceGridEmployee>;
  assignmentsById: Map<string, AttendanceGridAssignmentMeta>;
  assignmentOptions: AssignmentOption[];
  leaveTypes: LeaveTypeOption[];
  canEdit: boolean;
  emptyMessage: string;
  /** Left side of the day-sheet chrome row (search, scope, add employee). */
  filters?: ReactNode;
  /** Shown to the right of the “Day sheet” label (e.g. assigned / worked stats). */
  chromeStats?: ReactNode;
  onUpdateRow: (employeeId: string, patch: Partial<AttendanceGridDraftRow>) => void;
  onAssignmentChange: (employeeId: string, assignmentId: string) => void;
}

const ATTENDANCE_GRID_PREFERENCE_KEY = 'hr-attendance-create-line-grid';

const STATUS_OPTIONS: Array<{ value: AttendanceGridDraftRow['status']; label: string }> = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'On leave' },
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
  | 'remarks';

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
  { key: 'status', label: 'Status', visible: true, width: 148, minWidth: 120, maxWidth: 220 },
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

const COMPACT_TAG_BASE =
  'inline-flex h-auto shrink-0 items-center rounded border px-1 py-px text-[9px] font-medium leading-none tracking-wide';

const FLAT_INPUT_CLASS =
  'h-full w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50';

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

function getAttendanceGridLocalStorageKey(companyId: string) {
  return `attendance-line-grid:${ATTENDANCE_GRID_PREFERENCE_KEY}:${companyId}`;
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
    const padded = numericPart.padStart(4, '0');
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2, 4));
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
      className={cn(
        FLAT_INPUT_CLASS,
        'text-xs tabular-nums',
        isInvalid && 'bg-destructive/10 text-destructive placeholder:text-destructive/60'
      )}
    />
  );
}

export default function AttendanceEntryGrid({
  rows,
  employeesById,
  assignmentsById,
  assignmentOptions,
  leaveTypes,
  canEdit,
  emptyMessage,
  filters,
  chromeStats,
  onUpdateRow,
  onAssignmentChange,
}: AttendanceEntryGridProps) {
  const { data: session, status: sessionStatus } = useSession();
  const companyId = session?.user?.activeCompanyId;
  const storageKey = useMemo(
    () => (companyId ? getAttendanceGridLocalStorageKey(companyId) : null),
    [companyId]
  );

  const [gridColumns, setGridColumns] = useState<LineGridColumnConfig[]>(DEFAULT_GRID_COLUMNS);
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

  useLayoutEffect(() => {
    if (!storageKey) return;
    const stashed = readAttendanceGridLocalPref(storageKey);
    if (!stashed) return;
    setGridColumns(mergeStoredGridColumns(DEFAULT_GRID_COLUMNS, stashed));
  }, [storageKey]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!companyId) {
      setPreferencesLoaded(true);
      loadedPreferenceKeyRef.current = `${ATTENDANCE_GRID_PREFERENCE_KEY}:`;
      return;
    }

    setPreferencesLoaded(false);
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(
          `/api/me/table-preferences/${encodeURIComponent(ATTENDANCE_GRID_PREFERENCE_KEY)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) throw new Error('Failed to load table preferences');
        const json = (await response.json()) as { data?: Partial<LineGridPreferencePayload> | null };
        if (controller.signal.aborted) return;

        const remote = json.data;
        const mergedFromServer =
          remote != null ? mergeStoredGridColumns(DEFAULT_GRID_COLUMNS, remote) : null;

        if (mergedFromServer) {
          setGridColumns(mergedFromServer);
          if (storageKey) {
            writeAttendanceGridLocalPref(storageKey, gridColumnsToPreferencePayload(mergedFromServer));
          }
        }

        loadedPreferenceKeyRef.current = `${ATTENDANCE_GRID_PREFERENCE_KEY}:${companyId}`;
        setPreferencesLoaded(true);
      } catch {
        if (controller.signal.aborted) return;
        const fallback = storageKey ? readAttendanceGridLocalPref(storageKey) : null;
        setGridColumns(mergeStoredGridColumns(DEFAULT_GRID_COLUMNS, fallback));
        loadedPreferenceKeyRef.current = `${ATTENDANCE_GRID_PREFERENCE_KEY}:${companyId}`;
        setPreferencesLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [companyId, sessionStatus, storageKey]);

  useEffect(() => {
    if (!preferencesLoaded || loadedPreferenceKeyRef.current !== `${ATTENDANCE_GRID_PREFERENCE_KEY}:${companyId ?? ''}`) {
      return;
    }
    if (!storageKey) return;

    const payload = gridColumnsToPreferencePayload(gridColumns);
    writeAttendanceGridLocalPref(storageKey, payload);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/me/table-preferences/${encodeURIComponent(ATTENDANCE_GRID_PREFERENCE_KEY)}`, {
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
  }, [gridColumns, preferencesLoaded, storageKey, companyId]);

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
    const { draft, idx, employee, employeeType, basicMinutes, workedMinutes, overtimeMinutes, sourceBadgeVariant, assignmentMeta } =
      ctx;

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
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <SearchSelect
              value={draft.workAssignmentId}
              onChange={(value) => onAssignmentChange(draft.employeeId, value)}
              onBlurInputValue={(value) => {
                if (value.trim() === '') onAssignmentChange(draft.employeeId, '');
              }}
              placeholder="Job num"
              disabled={!canEdit}
              openOnFocus
              minCharactersToSearch={0}
              dropdownInPortal
              items={[
                { id: '', label: '', searchText: '' },
                ...assignmentOptions.map((option) => ({
                  id: option.value,
                  label: option.label,
                  searchText: option.searchText,
                })),
              ]}
              inputProps={{
                className: '!rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-sm focus:!ring-0 min-w-0',
              }}
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
              value={draft.checkInAt}
              onChange={(value) => onUpdateRow(draft.employeeId, { checkInAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'breakOut':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              value={draft.breakInAt}
              onChange={(value) => onUpdateRow(draft.employeeId, { breakInAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'breakIn':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              value={draft.breakOutAt}
              onChange={(value) => onUpdateRow(draft.employeeId, { breakOutAt: value })}
              disabled={!canEdit}
            />
          </div>
        );
      case 'dutyOut':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <TimeEntryInput
              value={draft.checkOutAt}
              onChange={(value) => onUpdateRow(draft.employeeId, { checkOutAt: value })}
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
        const leaveTypeName = leaveTypes.find((t) => t.id === draft.leaveTypeId)?.name;
        const statusValue =
          draft.status === 'LEAVE' ? 'LEAVE' : draft.status === 'ABSENT' ? 'ABSENT' : 'PRESENT';
        const statusOptions =
          draft.status === 'LEAVE'
            ? STATUS_OPTIONS
            : STATUS_OPTIONS.filter((opt) => opt.value !== 'LEAVE');

        return (
          <div key={columnKey} className={cn(cellClassName, 'flex flex-col gap-0.5 py-1')}>
            <select
              value={statusValue}
              onChange={(e) => {
                const next = e.target.value as AttendanceGridDraftRow['status'];
                if (next === 'PRESENT') {
                  onUpdateRow(draft.employeeId, { status: 'PRESENT', leaveTypeId: null });
                  return;
                }
                if (next === 'ABSENT') {
                  onUpdateRow(draft.employeeId, {
                    status: 'ABSENT',
                    leaveTypeId: unpaidLeaveTypeId,
                    leaveRequestId: null,
                    attendanceSource: null,
                  });
                  return;
                }
                onUpdateRow(draft.employeeId, {
                  status: 'LEAVE',
                  leaveTypeId: draft.leaveTypeId,
                });
              }}
              disabled={!canEdit}
              className={cn(FLAT_INPUT_CLASS, 'text-xs')}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {draft.status === 'LEAVE' ? (
              <span className="px-0.5 text-[10px] text-muted-foreground">
                {leaveTypeName ?? 'Leave'} · via leave management
              </span>
            ) : null}
          </div>
        );
      }
      case 'remarks':
        return (
          <div key={columnKey} className={cn(cellClassName, 'bg-background/60 dark:bg-background/40')}>
            <input
              type="text"
              value={draft.remarks ?? ''}
              onChange={(e) => onUpdateRow(draft.employeeId, { remarks: e.target.value })}
              disabled={!canEdit}
              placeholder="Notes…"
              className={cn(FLAT_INPUT_CLASS, 'text-xs')}
            />
          </div>
        );
      default:
        return null;
    }
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
								Indicator
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
								<span className='min-w-0 flex-1 truncate pr-1'>
									{column.label}
								</span>
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

					{rows.length === 0 ? (
						<div className='px-4 py-8 text-center text-sm text-muted-foreground'>
							{emptyMessage}
						</div>
					) : (
						rows.map((draft, idx) => {
							const employee = employeesById.get(
								draft.employeeId,
							);
							const basicMinutes = draftBasicMinutes(draft, employee);
							const workedMinutes = calculateWorkedMinutes(draft);
							const overtimeMinutes = isDraftNonWorking(draft)
								? 0
								: Math.max(0, workedMinutes - basicMinutes);
							const employeeType =
								employee?.employeeType ?? 'LABOUR_WORKER';
							const rowTone = isDraftNonWorking(draft)
								? ABSENT_ROW_TONE
								: EMPLOYEE_TYPE_ROW_TONE[employeeType];
							const sourceBadgeVariant: 'default' | 'secondary' | 'outline' =
								draft.source === 'existing'
									? 'default'
									: draft.source === 'schedule'
										? 'secondary'
										: 'outline';
							const assignmentMeta = draft.workAssignmentId
								? assignmentsById.get(draft.workAssignmentId)
								: undefined;

							const cellCtx = {
								draft,
								idx,
								employee,
								employeeType,
								basicMinutes,
								workedMinutes,
								overtimeMinutes,
								sourceBadgeVariant,
								assignmentMeta,
							};

							return (
								<div
									key={draft.employeeId}
									className={cn(
										'grid border-b border-border',
										rowTone,
									)}
									style={{ gridTemplateColumns }}
								>
									{visibleGridColumns.map((column) =>
										renderGridCell(
											column.key as AttendanceGridColumnKey,
											cellCtx,
										),
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
  );
}
