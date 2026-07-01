'use client';

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useStore } from 'react-redux';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Separator } from '@/components/ui/shadcn/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/shadcn/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import CreateEmployeeModal from '@/components/hr/CreateEmployeeModal';
import { EmployeeMetaSelect } from '@/components/hr/EmployeeMetaSelect';
import ScheduleSearchSelect from '@/components/hr/ScheduleSearchSelect';
import { ScheduleWorkerPoolCard } from '@/components/hr/ScheduleWorkerPoolCard';
import TimeEntryInput from '@/components/hr/TimeEntryInput';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import { startScheduleDragPreview } from '@/lib/hr/schedulePointerDragPreview';
import { isCoarsePointerDevice } from '@/lib/utils/coarsePointer';
import type { EmployeeTypeTimingSetting } from '@/lib/hr/employeeTypeSettings';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import {
  fetchEmployeesByIds,
  fetchJobsByIds,
  employeeToSearchItem,
  hrEmployeeToScheduleRow,
  normalizeScheduleJobRow,
  searchEmployeePickerItems,
  toScheduleEmployee,
  type EmployeeSearchItem,
  type ScheduleEmployeeRow,
  type ScheduleJobRow,
} from '@/lib/hr/scheduleSearchApi';
import {
  SCHEDULE_EMPLOYEE_LIST_PARAMS,
  SCHEDULE_JOB_PICKER_LIST_PARAMS,
  filterScheduleJobSearchItems,
  jobRecordToScheduleRow,
  scheduleJobToSearchItem,
} from '@/lib/hr/scheduleJobPicker';
import {
  clearLegacyScheduleViewPrefsLocalStorage,
  defaultScheduleViewPrefs,
  normalizeScheduleViewPrefs,
  readLegacyScheduleViewPrefsFromLocalStorage,
  type ScheduleRowSettings,
} from '@/lib/hr/scheduleViewPrefs';
import {
  formatScheduleHourBreakSummary,
  validateScheduleForPublish,
  type SchedulePublishLowHourTeam,
} from '@/lib/hr/schedulePublishValidation';
import { useScheduleCollaboration } from '@/hooks/useScheduleCollaboration';
import { useHrLiveUpdate } from '@/lib/hr/hrLiveUpdate';
import { useJobLiveUpdate } from '@/lib/jobs/jobLiveUpdate';
import { invalidateJobCaches } from '@/lib/jobs/jobCacheInvalidation';
import { jobsApi } from '@/store/api/endpoints/jobs';
import {
  useAppDispatch,
  useAppSelector,
  useGetHrEmployeesPageQuery,
  useGetJobsPageQuery,
  useUpdateJobMutation,
} from '@/store/hooks';
import type { RootState } from '@/store/store';
import type { WorkScheduleContext } from '@/lib/utils/templateData';
import {
  buildEmployeeTeamAssignmentMap,
  buildMultiAssignedWorkerSummary,
  collectDraftPrintTeamAssignments,
  formatNumberedScheduleWorkerNameForPrint,
  formatScheduleWorkerNameForPrint,
} from '@/lib/hr/scheduleMultiAssignPrint';
import {
  WORK_SCHEDULE_PRINT_CHANNEL,
  WORK_SCHEDULE_PRINT_PAYLOAD_KEY,
  type WorkSchedulePrintPayload,
} from '@/lib/utils/printTemplateSession';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  GripVertical,
  LayoutTemplate,
  Palette,
  Printer,
  Redo2,
  Settings2,
  Slash,
  Tag,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

const GUEST_DRIVER_ROW_PREFIX = 'guest:';

function renderWorkerSearchItem(item: EmployeeSearchItem, isHighlighted: boolean) {
  const preferred = item.preferredName?.trim() || item.fullName;
  const fullName = item.fullName.trim();
  const showFullName = Boolean(fullName && fullName !== preferred);

  return (
    <div className="space-y-0.5">
      <div className={cn('font-medium', isHighlighted ? 'text-primary' : 'text-foreground')}>
        {preferred}
      </div>
      {showFullName ? (
        <div className="text-[11px] text-muted-foreground">{fullName}</div>
      ) : null}
    </div>
  );
}

function SlashedIcon({
  icon: Icon,
  slashed,
  className,
}: {
  icon: LucideIcon;
  slashed: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <Icon className="h-4 w-4" aria-hidden />
      {slashed ? (
        <Slash className="absolute inset-0 h-4 w-4 rotate-90 stroke-[2.5]" aria-hidden />
      ) : null}
    </span>
  );
}

function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function isGuestDriverRowKey(key: string) {
  return key.startsWith(GUEST_DRIVER_ROW_PREFIX);
}

function guestDriverRowKeyFromLogId(logId: string) {
  return `${GUEST_DRIVER_ROW_PREFIX}${logId}`;
}

function createPendingGuestDriverRowKey() {
  return `${GUEST_DRIVER_ROW_PREFIX}pending-${createClientId()}`;
}

type ScheduleDriverLogRecord = {
  id?: string;
  driverEmployeeId?: string | null;
  guestDriverName?: string | null;
  routeText?: string;
  sequence?: number;
  driver?: { id?: string; fullName?: string };
};

interface EmpOpt {
  id: string;
  fullName: string;
  preferredName: string | null;
  employeeCode: string;
  status?: string | null;
  profileExtension?: unknown;
  basicHoursPerDay?: number;
  defaultTiming?: {
    dutyStart?: string;
    dutyEnd?: string;
    breakStart?: string;
    breakEnd?: string;
  } | null;
}
interface JobOpt {
  id: string;
  jobNumber: string;
  status?: string | null;
  customerName?: string | null;
  description?: string | null;
  projectDetails?: string | null;
  projectType?: string | null;
  projectQtyArea?: string | null;
  quotationNumber?: string | null;
  lpoNumber?: string | null;
  site?: string | null;
  finishedGoods?: unknown;
  requiredExpertises?: unknown;
}

type EmployeeProfile = EmpOpt & { workforce: ReturnType<typeof parseWorkforceProfile> };

interface MemberRow {
  employeeId: string;
  role: 'WORKER' | 'HELPER' | 'TEAM_LEADER';
  slot: number;
}

interface subTeamDraft {
  id: string;
  label: string;
  members: MemberRow[];
}

interface AsgDraft {
  columnIndex: number;
  label: string;
  locationType: 'SITE_JOB' | 'FACTORY' | 'OTHER';
  jobId: string;
  factoryCode: string;
  jobNumberSnapshot: string;
  workProcessDetails: string;
  targetQty: string;
  driver1EmployeeId: string;
  driver2EmployeeId: string;
  dutyStart: string;
  dutyEnd: string;
  breakStart: string;
  breakEnd: string;
  remarks: string;
  splitMode: boolean;
  members: MemberRow[];
  subTeams: subTeamDraft[];
}

interface ScheduleTemplateOption {
  id: string;
  workDate: string;
  status: string;
}

type WorkerCreateTarget =
  | { kind: 'flat'; colIdx: number; memberIndex: number }
  | { kind: 'subTeam'; colIdx: number; subTeamIndex: number; memberIndex: number };

type PendingWorkerCreate = {
  suggestedName: string;
  target: WorkerCreateTarget;
};

type PendingInactiveJob = {
  colIdx: number;
  jobId: string;
  jobNumber: string;
  status: string;
};

type PendingStaleJob = PendingInactiveJob;

function prettyJobStatus(status: string) {
  switch (status) {
    case 'ON_HOLD':
      return 'On hold';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'ACTIVE':
      return 'Active';
    default:
      return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

type WorkerDragTarget =
  | { kind: 'flat'; colIdx: number; memberIndex: number }
  | { kind: 'subTeam'; colIdx: number; subTeamIndex: number; memberIndex: number };

type SubTeamDragTarget = { colIdx: number; subTeamIndex: number };

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function scheduleJobCacheSignature(job: {
  id: string;
  status?: string | null;
  updatedAt?: string | Date | null;
}) {
  return `${job.id}:${job.status ?? 'ACTIVE'}:${String(job.updatedAt ?? '')}`;
}

function scheduleJobRowsEqual(a: ScheduleJobRow, b: JobOpt | undefined): boolean {
  if (!b) return false;
  return (
    a.id === b.id &&
    a.jobNumber === b.jobNumber &&
    (a.status ?? 'ACTIVE') === (b.status ?? 'ACTIVE') &&
    (a.customerName ?? '') === (b.customerName ?? '') &&
    (a.description ?? '') === (b.description ?? '') &&
    (a.projectDetails ?? '') === (b.projectDetails ?? '') &&
    (a.projectType ?? '') === (b.projectType ?? '') &&
    (a.projectQtyArea ?? '') === (b.projectQtyArea ?? '') &&
    (a.site ?? '') === (b.site ?? '')
  );
}

function ScheduleDragHandle({
  label,
  disabled,
  onDragStart,
  onDragEnd,
  onPointerDrop,
  className,
}: {
  label: string;
  disabled?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPointerDrop: (clientX: number, clientY: number) => void;
  className?: string;
}) {
  if (disabled) return null;

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-7 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground transition hover:bg-muted active:cursor-grabbing',
        className,
      )}
      title={`Drag to reorder ${label}`}
      aria-label={`Drag to reorder ${label}`}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const handle = e.currentTarget;
        const previewSource = handle.closest('[data-schedule-drag-preview]') as HTMLElement | null;
        handle.setPointerCapture(e.pointerId);
        onDragStart();

        const previewSession = previewSource
          ? startScheduleDragPreview(previewSource, e.clientX, e.clientY)
          : null;

        const clearDropHighlight = () => {
          document
            .querySelectorAll('[data-schedule-drop-active="true"]')
            .forEach((node) => node.removeAttribute('data-schedule-drop-active'));
        };

        const onMove = (pe: PointerEvent) => {
          if (pe.pointerId !== e.pointerId) return;
          pe.preventDefault();
          previewSession?.updateTarget(pe.clientX, pe.clientY);
          clearDropHighlight();
          const over = document
            .elementFromPoint(pe.clientX, pe.clientY)
            ?.closest('[data-schedule-drop]');
          over?.setAttribute('data-schedule-drop-active', 'true');
        };

        const finish = (pe: PointerEvent) => {
          if (pe.pointerId !== e.pointerId) return;
          clearDropHighlight();
          handle.releasePointerCapture(pe.pointerId);
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', finish);
          document.removeEventListener('pointercancel', finish);
          onPointerDrop(pe.clientX, pe.clientY);
          previewSession?.destroy({ animate: true });
          onDragEnd();
        };

        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', finish);
        document.addEventListener('pointercancel', finish);
      }}
    >
      <GripVertical className="pointer-events-none h-3.5 w-3.5" />
    </button>
  );
}

const TEAM_COLUMN_CLASS = 'min-w-[18rem] w-[18rem] max-w-[18rem] align-top overflow-hidden';
const STICKY_ROW_LABEL_CLASS =
  'sticky left-0 z-20 min-w-[7rem] w-[7rem] border-r border-border bg-muted px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)]';

/** In-grid controls — compact sizing for dense schedule grid. */
const SCHEDULE_GRID_FLAT_INPUT =
  'flex h-7 w-full min-w-0 rounded border border-border bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const SCHEDULE_GRID_SEARCH_INPUT =
  '!h-7 !rounded !border !border-border !bg-background !px-1.5 !text-xs focus-visible:!ring-2 focus-visible:!ring-ring min-w-0';

const SUB_TEAM_LABEL_INPUT_CLS =
  'border-violet-300/70 bg-violet-50 font-medium text-violet-950 placeholder:text-violet-400 focus-visible:ring-violet-400/40 dark:border-violet-700/60 dark:bg-violet-950/50 dark:text-violet-50 dark:placeholder:text-violet-500';

const SUB_TEAM_DRAG_HANDLE_CLS =
  'border-violet-300/70 bg-violet-100/80 text-violet-700 hover:bg-violet-200/80 dark:border-violet-700/60 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:bg-violet-900/70';

const SUB_TEAM_DELETE_BTN_CLS =
  'text-violet-600 hover:bg-violet-100 hover:text-destructive dark:text-violet-400 dark:hover:bg-violet-950/60 dark:hover:text-destructive';

function scheduleSearchInputProps(navProps?: Record<string, unknown>) {
  const nav = (navProps ?? {}) as { className?: string; onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void };
  return {
    ...navProps,
    enterKeyHint: 'search' as const,
    className: cn(SCHEDULE_GRID_SEARCH_INPUT, nav.className),
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (
        isCoarsePointerDevice() &&
        (e.key === 'Enter' || e.key === 'Tab') &&
        e.defaultPrevented
      ) {
        return;
      }
      nav.onKeyDown?.(e);
    },
  };
}

function getNextTeamNumber(rows: AsgDraft[]): number {
  const numericLabels = rows
    .map((row) => {
      const match = row.label.match(/Team#(\d+)/i);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return (numericLabels.length > 0 ? Math.max(...numericLabels) : 0) + 1;
}

function parseBrk(raw: string | null | undefined): { breakStart: string; breakEnd: string } {
  if (!raw) return { breakStart: '', breakEnd: '' };
  const m = raw.trim().match(/^(\d{1,2}:\d{2})\s*[-Ã¢â‚¬â€œ]\s*(\d{1,2}:\d{2})$/);
  return m ? { breakStart: m[1], breakEnd: m[2] } : { breakStart: '', breakEnd: '' };
}

function formatScheduleTimeForPrint(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return value;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function getInitialWorkProcessDetails(job: JobOpt | null | undefined): string {
  return String(job?.description ?? '').trim();
}

async function readApiEnvelope<T = Record<string, unknown>>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function nextSubTeamLabel(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) return `Team ${letters[index]}`;
  return `Team ${index + 1}`;
}

const MIN_WORKER_SLOTS = 1;
const WORKER_NAV_SUB_STRIDE = 1000;

function encodePersistedMemberSlot(subTeamIndex: number, memberIndex: number): number {
  return (subTeamIndex + 1) * WORKER_NAV_SUB_STRIDE + memberIndex;
}

function createEmptySubTeam(index: number, withMinSlots = true): subTeamDraft {
  return {
    id: createClientId(),
    label: nextSubTeamLabel(index),
    members: withMinSlots ? normalizeWorkerMemberList([]) : [],
  };
}

function normalizeMemberList(members: MemberRow[]): MemberRow[] {
  return members.map((member, index) => ({
    employeeId: String(member.employeeId ?? ''),
    role: member.role === 'HELPER' || member.role === 'TEAM_LEADER' ? member.role : 'WORKER',
    slot: index + 1,
  }));
}

function normalizeWorkerMemberList(members: MemberRow[]): MemberRow[] {
  const rows: MemberRow[] = members.map((member, index) => ({
    employeeId: String(member.employeeId ?? ''),
    role:
      index === 0 && member.employeeId
        ? member.role === 'HELPER'
          ? 'HELPER'
          : 'TEAM_LEADER'
        : member.role === 'HELPER' && member.employeeId
          ? 'HELPER'
          : 'WORKER',
    slot: index + 1,
  }));

  while (rows.length < MIN_WORKER_SLOTS) {
    rows.push({ employeeId: '', role: 'WORKER', slot: rows.length + 1 });
  }

  if (rows.every((member) => member.employeeId)) {
    rows.push({ employeeId: '', role: 'WORKER', slot: rows.length + 1 });
  }

  return rows;
}

function extractSubTeamsFromMembers(members: MemberRow[]): { splitMode: boolean; members: MemberRow[]; subTeams: subTeamDraft[] } {
  const ordered = [...members].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const encodedMembers = ordered.filter((member) => (member.slot ?? 0) >= WORKER_NAV_SUB_STRIDE);

  if (encodedMembers.length > 0) {
    const subTeamMap = new Map<number, MemberRow[]>();
    for (const member of ordered) {
      const slot = member.slot ?? 0;
      if (slot < WORKER_NAV_SUB_STRIDE) continue;
      const subTeamIndex = Math.floor(slot / WORKER_NAV_SUB_STRIDE) - 1;
      const memberIndex = slot % WORKER_NAV_SUB_STRIDE;
      if (subTeamIndex < 0) continue;
      const rows = subTeamMap.get(subTeamIndex) ?? [];
      rows[memberIndex] = {
        employeeId: member.employeeId,
        role:
          memberIndex === 0 && member.employeeId
            ? member.role === 'HELPER'
              ? 'HELPER'
              : 'TEAM_LEADER'
            : member.role === 'HELPER' && member.employeeId
              ? 'HELPER'
              : 'WORKER',
        slot: memberIndex + 1,
      };
      subTeamMap.set(subTeamIndex, rows);
    }

    const subTeams = [...subTeamMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, rows]) => ({
        id: createClientId(),
        label: nextSubTeamLabel(index),
        members: normalizeMemberList(rows.filter(Boolean)),
      }));

    if (subTeams.length > 0) {
      return {
        splitMode: true,
        members: [],
        subTeams,
      };
    }
  }

  const leaderMembers = ordered.filter((member) => member.role === 'TEAM_LEADER');

  // Single-team schedules also persist the first assigned person as TEAM_LEADER.
  // Treat that as a normal team unless multiple TEAM_LEADER markers exist.
  if (leaderMembers.length <= 1) {
    return {
      splitMode: false,
      members: normalizeMemberList(
        ordered.map((member) => ({
          ...member,
          role: member.role === 'TEAM_LEADER' ? 'WORKER' : member.role,
        }))
      ),
      subTeams: [],
    };
  }

  const subTeams: subTeamDraft[] = [];
  let currentSubTeam: subTeamDraft | null = null;

  for (const member of ordered) {
    if (member.role === 'TEAM_LEADER') {
      currentSubTeam = {
        id: createClientId(),
        label: nextSubTeamLabel(subTeams.length),
        members: [
          {
            employeeId: member.employeeId,
            role: 'TEAM_LEADER',
            slot: 1,
          },
        ],
      };
      subTeams.push(currentSubTeam);
      continue;
    }

    if (!currentSubTeam) {
      currentSubTeam = {
        id: createClientId(),
        label: nextSubTeamLabel(subTeams.length),
        members: [],
      };
      subTeams.push(currentSubTeam);
    }
    currentSubTeam.members.push({
      employeeId: member.employeeId,
      role: member.role === 'HELPER' ? 'HELPER' : 'WORKER',
      slot: currentSubTeam.members.length + 1,
    });
  }

  return {
    splitMode: true,
    members: [],
    subTeams: subTeams.map((subTeam, index) => ({
      ...subTeam,
      label: subTeam.label || nextSubTeamLabel(index),
      members: normalizeMemberList(subTeam.members),
    })),
  };
}

/** Deep snapshot so undo/redo stacks are not mutated by later edits. */
function cloneDrafts(drafts: AsgDraft[]): AsgDraft[] {
  return JSON.parse(JSON.stringify(drafts)) as AsgDraft[];
}

type ScheduleEditorSnapshot = {
  drafts: AsgDraft[];
  jobDescriptionEdits: Record<string, string>;
};

function cloneJobDescriptionEdits(edits: Record<string, string>): Record<string, string> {
  return JSON.parse(JSON.stringify(edits)) as Record<string, string>;
}

function cloneEditorSnapshot(snapshot: ScheduleEditorSnapshot): ScheduleEditorSnapshot {
  return {
    drafts: cloneDrafts(snapshot.drafts),
    jobDescriptionEdits: cloneJobDescriptionEdits(snapshot.jobDescriptionEdits),
  };
}

function effectiveJobDescriptionEdits(
  drafts: AsgDraft[],
  jobDescriptionEdits: Record<string, string>,
  getJob: (id: string) => JobOpt | undefined,
): Record<string, string> {
  const result = cloneJobDescriptionEdits(jobDescriptionEdits);
  for (const draft of drafts) {
    const jobId = draft.jobId;
    if (!jobId) continue;
    if (Object.prototype.hasOwnProperty.call(result, jobId)) continue;
    result[jobId] = String(getJob(jobId)?.description ?? '');
  }
  return result;
}

function captureEditorSnapshot(
  drafts: AsgDraft[],
  jobDescriptionEdits: Record<string, string>,
  getJob: (id: string) => JobOpt | undefined,
): ScheduleEditorSnapshot {
  return cloneEditorSnapshot({
    drafts,
    jobDescriptionEdits: effectiveJobDescriptionEdits(drafts, jobDescriptionEdits, getJob),
  });
}

function draftsEqual(a: AsgDraft[], b: AsgDraft[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeDraft(raw: Partial<AsgDraft>, fallbackIndex = 0): AsgDraft {
  const baseMembers = Array.isArray(raw.members) ? normalizeMemberList(raw.members) : [];
  const derived = extractSubTeamsFromMembers(baseMembers);
  const subTeams = Array.isArray(raw.subTeams) && raw.subTeams.length > 0
    ? raw.subTeams.map((subTeam, index) => ({
        id: subTeam.id || createClientId(),
        label: subTeam.label || nextSubTeamLabel(index),
        members: normalizeMemberList(Array.isArray(subTeam.members) ? subTeam.members : []),
      }))
    : derived.subTeams;

  const splitMode = typeof raw.splitMode === 'boolean' ? raw.splitMode : subTeams.length > 0 || derived.splitMode;

  return {
    columnIndex: typeof raw.columnIndex === 'number' ? raw.columnIndex : fallbackIndex + 1,
    label: String(raw.label ?? `Team#${fallbackIndex + 1}`),
    locationType: raw.locationType === 'FACTORY' || raw.locationType === 'OTHER' ? raw.locationType : 'SITE_JOB',
    jobId: String(raw.jobId ?? ''),
    factoryCode: String(raw.factoryCode ?? ''),
    jobNumberSnapshot: String(raw.jobNumberSnapshot ?? ''),
    workProcessDetails: String(raw.workProcessDetails ?? ''),
    targetQty: String(raw.targetQty ?? ''),
    driver1EmployeeId: String(raw.driver1EmployeeId ?? ''),
    driver2EmployeeId: String(raw.driver2EmployeeId ?? ''),
    dutyStart: String(raw.dutyStart ?? ''),
    dutyEnd: String(raw.dutyEnd ?? ''),
    breakStart: String(raw.breakStart ?? ''),
    breakEnd: String(raw.breakEnd ?? ''),
    remarks: String(raw.remarks ?? ''),
    splitMode,
    members: splitMode ? [] : normalizeWorkerMemberList(baseMembers),
    subTeams: splitMode
      ? subTeams.map((subTeam) => ({
          ...subTeam,
          members: normalizeWorkerMemberList(subTeam.members),
        }))
      : [],
  };
}

function createEmptyDraft(columnIndex: number, label: string): AsgDraft {
  return {
    columnIndex,
    label,
    locationType: 'SITE_JOB',
    jobId: '',
    factoryCode: '',
    jobNumberSnapshot: '',
    workProcessDetails: '',
    targetQty: '',
    driver1EmployeeId: '',
    driver2EmployeeId: '',
    dutyStart: '',
    dutyEnd: '',
    breakStart: '',
    breakEnd: '',
    remarks: '',
    splitMode: false,
    members: normalizeWorkerMemberList([]),
    subTeams: [],
  };
}

function applyTimingFromTemplate(
  draft: AsgDraft,
  timing:
    | {
        dutyStart?: string;
        dutyEnd?: string;
        breakStart?: string;
        breakEnd?: string;
      }
    | null
    | undefined
): AsgDraft {
  if (!timing) return draft;
  return {
    ...draft,
    dutyStart: draft.dutyStart || timing.dutyStart || '',
    dutyEnd: draft.dutyEnd || timing.dutyEnd || '',
    breakStart: draft.breakStart || timing.breakStart || '',
    breakEnd: draft.breakEnd || timing.breakEnd || '',
  };
}

function normalizeSkill(input: string): string {
  return input.trim().toLowerCase();
}

function parseJobExpertise(job: JobOpt | undefined): string[] {
  if (!job) return [];
  const bag = new Set<string>();
  const addMany = (vals: unknown) => {
    if (!Array.isArray(vals)) return;
    for (const raw of vals) {
      const str = String(raw ?? '').trim();
      if (str) bag.add(str);
    }
  };

  addMany(job.requiredExpertises);

  if (Array.isArray(job.finishedGoods)) {
    for (const item of job.finishedGoods) {
      if (typeof item === 'string') {
        if (item.trim()) bag.add(item.trim());
        continue;
      }
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        addMany(row.requiredExpertise);
        addMany(row.expertises);
        addMany(row.skills);
      }
    }
  }

  const details = String(job.projectDetails ?? '');
  const m = details.match(/(?:required\s*expertise|expertise)\s*[:=-]\s*([^\n]+)/i);
  if (m?.[1]) {
    m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => bag.add(s));
  }

  return [...bag];
}

const SCHEDULE_TABLE_ROW_DEFS: { key: string; label: string }[] = [
  { key: 'locationType', label: 'Location' },
  { key: 'job', label: 'Job number' },
  { key: 'jobCompany', label: 'Customer' },
  { key: 'siteName', label: 'Site name' },
  { key: 'workProcessDetails', label: 'Work details' },
  { key: 'projectType', label: 'Project type' },
  { key: 'projectQtyArea', label: 'Qty / area' },
  { key: 'dutyRange', label: 'Duty in / out' },
  { key: 'breakRange', label: 'Break out / in' },
  { key: 'hourBreakRange', label: 'Hour&Break' },
  { key: 'workers', label: 'Workers' },
  { key: 'workerCount', label: 'Assigned workers' },
  { key: 'suggestedWorkers', label: 'Suggested workers' },
  { key: 'targetQty', label: 'Target Qty' },
  { key: 'driver1EmployeeId', label: 'Driver 1' },
  { key: 'driver2EmployeeId', label: 'Driver 2' },
  { key: 'remarks', label: 'Remarks' },
];

const SCHEDULE_TABLE_ROW_LABELS = Object.fromEntries(
  SCHEDULE_TABLE_ROW_DEFS.map((row) => [row.key, row.label]),
) as Record<string, string>;

const NAV_ROW = {
  locationType: 'locationType',
  job: 'job',
  workProcess: 'workProcessDetails',
  targetQty: 'targetQty',
  driver1: 'driver1EmployeeId',
  driver2: 'driver2EmployeeId',
  duty: 'dutyRange',
  break: 'breakRange',
  workers: 'workers',
  remarks: 'remarks',
} as const;

function encodeWorkerNavSub(subTeamIndex: number, memberIndex: number): number {
  return subTeamIndex * WORKER_NAV_SUB_STRIDE + memberIndex;
}

function getWorkerFieldNavSubs(draft: AsgDraft): number[] {
  if (!draft.splitMode) {
    return draft.members.map((_, memberIndex) => memberIndex);
  }
  return draft.subTeams.flatMap((subTeam, subTeamIndex) =>
    subTeam.members.map((_, memberIndex) => encodeWorkerNavSub(subTeamIndex, memberIndex))
  );
}

function draftHasAssignedWorkers(draft: AsgDraft): boolean {
  if (draft.splitMode) {
    return draft.subTeams.some((subTeam) =>
      subTeam.members.some((member) => Boolean(member.employeeId)),
    );
  }
  return draft.members.some((member) => Boolean(member.employeeId));
}

function asgDraftToValidationDraft(draft: AsgDraft) {
  return {
    label: draft.label,
    jobId: draft.jobId,
    dutyStart: draft.dutyStart,
    dutyEnd: draft.dutyEnd,
    breakStart: draft.breakStart,
    breakEnd: draft.breakEnd,
    splitMode: draft.splitMode,
    members: draft.members,
    subTeams: draft.subTeams,
  };
}

function resolveWorkerNavSubForColumn(
  targetDraft: AsgDraft | undefined,
  sourceDraft: AsgDraft | undefined,
  sourceSub: number,
): number {
  const targetSubs = targetDraft ? getWorkerFieldNavSubs(targetDraft) : [];
  if (targetSubs.length === 0) return 0;
  if (targetDraft && !draftHasAssignedWorkers(targetDraft)) {
    return targetSubs[0];
  }
  const sourceSubs = sourceDraft ? getWorkerFieldNavSubs(sourceDraft) : [];
  const sourceIndex = sourceSubs.indexOf(sourceSub);
  if (sourceIndex < 0) return targetSubs[targetSubs.length - 1];
  return targetSubs[Math.min(sourceIndex, targetSubs.length - 1)];
}

type ScheduleDriverTripRow = {
  rowKey: string;
  driverEmployeeId: string | null;
  guestDriverName: string | null;
  routeText: string;
  sequence: number;
};

function findInvalidSplitTeamDraft(drafts: AsgDraft[]) {
  return drafts.find(
    (draft) => draft.splitMode && draft.subTeams.some((subTeam) => !subTeam.members.some((member) => member.employeeId)),
  );
}

function buildAssignmentsPutBody(
  drafts: AsgDraft[],
  scheduleInfo: string,
  getJob: (id: string) => JobOpt | undefined,
) {
  return {
    notes: scheduleInfo || null,
    assignments: drafts.map((d) => {
      const job = getJob(d.jobId);
      const parsedTargetQty = Number.parseFloat(String(d.targetQty ?? '').trim());
      const nonSplitMembers = normalizeMemberList(d.members.filter((member) => member.employeeId));
      const splitMembers = d.subTeams.flatMap((subTeam, subTeamIndex) => {
        const people = normalizeMemberList(subTeam.members.filter((member) => member.employeeId));
        return people.map((member, memberIndex) => ({
          employeeId: member.employeeId,
          role: memberIndex === 0 ? ('TEAM_LEADER' as const) : member.role === 'HELPER' ? ('HELPER' as const) : ('WORKER' as const),
          slot: encodePersistedMemberSlot(subTeamIndex, memberIndex),
        }));
      });
      const memberPayload = d.splitMode
        ? splitMembers
        : nonSplitMembers.map((member, index) => ({
            employeeId: member.employeeId,
            role: index === 0 ? ('TEAM_LEADER' as const) : member.role === 'HELPER' ? ('HELPER' as const) : ('WORKER' as const),
            slot: index + 1,
          }));
      const teamLeaderEmployeeId = memberPayload.find((member) => member.role === 'TEAM_LEADER')?.employeeId ?? null;
      return {
        columnIndex: d.columnIndex,
        label: d.label,
        locationType: d.locationType,
        jobId: d.jobId || null,
        factoryCode: d.locationType === 'FACTORY' ? d.factoryCode || null : null,
        factoryLabel: d.locationType === 'FACTORY' ? d.factoryCode || null : null,
        jobNumberSnapshot: d.jobNumberSnapshot || null,
        clientNameSnapshot: d.locationType === 'SITE_JOB' ? String(job?.customerName ?? '').trim() || null : null,
        teamLeaderEmployeeId,
        driver1EmployeeId: d.driver1EmployeeId || null,
        driver2EmployeeId: d.driver2EmployeeId || null,
        shiftStart: d.dutyStart || null,
        shiftEnd: d.dutyEnd || null,
        breakWindow: d.breakStart && d.breakEnd ? `${d.breakStart} - ${d.breakEnd}` : null,
        targetQty: Number.isFinite(parsedTargetQty) ? parsedTargetQty : null,
        remarks: d.remarks || null,
        members: memberPayload,
      };
    }),
  };
}

function buildAssignmentPayloadFromDraft(d: AsgDraft, getJob: (id: string) => JobOpt | undefined) {
  return buildAssignmentsPutBody([d], '', getJob).assignments[0];
}

function assignmentPayloadFingerprint(d: AsgDraft, getJob: (id: string) => JobOpt | undefined) {
  return JSON.stringify(buildAssignmentPayloadFromDraft(d, getJob));
}

function apiAssignmentToDraftPartial(a: Record<string, unknown>, fallbackIndex: number): Partial<AsgDraft> {
  return {
    columnIndex: typeof a.columnIndex === 'number' ? a.columnIndex : fallbackIndex + 1,
    label: String(a.label ?? `Team#${fallbackIndex + 1}`),
    locationType: (a.locationType as AsgDraft['locationType']) ?? 'SITE_JOB',
    jobId: (a.job as { id?: string })?.id ?? '',
    factoryCode: String(a.factoryCode ?? ''),
    jobNumberSnapshot: String(a.jobNumberSnapshot ?? ''),
    targetQty: String(a.targetQty ?? ''),
    driver1EmployeeId: String(a.driver1EmployeeId ?? ''),
    driver2EmployeeId: String(a.driver2EmployeeId ?? ''),
    dutyStart: String(a.shiftStart ?? ''),
    dutyEnd: String(a.shiftEnd ?? ''),
    ...parseBrk(String(a.breakWindow ?? '')),
    remarks: String(a.remarks ?? ''),
    members: ((a.members as Array<Record<string, unknown>>) ?? []).map((m, i) => ({
      employeeId: String(m.employeeId),
      role: (m.role as MemberRow['role']) ?? 'WORKER',
      slot: typeof m.slot === 'number' ? m.slot : i + 1,
    })),
  };
}

function buildDriverLogsPutBody(driverTripRows: ScheduleDriverTripRow[]) {
  return {
    logs: driverTripRows
      .map((log, index) => {
        const routeText = log.routeText.trim();
        const guestName = log.guestDriverName?.trim();
        if (guestName) {
          return { guestDriverName: guestName, routeText, sequence: index };
        }
        if (!log.driverEmployeeId) return null;
        return { driverEmployeeId: log.driverEmployeeId, routeText, sequence: index };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  };
}

function driverLogsFingerprint(driverTripRows: ScheduleDriverTripRow[]) {
  return JSON.stringify(buildDriverLogsPutBody(driverTripRows));
}

function schedulePersistenceFingerprint(
  drafts: AsgDraft[],
  scheduleInfo: string,
  driverTripRows: ScheduleDriverTripRow[],
) {
  return JSON.stringify({ drafts, scheduleInfo, driverTripRows });
}

function applyScheduleViewPrefs(
  prefs: ReturnType<typeof defaultScheduleViewPrefs>,
  setters: {
    setShowWorkerRail: (value: boolean) => void;
    setShowRowLabels: (value: boolean) => void;
    setViewScale: (value: number) => void;
    setUseLightGridTheme: (value: boolean) => void;
    setRowSettings: (value: ScheduleRowSettings) => void;
  },
) {
  setters.setShowWorkerRail(prefs.showWorkerRail);
  setters.setShowRowLabels(prefs.showRowLabels);
  setters.setViewScale(prefs.viewScale);
  setters.setUseLightGridTheme(prefs.useLightGridTheme);
  setters.setRowSettings(prefs.rowSettings);
}

export default function HrScheduleDayPage() {
  const params = useParams();
  const workDate = String(params.workDate ?? '');
  const { data: session, status: sessionStatus } = useSession();
  const activeCompanyId = session?.user?.activeCompanyId ?? '';
  const [schedule, setSchedule] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [employeeById, setEmployeeById] = useState<Map<string, EmployeeProfile>>(() => new Map());
  const [jobById, setJobById] = useState<Map<string, JobOpt>>(() => new Map());
  const [labourTypeTiming, setLabourTypeTiming] = useState<EmployeeTypeTimingSetting | null>(null);
  const [previousSchedules, setPreviousSchedules] = useState<ScheduleTemplateOption[]>([]);
  const [selectedTemplateDate, setSelectedTemplateDate] = useState('');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [signatureSheetModalOpen, setSignatureSheetModalOpen] = useState(false);
  const [signatureSheetGroup, setSignatureSheetGroup] = useState('');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [drafts, setDrafts] = useState<AsgDraft[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState('');
  const [driverTripState, setDriverTripState] = useState<{
    version: string;
    values: Record<string, string>;
    selectedIds: string[];
    guestNames: Record<string, string>;
  }>({
    version: '',
    values: {},
    selectedIds: [],
    guestNames: {},
  });
  const [selectedDriverToAdd, setSelectedDriverToAdd] = useState('');
  const [guestDriverNameInput, setGuestDriverNameInput] = useState('');
  const defaultViewPrefs = defaultScheduleViewPrefs();
  const [showWorkerRail, setShowWorkerRail] = useState(defaultViewPrefs.showWorkerRail);
  const [showRowLabels, setShowRowLabels] = useState(defaultViewPrefs.showRowLabels);
  const [viewScale, setViewScale] = useState(defaultViewPrefs.viewScale);
  const [useLightGridTheme, setUseLightGridTheme] = useState(defaultViewPrefs.useLightGridTheme);
  const [rowSettings, setRowSettings] = useState<ScheduleRowSettings>(defaultViewPrefs.rowSettings);
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);
  const skipViewPrefsSaveRef = useRef(true);
  const viewPrefsCompanyRef = useRef<string | null>(null);
  const [rowSettingsOpen, setRowSettingsOpen] = useState(false);
  const lastPersistedFingerprintRef = useRef<string | null>(null);
  const persistInFlightRef = useRef(false);
  const persistQueuedRef = useRef(false);
  const skipScheduleRemapRef = useRef(false);
  const collaborationSessionIdRef = useRef(createClientId());
  const persistedNotesRef = useRef('');
  const persistedColumnFingerprintsRef = useRef<Map<number, string>>(new Map());
  const persistedDriverFingerprintRef = useRef('');
  const structureDirtyRef = useRef(false);
  const [jobDescriptionEdits, setJobDescriptionEdits] = useState<Record<string, string>>({});
  const jobDescriptionEditsRef = useRef<Record<string, string>>({});
  const workDetailsHistorySessionRef = useRef<{ jobId: string | null; pushed: boolean }>({
    jobId: null,
    pushed: false,
  });
  const workDetailsHistoryResetTimerRef = useRef<number | null>(null);
  const autoSaveStatusTimerRef = useRef<number | null>(null);
  const undoStackRef = useRef<ScheduleEditorSnapshot[]>([]);
  const redoStackRef = useRef<ScheduleEditorSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const suspendHistoryRef = useRef(false);
  const draftsRef = useRef<AsgDraft[]>([]);
  const teamBoardScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollTeamColumnRef = useRef<number | null>(null);
  const remappedScheduleIdRef = useRef<string | null>(null);
  const hasUnsavedScheduleChangesRef = useRef(false);
  const [pendingWorkerCreate, setPendingWorkerCreate] = useState<PendingWorkerCreate | null>(null);
  const [pendingInactiveJob, setPendingInactiveJob] = useState<PendingInactiveJob | null>(null);
  const [pendingStaleJob, setPendingStaleJob] = useState<PendingStaleJob | null>(null);
  const [publishBlockMessages, setPublishBlockMessages] = useState<string[] | null>(null);
  const [publishLowHourTeams, setPublishLowHourTeams] = useState<SchedulePublishLowHourTeam[] | null>(
    null,
  );
  const [publishedEditAcknowledged, setPublishedEditAcknowledged] = useState(false);
  const [publishedEditWarningOpen, setPublishedEditWarningOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activatingJob, setActivatingJob] = useState(false);
  const dismissedStaleJobIdsRef = useRef<Set<string>>(new Set());
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [updateJob] = useUpdateJobMutation();
  const [draggingWorker, setDraggingWorker] = useState<WorkerDragTarget | null>(null);
  const [draggingSubTeam, setDraggingSubTeam] = useState<SubTeamDragTarget | null>(null);
  const [draggingTeamColumn, setDraggingTeamColumn] = useState<number | null>(null);
  const draggingWorkerRef = useRef<WorkerDragTarget | null>(null);
  const draggingSubTeamRef = useRef<SubTeamDragTarget | null>(null);
  const draggingTeamColumnRef = useRef<number | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');
  const canEditJob = isSA || perms.includes('job.edit');
  const canCreateEmployee = isSA || perms.includes('hr.employee.edit');
  const { data: scheduleJobsPage, refetch: refetchScheduleJobs } = useGetJobsPageQuery(
    SCHEDULE_JOB_PICKER_LIST_PARAMS,
    { skip: !canView },
  );
  const { data: scheduleEmployeesPage, refetch: refetchScheduleEmployees } = useGetHrEmployeesPageQuery(
    SCHEDULE_EMPLOYEE_LIST_PARAMS,
    { skip: !canView },
  );
  const canPub = isSA || perms.includes('hr.schedule.publish');
  const status = schedule && typeof schedule === 'object' ? String((schedule as { status?: string }).status ?? '') : '';
  const locked = status === 'LOCKED';
  const isPublished = status === 'PUBLISHED';
  const publishedEditGuarded =
    isPublished && !locked && !publishedEditAcknowledged && (canEdit || canEditJob);
  const dis = !canEdit || locked || publishedEditGuarded;
  const canZoomOut = viewScale > 0.8;
  const canZoomIn = viewScale < 1.35;
  const scheduleRowLabelCls = STICKY_ROW_LABEL_CLASS;
  const scheduleRowCls = 'border-b border-border transition-colors hover:bg-muted/40';
  const gridFlatInputCls = SCHEDULE_GRID_FLAT_INPUT;
  const gridTextareaCls = cn(SCHEDULE_GRID_FLAT_INPUT, 'min-h-14 resize-y py-1');
  const scheduleStatusTag = (() => {
    if (!status) {
      return { label: 'No schedule', className: 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100' };
    }
    if (status === 'PUBLISHED') {
      return { label: 'Published', className: 'border-emerald-600/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100' };
    }
    if (status === 'LOCKED') {
      return { label: 'Locked', className: 'border-border bg-muted text-foreground' };
    }
    return { label: 'Draft', className: 'border-sky-600/40 bg-sky-500/15 text-sky-950 dark:text-sky-100' };
  })();
  const workDateLabel = useMemo(() => {
    try {
      return new Date(`${workDate}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return workDate;
    }
  }, [workDate]);

  const recentTemplateSchedules = useMemo(
    () =>
      [...previousSchedules]
        .sort((a, b) => b.workDate.localeCompare(a.workDate))
        .slice(0, 5),
    [previousSchedules],
  );

  const showTemplateOption =
    Boolean(schedule) && canEdit && !dis && drafts.length === 0;

  const confirmPublishedEdit = useCallback(() => {
    setPublishedEditAcknowledged(true);
    setPublishedEditWarningOpen(false);
  }, []);

  const requestPublishedEdit = useCallback(
    (action?: () => void) => {
      if (!publishedEditGuarded) {
        action?.();
        return;
      }
      setPublishedEditWarningOpen(true);
    },
    [publishedEditGuarded],
  );

  const handlePublishedEditAttempt = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!publishedEditGuarded) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-published-edit-exempt]')) return;
      const interactive = target.closest(
        'button, input, select, textarea, [role="combobox"], [data-schedule-drop], [data-schedule-drag-handle]',
      );
      if (!interactive) return;
      event.preventDefault();
      event.stopPropagation();
      setPublishedEditWarningOpen(true);
    },
    [publishedEditGuarded],
  );

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !session?.user?.activeCompanyId) {
      return;
    }

    const companyId = session.user.activeCompanyId;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch('/api/me/hr-schedule-view-prefs', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to load schedule view preferences');
        }

        const payload = (await response.json()) as { data?: unknown };
        if (controller.signal.aborted) return;

        let prefs = payload.data == null ? null : normalizeScheduleViewPrefs(payload.data);
        if (!prefs) {
          const legacy = readLegacyScheduleViewPrefsFromLocalStorage();
          if (legacy) {
            prefs = legacy;
            clearLegacyScheduleViewPrefsLocalStorage();
            void fetch('/api/me/hr-schedule-view-prefs', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(legacy),
            }).catch(() => undefined);
          }
        }

        if (prefs) {
          applyScheduleViewPrefs(prefs, {
            setShowWorkerRail,
            setShowRowLabels,
            setViewScale,
            setUseLightGridTheme,
            setRowSettings,
          });
        }

        viewPrefsCompanyRef.current = companyId;
        skipViewPrefsSaveRef.current = true;
        setViewPrefsLoaded(true);
      } catch {
        if (controller.signal.aborted) return;
        const legacy = readLegacyScheduleViewPrefsFromLocalStorage();
        if (legacy) {
          applyScheduleViewPrefs(legacy, {
            setShowWorkerRail,
            setShowRowLabels,
            setViewScale,
            setUseLightGridTheme,
            setRowSettings,
          });
        }
        viewPrefsCompanyRef.current = companyId;
        skipViewPrefsSaveRef.current = true;
        setViewPrefsLoaded(true);
      }
    })();

    return () => controller.abort();
  }, [session?.user?.activeCompanyId, sessionStatus]);

  useEffect(() => {
    if (!viewPrefsLoaded || sessionStatus !== 'authenticated' || !session?.user?.activeCompanyId) {
      return;
    }
    if (viewPrefsCompanyRef.current !== session.user.activeCompanyId) {
      return;
    }
    if (skipViewPrefsSaveRef.current) {
      skipViewPrefsSaveRef.current = false;
      return;
    }

    const controller = new AbortController();
    const payload = normalizeScheduleViewPrefs({
      showWorkerRail,
      showRowLabels,
      viewScale,
      useLightGridTheme,
      rowSettings,
    });

    const timeoutId = window.setTimeout(() => {
      void fetch('/api/me/hr-schedule-view-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => undefined);
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    rowSettings,
    session?.user?.activeCompanyId,
    sessionStatus,
    showRowLabels,
    showWorkerRail,
    useLightGridTheme,
    viewPrefsLoaded,
    viewScale,
  ]);

  const visibleScheduleRowKeys = useMemo(
    () => rowSettings.order.filter((key) => !rowSettings.hidden.includes(key)),
    [rowSettings],
  );
  const visibleScheduleRowKeysRef = useRef(visibleScheduleRowKeys);
  useEffect(() => {
    visibleScheduleRowKeysRef.current = visibleScheduleRowKeys;
  }, [visibleScheduleRowKeys]);

  const scrollToTeamColumn = useCallback((colIdx: number) => {
    const container = teamBoardScrollRef.current;
    if (!container) return;
    const column = container.querySelector<HTMLElement>(`[data-team-column="${colIdx}"]`);
    if (!column) return;
    column.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, []);

  useEffect(() => {
    const colIdx = pendingScrollTeamColumnRef.current;
    if (colIdx == null) return;
    pendingScrollTeamColumnRef.current = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollToTeamColumn(colIdx);
      });
    });
  }, [drafts, scrollToTeamColumn]);

  const toggleScheduleRowVisibility = useCallback((rowKey: string) => {
    setRowSettings((current) => {
      const hidden = current.hidden.includes(rowKey)
        ? current.hidden.filter((key) => key !== rowKey)
        : [...current.hidden, rowKey];
      return { ...current, hidden };
    });
  }, []);

  const moveScheduleRowSetting = useCallback((index: number, delta: -1 | 1) => {
    setRowSettings((current) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.order.length) return current;
      return { ...current, order: moveArrayItem(current.order, index, nextIndex) };
    });
  }, []);

  const resetScheduleRowSettings = useCallback(() => {
    setRowSettings(defaultScheduleViewPrefs().rowSettings);
  }, []);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    jobDescriptionEditsRef.current = jobDescriptionEdits;
  }, [jobDescriptionEdits]);

  const resetWorkDetailsHistorySession = useCallback(() => {
    workDetailsHistorySessionRef.current = { jobId: null, pushed: false };
  }, []);

  const syncHistoryUi = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const clearHistoryStacks = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryUi();
  }, [syncHistoryUi]);

  const pushUndoSnapshot = useCallback(
    (snapshot: ScheduleEditorSnapshot) => {
      undoStackRef.current = [...undoStackRef.current.slice(-39), cloneEditorSnapshot(snapshot)];
      redoStackRef.current = [];
      resetWorkDetailsHistorySession();
      syncHistoryUi();
    },
    [resetWorkDetailsHistorySession, syncHistoryUi],
  );

  const getRowThemeClasses = useCallback((rowKey: string): { row: string; label: string; cell: string } => {
      if (!useLightGridTheme) {
        return {
          row: scheduleRowCls,
          label: scheduleRowLabelCls,
          cell: 'px-1.5 py-1',
        };
      }

      const shared = { row: scheduleRowCls };
      const themedLabel = (tone: string) => cn(STICKY_ROW_LABEL_CLASS, tone);
      if (
        rowKey === 'locationType' ||
        rowKey === 'job' ||
        rowKey === 'jobCompany' ||
        rowKey === 'siteName' ||
        rowKey === 'workProcessDetails' ||
        rowKey === 'projectType' ||
        rowKey === 'projectQtyArea' ||
        rowKey === 'targetQty'
      ) {
        return {
          row: shared.row,
          label: themedLabel('!bg-sky-100 text-sky-900 dark:!bg-sky-950 dark:text-sky-100'),
          cell: 'bg-sky-500/5 px-1.5 py-1',
        };
      }
      if (rowKey === 'dutyRange' || rowKey === 'breakRange' || rowKey === 'hourBreakRange') {
        return {
          row: shared.row,
          label: themedLabel('!bg-emerald-100 text-emerald-900 dark:!bg-emerald-950 dark:text-emerald-100'),
          cell: 'bg-emerald-500/5 px-1.5 py-1',
        };
      }
      if (rowKey === 'workers' || rowKey === 'suggestedWorkers') {
        return {
          row: shared.row,
          label: themedLabel('!bg-amber-100 text-amber-950 dark:!bg-amber-950 dark:text-amber-100'),
          cell: 'bg-amber-500/5 px-1.5 py-1',
        };
      }
      if (rowKey === 'workerCount') {
        return {
          row: shared.row,
          label: themedLabel('!bg-orange-100 text-orange-950 dark:!bg-orange-950 dark:text-orange-100'),
          cell: 'bg-orange-500/5 px-1.5 py-1',
        };
      }
      if (rowKey === 'driver1EmployeeId' || rowKey === 'driver2EmployeeId') {
        return {
          row: shared.row,
          label: themedLabel('!bg-rose-100 text-rose-900 dark:!bg-rose-950 dark:text-rose-100'),
          cell: 'bg-rose-500/5 px-1.5 py-1',
        };
      }
      if (rowKey === 'remarks') {
        return { row: shared.row, label: scheduleRowLabelCls, cell: 'bg-muted/30 px-1.5 py-1' };
      }
      return { row: shared.row, label: scheduleRowLabelCls, cell: 'p-2' };
    },
    [useLightGridTheme, scheduleRowLabelCls, scheduleRowCls],
  );

  const plannerCellCls = useCallback(
    (rowKey: string) => {
      const { cell } = getRowThemeClasses(rowKey);
      return cn(TEAM_COLUMN_CLASS, 'border-l border-border', cell);
    },
    [getRowThemeClasses],
  );

  const teamHeaderCls = () =>
    cn(
      TEAM_COLUMN_CLASS,
      'sticky top-0 z-20 border-b border-border bg-muted px-2 py-1.5 text-left align-top',
    );

  const mergeEmployees = useCallback((rows: ScheduleEmployeeRow[] | EmployeeProfile[]) => {
    setEmployeeById((prev) => {
      const next = new Map(prev);
      for (const row of rows) {
        const profile: EmployeeProfile =
          'workforce' in row && row.workforce
            ? (row as EmployeeProfile)
            : { ...(row as ScheduleEmployeeRow), workforce: parseWorkforceProfile(row.profileExtension) };
        next.set(profile.id, profile);
      }
      return next;
    });
  }, []);

  const reloadActiveEmployees = useCallback(() => {
    void refetchScheduleEmployees();
  }, [refetchScheduleEmployees]);

  useHrLiveUpdate(
    useCallback(() => {
      reloadActiveEmployees();
    }, [reloadActiveEmployees]),
  );

  const mergeJobs = useCallback((rows: ScheduleJobRow[] | JobOpt[]) => {
    setJobById((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const row of rows) {
        const normalized = normalizeScheduleJobRow(row as ScheduleJobRow & { customer?: { name?: string | null } });
        const existing = prev.get(normalized.id);
        if (!scheduleJobRowsEqual(normalized, existing)) {
          next.set(normalized.id, normalized as JobOpt);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const getEmployee = useCallback((id: string) => (id ? employeeById.get(id) : undefined), [employeeById]);
  const getJob = useCallback((id: string) => (id ? jobById.get(id) : undefined), [jobById]);

  const captureCurrentEditorSnapshot = useCallback((): ScheduleEditorSnapshot => {
    return captureEditorSnapshot(draftsRef.current, jobDescriptionEditsRef.current, getJob);
  }, [getJob]);

  const getJobWorkDetails = useCallback(
    (jobId: string | null | undefined) => {
      if (!jobId) return '';
      if (Object.prototype.hasOwnProperty.call(jobDescriptionEdits, jobId)) {
        return jobDescriptionEdits[jobId];
      }
      return String(getJob(jobId)?.description ?? '').trim();
    },
    [getJob, jobDescriptionEdits],
  );

  const scheduleJobSeedItems = useMemo(
    () => (scheduleJobsPage?.items ?? []).map((job) => scheduleJobToSearchItem(job)),
    [scheduleJobsPage]
  );

  const assignedJobIds = useMemo(
    () => [...new Set(drafts.map((draft) => draft.jobId).filter(Boolean))],
    [drafts]
  );

  const scheduleJobsListFingerprint = useMemo(
    () => (scheduleJobsPage?.items ?? []).map((job) => scheduleJobCacheSignature(job)).join('|'),
    [scheduleJobsPage?.items]
  );

  const scheduleEmployeesFingerprint = useMemo(
    () => (scheduleEmployeesPage?.items ?? []).map((employee) => employee.id).join('|'),
    [scheduleEmployeesPage?.items]
  );

  const assignedJobsFingerprint = useAppSelector((state) =>
    assignedJobIds
      .map((id) => {
        const job = jobsApi.endpoints.getJobById.select(id)(state)?.data;
        return job ? scheduleJobCacheSignature(job) : `missing:${id}`;
      })
      .join('|')
  );

  useEffect(() => {
    if (!scheduleJobsPage?.items?.length) return;
    mergeJobs(scheduleJobsPage.items.map(jobRecordToScheduleRow));
  }, [mergeJobs, scheduleJobsListFingerprint, scheduleJobsPage?.items]);

  useEffect(() => {
    if (!scheduleEmployeesPage?.items?.length) return;
    mergeEmployees(
      scheduleEmployeesPage.items.map((employee) =>
        toScheduleEmployee(
          hrEmployeeToScheduleRow(
            employee as ScheduleEmployeeRow & {
              basicHoursPerDay?: number;
              defaultTiming?: ScheduleEmployeeRow['defaultTiming'];
            },
          ),
        ),
      ),
    );
  }, [mergeEmployees, scheduleEmployeesFingerprint, scheduleEmployeesPage?.items]);

  useEffect(() => {
    if (!assignedJobIds.length) return;
    const state = store.getState();
    const jobs = assignedJobIds
      .map((id) => jobsApi.endpoints.getJobById.select(id)(state)?.data)
      .filter((job): job is NonNullable<typeof job> => Boolean(job));
    if (jobs.length > 0) {
      mergeJobs(jobs.map((job) => jobRecordToScheduleRow(job)));
    }
  }, [assignedJobIds, assignedJobsFingerprint, mergeJobs, store]);

  const loadScheduleJobs = useCallback(
    async (query: string) => {
      const items = (scheduleJobsPage?.items ?? []).map((job) => scheduleJobToSearchItem(job));
      return filterScheduleJobSearchItems(items, query);
    },
    [scheduleJobsPage?.items],
  );

  const resolveScheduleJobById = useCallback(
    async (id: string) => {
      const cached = getJob(id);
      if (cached) return scheduleJobToSearchItem(cached);
      const fromList = scheduleJobsPage?.items.find((job) => job.id === id);
      if (fromList) {
        mergeJobs([jobRecordToScheduleRow(fromList)]);
        return scheduleJobToSearchItem(fromList);
      }
      const row = await dispatch(
        jobsApi.endpoints.getJobById.initiate(id, { subscribe: false, forceRefetch: false })
      ).unwrap();
      mergeJobs([jobRecordToScheduleRow(row)]);
      return scheduleJobToSearchItem(row);
    },
    [dispatch, getJob, mergeJobs, scheduleJobsPage?.items]
  );

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) {
      const data = json.data as Record<string, unknown> | null;
      if (
        data &&
        typeof data === 'object' &&
        'companyId' in data &&
        activeCompanyId &&
        String(data.companyId ?? '') !== activeCompanyId
      ) {
        setSchedule(null);
        return;
      }
      setSchedule(data);
    } else {
      setSchedule(null);
    }
  }, [activeCompanyId, workDate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) return;
      setSchedule(null);
      if (!cancelled) setLoading(true);
      await loadSchedule();
      const [timingRes, sr] = await Promise.all([
        fetch('/api/hr/employee-type-settings', { cache: 'no-store' }),
        fetch('/api/hr/schedule', { cache: 'no-store' }),
      ]);
      const [timingJson, sj] = await Promise.all([timingRes.json(), sr.json()]);
      if (cancelled) return;
      if (timingRes.ok && timingJson?.success && timingJson.data?.LABOUR_WORKER) {
        setLabourTypeTiming(timingJson.data.LABOUR_WORKER as EmployeeTypeTimingSetting);
      }
      if (sr.ok && sj?.success) {
        const options = (sj.data as Array<Record<string, unknown>>)
          .map((row) => ({
            id: String(row.id ?? ''),
            workDate: String(row.workDate ?? '').slice(0, 10),
            status: String(row.status ?? ''),
          }))
          .filter((row) => row.id && row.workDate && row.workDate !== workDate);
        setPreviousSchedules(options);
        const recent = [...options]
          .sort((a, b) => b.workDate.localeCompare(a.workDate))
          .slice(0, 5);
        setSelectedTemplateDate((current) => current || recent[0]?.workDate || '');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canView, loadSchedule, workDate, activeCompanyId]);

  const mapFromApi = useCallback((sch: Record<string, unknown>) => {
    const asg = (sch.assignments as Array<Record<string, unknown>>) ?? [];
    const jobsFromAssignments = asg
      .map((a) => a.job as Record<string, unknown> | undefined)
      .filter((job): job is Record<string, unknown> => Boolean(job?.id))
      .map((job) =>
        normalizeScheduleJobRow({
          id: String(job.id),
          jobNumber: String(job.jobNumber ?? ''),
          customerName: String((job.customer as { name?: string } | undefined)?.name ?? ''),
          description: (job.description as string | null | undefined) ?? null,
          projectDetails: (job.projectDetails as string | null | undefined) ?? null,
          projectType: (job.projectType as string | null | undefined) ?? null,
          projectQtyArea: (job.projectQtyArea as string | null | undefined) ?? null,
          quotationNumber: (job.quotationNumber as string | null | undefined) ?? null,
          lpoNumber: (job.lpoNumber as string | null | undefined) ?? null,
          site: (job.site as string | null | undefined) ?? null,
          customer: job.customer as { name?: string | null } | null | undefined,
        })
      );
    const jobsById = new Map(jobsFromAssignments.map((job) => [job.id, job as JobOpt]));
    const lookupJob = (id: string) => jobsById.get(id);
    if (jobsFromAssignments.length > 0) mergeJobs(jobsFromAssignments);
    suspendHistoryRef.current = true;
    const notesValue = String((sch as { notes?: string | null }).notes ?? '');
    setScheduleInfo(notesValue);
    const normalizedDrafts = asg.map((a, idx) =>
      normalizeDraft(
        {
          columnIndex: typeof a.columnIndex === 'number' ? a.columnIndex : idx + 1,
          label: String(a.label ?? `Team#${idx + 1}`),
          locationType: (a.locationType as AsgDraft['locationType']) ?? 'SITE_JOB',
          jobId: (a.job as { id?: string })?.id ?? '',
          factoryCode: String(a.factoryCode ?? ''),
          jobNumberSnapshot: String(a.jobNumberSnapshot ?? ''),
          workProcessDetails: getInitialWorkProcessDetails({
            id: String((a.job as { id?: string })?.id ?? ''),
            jobNumber: String((a.job as { jobNumber?: string })?.jobNumber ?? a.jobNumberSnapshot ?? ''),
            customerName: String((a.job as { customer?: { name?: string } })?.customer?.name ?? ''),
            description: String((a.job as { description?: string })?.description ?? ''),
            projectDetails: String((a.job as { projectDetails?: string })?.projectDetails ?? '') || '',
          }),
          targetQty: String(a.targetQty ?? ''),
          driver1EmployeeId: String(a.driver1EmployeeId ?? ''),
          driver2EmployeeId: String(a.driver2EmployeeId ?? ''),
          dutyStart: String(a.shiftStart ?? ''),
          dutyEnd: String(a.shiftEnd ?? ''),
          ...parseBrk(String(a.breakWindow ?? '')),
          remarks: String(a.remarks ?? ''),
          members: ((a.members as Array<Record<string, unknown>>) ?? []).map((m, i) => ({
            employeeId: String(m.employeeId),
            role: (m.role as MemberRow['role']) ?? 'WORKER',
            slot: typeof m.slot === 'number' ? m.slot : i + 1,
          })),
        },
        idx,
      ),
    );
    draftsRef.current = normalizedDrafts;
    setDrafts(normalizedDrafts);
    jobDescriptionEditsRef.current = {};
    setJobDescriptionEdits({});
    resetWorkDetailsHistorySession();
    persistedNotesRef.current = notesValue;
    persistedColumnFingerprintsRef.current = new Map(
      normalizedDrafts.map((draft) => [draft.columnIndex, assignmentPayloadFingerprint(draft, lookupJob)]),
    );
    structureDirtyRef.current = false;
    clearHistoryStacks();
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, [clearHistoryStacks, mergeJobs, resetWorkDetailsHistorySession]);

  const mapFromApiRef = useRef(mapFromApi);
  useEffect(() => {
    mapFromApiRef.current = mapFromApi;
  }, [mapFromApi]);

  useEffect(() => {
    queueMicrotask(() => {
      if (skipScheduleRemapRef.current) {
        skipScheduleRemapRef.current = false;
        return;
      }
      if (schedule && typeof schedule === 'object' && 'id' in schedule) {
        const sid = String((schedule as { id: string }).id);
        const firstLoadForSchedule = remappedScheduleIdRef.current !== sid;
        if (
          !firstLoadForSchedule &&
          (undoStackRef.current.length > 0 ||
            redoStackRef.current.length > 0 ||
            hasUnsavedScheduleChangesRef.current)
        ) {
          return;
        }
        remappedScheduleIdRef.current = sid;
        mapFromApiRef.current(schedule as Record<string, unknown>);
      } else {
        remappedScheduleIdRef.current = null;
        suspendHistoryRef.current = true;
        setScheduleInfo('');
        draftsRef.current = [];
        setDrafts([]);
        jobDescriptionEditsRef.current = {};
        setJobDescriptionEdits({});
        resetWorkDetailsHistorySession();
        clearHistoryStacks();
        queueMicrotask(() => {
          suspendHistoryRef.current = false;
        });
      }
    });
  }, [clearHistoryStacks, resetWorkDetailsHistorySession, schedule]);

  const scheduleCompanyId =
    schedule && typeof schedule === 'object' && 'companyId' in schedule
      ? String((schedule as { companyId?: string }).companyId ?? '')
      : '';
  const scheduleWorkDate =
    schedule && typeof schedule === 'object' && 'workDate' in schedule
      ? String((schedule as { workDate?: string | Date }).workDate ?? '').slice(0, 10)
      : '';
  const scheduleId =
    schedule &&
    typeof schedule === 'object' &&
    'id' in schedule &&
    scheduleCompanyId === activeCompanyId &&
    scheduleWorkDate === workDate
      ? String((schedule as { id: string }).id)
      : '';

  useEffect(() => {
    setAutoSaveStatus('idle');
  }, [workDate, scheduleId]);

  useEffect(() => {
    setPublishedEditAcknowledged(false);
    setPublishedEditWarningOpen(false);
  }, [workDate, scheduleId, status]);

  const markScheduleStructureDirty = () => {
    structureDirtyRef.current = true;
  };

  const columnHasUnsavedChanges = useCallback(
    (columnIndex: number) => {
      const draft = draftsRef.current.find((row) => row.columnIndex === columnIndex);
      if (!draft) return false;
      const persisted = persistedColumnFingerprintsRef.current.get(columnIndex);
      if (!persisted) return true;
      return assignmentPayloadFingerprint(draft, getJob) !== persisted;
    },
    [getJob],
  );

  const driverLogVersion =
    schedule && typeof schedule === 'object' && 'id' in schedule
      ? String((schedule as { id: string }).id)
      : workDate;

  useEffect(() => {
    const employeeIds = new Set<string>();
    const jobIds = new Set<string>();
    for (const draft of drafts) {
      if (draft.jobId) jobIds.add(draft.jobId);
      if (draft.driver1EmployeeId) employeeIds.add(draft.driver1EmployeeId);
      if (draft.driver2EmployeeId) employeeIds.add(draft.driver2EmployeeId);
      if (draft.splitMode) {
        for (const subTeam of draft.subTeams) {
          for (const member of subTeam.members) {
            if (member.employeeId) employeeIds.add(member.employeeId);
          }
        }
      } else {
        for (const member of draft.members) {
          if (member.employeeId) employeeIds.add(member.employeeId);
        }
      }
    }
    const scheduleLogs = ((schedule as { driverLogs?: Array<Record<string, unknown>> } | null)?.driverLogs ??
      []) as Array<Record<string, unknown>>;
    for (const log of scheduleLogs) {
      if (String(log.guestDriverName ?? '').trim()) continue;
      const id = String(log.driverEmployeeId ?? (log.driver as { id?: string } | undefined)?.id ?? '');
      if (id) employeeIds.add(id);
    }
    for (const id of driverTripState.version === driverLogVersion ? driverTripState.selectedIds : []) {
      if (id && !isGuestDriverRowKey(id)) employeeIds.add(id);
    }

    const missingEmployeeIds = [...employeeIds].filter((id) => id && !employeeById.has(id));
    const missingJobIds = [...jobIds].filter((id) => id && !jobById.has(id));
    if (missingEmployeeIds.length === 0 && missingJobIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const [employees, jobs] = await Promise.all([
        fetchEmployeesByIds(missingEmployeeIds),
        fetchJobsByIds(missingJobIds),
      ]);
      if (cancelled) return;
      if (employees.length > 0) mergeEmployees(employees);
      if (jobs.length > 0) mergeJobs(jobs);
    })();
    return () => {
      cancelled = true;
    };
  }, [drafts, schedule, driverTripState, driverLogVersion, employeeById, jobById, mergeEmployees, mergeJobs]);

  const employeeProfiles = useMemo(() => Array.from(employeeById.values()), [employeeById]);

  const workerPool = useMemo(
    () =>
      employeeProfiles.filter(
        (e) => e.workforce.employeeType === 'LABOUR_WORKER' || e.workforce.employeeType === 'HYBRID_STAFF'
      ),
    [employeeProfiles]
  );

  const driverPool = useMemo(
    () => employeeProfiles.filter((e) => e.workforce.employeeType === 'DRIVER'),
    [employeeProfiles]
  );

  const workerItems = useMemo(
    () => workerPool.map((employee) => employeeToSearchItem(employee)),
    [workerPool]
  );

  const driverItems = useMemo(
    () =>
      driverPool.map((e) => ({
        id: e.id,
        label: e.preferredName || e.fullName,
        searchText: `${e.fullName} ${e.preferredName ?? ''}`.trim(),
      })),
    [driverPool]
  );

  const syncDriverTripStateFromLogs = useCallback(
    (logs: ScheduleDriverLogRecord[], version: string, seedAllDriversIfEmpty: boolean) => {
      if (logs.length > 0) {
        const selectedIds: string[] = [];
        const values: Record<string, string> = {};
        const guestNames: Record<string, string> = {};
        for (const log of logs) {
          const guestName = String(log.guestDriverName ?? '').trim();
          if (guestName) {
            const key = log.id ? guestDriverRowKeyFromLogId(String(log.id)) : createPendingGuestDriverRowKey();
            selectedIds.push(key);
            guestNames[key] = guestName;
            values[key] = String(log.routeText ?? '');
            continue;
          }
          const employeeId = String(log.driverEmployeeId ?? log.driver?.id ?? '').trim();
          if (!employeeId) continue;
          selectedIds.push(employeeId);
          values[employeeId] = String(log.routeText ?? '');
        }
        setDriverTripState({ version, values, selectedIds, guestNames });
        return;
      }
      if (!seedAllDriversIfEmpty) {
        setDriverTripState({ version, values: {}, selectedIds: [], guestNames: {} });
        return;
      }
      const sortedDrivers = [...driverPool].sort((a, b) =>
        (a.preferredName || a.fullName).localeCompare(b.preferredName || b.fullName)
      );
      setDriverTripState({
        version,
        values: {},
        selectedIds: sortedDrivers.map((driver) => driver.id),
        guestNames: {},
      });
    },
    [driverPool]
  );

  useEffect(() => {
    if (!schedule) return;
    const logs =
      ((schedule as { driverLogs?: ScheduleDriverLogRecord[] }).driverLogs ?? []) as ScheduleDriverLogRecord[];
    if (driverTripState.version === driverLogVersion) return;
    queueMicrotask(() => syncDriverTripStateFromLogs(logs, driverLogVersion, true));
  }, [schedule, driverLogVersion, driverTripState.version, syncDriverTripStateFromLogs]);

  useEffect(() => {
    if (!schedule || driverPool.length === 0) return;
    const logs =
      ((schedule as { driverLogs?: ScheduleDriverLogRecord[] }).driverLogs ?? []) as ScheduleDriverLogRecord[];
    if (logs.length > 0) return;
    if (driverTripState.version !== driverLogVersion) return;
    if (driverTripState.selectedIds.length > 0) return;
    queueMicrotask(() => syncDriverTripStateFromLogs([], driverLogVersion, true));
  }, [
    schedule,
    driverPool,
    driverLogVersion,
    driverTripState.version,
    driverTripState.selectedIds.length,
    syncDriverTripStateFromLogs,
  ]);

  const driverTripRows = useMemo(() => {
    if (driverTripState.version === driverLogVersion) {
      return driverTripState.selectedIds.map((rowKey, index) => {
        const guest = isGuestDriverRowKey(rowKey);
        return {
          rowKey,
          driverEmployeeId: guest ? null : rowKey,
          guestDriverName: guest ? (driverTripState.guestNames[rowKey] ?? '').trim() : null,
          routeText: driverTripState.values[rowKey] ?? '',
          sequence: index,
        };
      });
    }

    const scheduleLogs =
      ((schedule as { driverLogs?: ScheduleDriverLogRecord[] } | null)?.driverLogs ?? []) as ScheduleDriverLogRecord[];
    return scheduleLogs.map((log, index) => {
      const guestName = String(log.guestDriverName ?? '').trim();
      if (guestName) {
        const rowKey = log.id ? guestDriverRowKeyFromLogId(String(log.id)) : createPendingGuestDriverRowKey();
        return {
          rowKey,
          driverEmployeeId: null,
          guestDriverName: guestName,
          routeText: String(log.routeText ?? ''),
          sequence: typeof log.sequence === 'number' ? log.sequence : index,
        };
      }
      const employeeId = String(log.driverEmployeeId ?? log.driver?.id ?? '').trim();
      return {
        rowKey: employeeId,
        driverEmployeeId: employeeId,
        guestDriverName: null,
        routeText: String(log.routeText ?? ''),
        sequence: typeof log.sequence === 'number' ? log.sequence : index,
      };
    });
  }, [schedule, driverTripState, driverLogVersion]);

  // Count how many groups each employee appears in
  const empAssignCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drafts) {
      const ids = new Set<string>();
      if (d.driver1EmployeeId) ids.add(d.driver1EmployeeId);
      if (d.driver2EmployeeId) ids.add(d.driver2EmployeeId);
      if (d.splitMode) {
        for (const subTeam of d.subTeams) {
          for (const member of subTeam.members) if (member.employeeId) ids.add(member.employeeId);
        }
      } else {
        for (const member of d.members) if (member.employeeId) ids.add(member.employeeId);
      }
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [drafts]);

  const multiAssigned = useMemo(() => {
    const s = new Set<string>();
    for (const [id, c] of empAssignCount) { if (c > 1) s.add(id); }
    return s;
  }, [empAssignCount]);

  const assignedEmployeeIds = useMemo(() => new Set(empAssignCount.keys()), [empAssignCount]);

  const unassignedWorkers = useMemo(
    () => workerPool.filter((e) => !assignedEmployeeIds.has(e.id)),
    [workerPool, assignedEmployeeIds]
  );

  const availableDriverItems = useMemo(
    () => driverItems.filter((item) => !driverTripRows.some((row) => row.driverEmployeeId === item.id)),
    [driverItems, driverTripRows]
  );

  const reloadScheduleFromServer = useCallback(async () => {
    if (!scheduleId) return;
    if (
      undoStackRef.current.length > 0 ||
      redoStackRef.current.length > 0 ||
      hasUnsavedScheduleChangesRef.current
    ) {
      return;
    }
    const res = await fetch(`/api/hr/schedule/${scheduleId}`, { cache: 'no-store' });
    const json = await readApiEnvelope<{ success?: boolean; data?: Record<string, unknown> }>(res);
    if (res.ok && json?.success && json.data) {
      setSchedule(json.data);
    }
  }, [scheduleId]);

  const hasUnsavedScheduleChanges = useCallback(() => {
    if (structureDirtyRef.current) return true;
    if (scheduleInfo !== persistedNotesRef.current) return true;
    if (driverLogsFingerprint(driverTripRows) !== persistedDriverFingerprintRef.current) return true;
    return draftsRef.current.some((draft) => columnHasUnsavedChanges(draft.columnIndex));
  }, [columnHasUnsavedChanges, driverTripRows, scheduleInfo]);

  const hasUnsavedJobDescriptionChanges = useCallback(() => {
    return Object.entries(jobDescriptionEditsRef.current).some(([jobId, value]) => {
      const saved = String(getJob(jobId)?.description ?? '').trim();
      return value.trim() !== saved;
    });
  }, [getJob]);

  const hasUnsavedEditorChanges = useCallback(() => {
    return hasUnsavedScheduleChanges() || hasUnsavedJobDescriptionChanges();
  }, [hasUnsavedJobDescriptionChanges, hasUnsavedScheduleChanges]);

  useEffect(() => {
    hasUnsavedScheduleChangesRef.current = hasUnsavedEditorChanges();
  }, [hasUnsavedEditorChanges]);

  const mergeRemoteColumn = useCallback(
    async (columnIndex: number, action: string) => {
      if (!scheduleId || persistInFlightRef.current) return;
      if (undoStackRef.current.length > 0 || redoStackRef.current.length > 0) return;
      if (columnHasUnsavedChanges(columnIndex)) return;

      if (action === 'deleted') {
        suspendHistoryRef.current = true;
        setDrafts((prev) => {
          const next = prev.filter((row) => row.columnIndex !== columnIndex);
          draftsRef.current = next;
          return next;
        });
        persistedColumnFingerprintsRef.current.delete(columnIndex);
        queueMicrotask(() => {
          suspendHistoryRef.current = false;
        });
        return;
      }

      const localDraft = draftsRef.current.find((row) => row.columnIndex === columnIndex);
      if (!localDraft) {
        if (!hasUnsavedScheduleChanges()) {
          await reloadScheduleFromServer();
        }
        return;
      }

      const res = await fetch(
        `/api/hr/schedule/${scheduleId}/assignments?columnIndex=${columnIndex}`,
        { cache: 'no-store' },
      );
      const json = await readApiEnvelope<{ success?: boolean; data?: Record<string, unknown> }>(res);
      if (!res.ok || !json?.success || !json.data) return;

      const assignment = json.data;
      const job = assignment.job as Record<string, unknown> | undefined;
      if (job?.id) {
        mergeJobs([
          normalizeScheduleJobRow({
            id: String(job.id),
            jobNumber: String(job.jobNumber ?? ''),
            customerName: String((job.customer as { name?: string } | undefined)?.name ?? ''),
            description: (job.description as string | null | undefined) ?? null,
            projectDetails: (job.projectDetails as string | null | undefined) ?? null,
            projectType: (job.projectType as string | null | undefined) ?? null,
            projectQtyArea: (job.projectQtyArea as string | null | undefined) ?? null,
            quotationNumber: (job.quotationNumber as string | null | undefined) ?? null,
            lpoNumber: (job.lpoNumber as string | null | undefined) ?? null,
            site: (job.site as string | null | undefined) ?? null,
            customer: job.customer as { name?: string | null } | null | undefined,
          }),
        ]);
      }

      const partial = apiAssignmentToDraftPartial(assignment, columnIndex - 1);
      suspendHistoryRef.current = true;
      setDrafts((prev) => {
        const idx = prev.findIndex((row) => row.columnIndex === columnIndex);
        if (idx < 0) return prev;
        const merged = normalizeDraft({ ...prev[idx], ...partial }, idx);
        persistedColumnFingerprintsRef.current.set(
          columnIndex,
          assignmentPayloadFingerprint(merged, getJob),
        );
        const next = prev.map((row, rowIdx) => (rowIdx === idx ? merged : row));
        draftsRef.current = next;
        return next;
      });
      queueMicrotask(() => {
        suspendHistoryRef.current = false;
      });
    },
    [columnHasUnsavedChanges, getJob, hasUnsavedScheduleChanges, mergeJobs, reloadScheduleFromServer, scheduleId],
  );

  const collaborationDisplayName =
    session?.user?.name?.trim() ||
    session?.user?.email?.split('@')[0]?.trim() ||
    'Editor';

  const { presence: schedulePresence } = useScheduleCollaboration({
    scheduleId: scheduleId || null,
    sessionId: collaborationSessionIdRef.current,
    displayName: collaborationDisplayName,
    enabled: Boolean(scheduleId && canEdit && !dis && !loading),
    onRemoteNotes: () => {
      if (scheduleInfo !== persistedNotesRef.current) return;
      if (undoStackRef.current.length > 0 || redoStackRef.current.length > 0) return;
      void reloadScheduleFromServer();
    },
    onRemoteColumn: (columnIndex, action) => {
      void mergeRemoteColumn(columnIndex, action);
    },
    onRemoteStructure: () => {
      if (hasUnsavedEditorChanges()) return;
      if (undoStackRef.current.length > 0 || redoStackRef.current.length > 0) return;
      void reloadScheduleFromServer();
    },
    onRemoteDrivers: () => {
      if (driverLogsFingerprint(driverTripRows) !== persistedDriverFingerprintRef.current) return;
      if (undoStackRef.current.length > 0 || redoStackRef.current.length > 0) return;
      void reloadScheduleFromServer();
    },
  });

  const otherScheduleEditors = useMemo(
    () => schedulePresence.filter((row) => !row.isSelf),
    [schedulePresence],
  );

  const createSchedule = async () => {
    const res = await fetch('/api/hr/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate }),
    });
    const json = await readApiEnvelope<{ success?: boolean; error?: string }>(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Failed');
    else { toast.success('Schedule created'); await loadSchedule(); }
  };

  const persistScheduleToServer = useCallback(
    async (options?: { silent?: boolean; deferStatus?: boolean }) => {
      if (!schedule || !('id' in schedule) || dis) return false;

      const invalidSplitTeam = findInvalidSplitTeamDraft(drafts);
      if (invalidSplitTeam) {
        if (!options?.silent) {
          toast.error(`${invalidSplitTeam.label} has an empty sub-team.`);
        }
        return false;
      }

      if (persistInFlightRef.current) {
        persistQueuedRef.current = true;
        return false;
      }

      const structureDirty = structureDirtyRef.current;
      const notesDirty = scheduleInfo !== persistedNotesRef.current;
      const driversDirty = driverLogsFingerprint(driverTripRows) !== persistedDriverFingerprintRef.current;
      const dirtyColumns = structureDirty
        ? drafts
        : drafts.filter((draft) => {
            const persisted = persistedColumnFingerprintsRef.current.get(draft.columnIndex);
            const next = assignmentPayloadFingerprint(draft, getJob);
            return !persisted || persisted !== next;
          });

      const saveFingerprint = schedulePersistenceFingerprint(drafts, scheduleInfo, driverTripRows);

      if (!structureDirty && dirtyColumns.length === 0 && !notesDirty && !driversDirty) {
        lastPersistedFingerprintRef.current = saveFingerprint;
        return true;
      }

      persistInFlightRef.current = true;
      if (!options?.silent) setSaving(true);
      else if (!options?.deferStatus) setAutoSaveStatus('saving');

      const sid = String((schedule as { id: string }).id);

      try {
        if (structureDirty || dirtyColumns.length > 0 || notesDirty) {
          const upserts = (structureDirty ? drafts : dirtyColumns).map((draft) =>
            buildAssignmentPayloadFromDraft(draft, getJob),
          );
          const patchBody: {
            upserts: ReturnType<typeof buildAssignmentPayloadFromDraft>[];
            pruneOtherColumns?: boolean;
            notes?: string;
          } = { upserts };
          if (structureDirty) {
            patchBody.pruneOtherColumns = true;
          }
          if (notesDirty) {
            patchBody.notes = scheduleInfo;
          }

          const res = await fetch(`/api/hr/schedule/${sid}/assignments`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody),
          });
          const json = await readApiEnvelope<{
            success?: boolean;
            error?: string;
            data?: { notes?: string | null };
          }>(res);
          if (!res.ok || !json?.success) {
            if (!options?.silent) toast.error(json?.error ?? 'Save failed');
            else if (!options?.deferStatus) setAutoSaveStatus('error');
            return false;
          }

          if (notesDirty) {
            persistedNotesRef.current = scheduleInfo;
            skipScheduleRemapRef.current = true;
            setSchedule((prev) =>
              prev && typeof prev === 'object'
                ? { ...(prev as Record<string, unknown>), notes: json.data?.notes ?? scheduleInfo }
                : prev,
            );
          }

          const columnsToMarkSaved = structureDirty ? drafts : dirtyColumns;
          for (const draft of columnsToMarkSaved) {
            persistedColumnFingerprintsRef.current.set(
              draft.columnIndex,
              assignmentPayloadFingerprint(draft, getJob),
            );
          }
          if (structureDirty) {
            const activeColumnIndexes = new Set(drafts.map((draft) => draft.columnIndex));
            for (const columnIndex of [...persistedColumnFingerprintsRef.current.keys()]) {
              if (!activeColumnIndexes.has(columnIndex)) {
                persistedColumnFingerprintsRef.current.delete(columnIndex);
              }
            }
            structureDirtyRef.current = false;
          }
        }

        if (driversDirty) {
          const driverRes = await fetch(`/api/hr/schedule/${sid}/driver-logs`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildDriverLogsPutBody(driverTripRows)),
          });
          const driverJson = await readApiEnvelope<{ success?: boolean; error?: string; data?: unknown }>(driverRes);
          if (!driverRes.ok || !driverJson?.success) {
            if (!options?.silent) toast.error(driverJson?.error ?? 'Driver trip save failed');
            else if (!options?.deferStatus) setAutoSaveStatus('error');
            return false;
          }

          const savedLogs = (driverJson.data ?? []) as ScheduleDriverLogRecord[];
          persistedDriverFingerprintRef.current = driverLogsFingerprint(driverTripRows);
          skipScheduleRemapRef.current = true;
          setSchedule((prev) =>
            prev && typeof prev === 'object'
              ? { ...(prev as Record<string, unknown>), driverLogs: savedLogs }
              : prev,
          );
          syncDriverTripStateFromLogs(savedLogs, driverLogVersion, false);
        }

        lastPersistedFingerprintRef.current = saveFingerprint;

        if (!options?.silent) {
          toast.success('Saved');
        } else if (!options?.deferStatus) {
          setAutoSaveStatus('saved');
          if (autoSaveStatusTimerRef.current != null) {
            window.clearTimeout(autoSaveStatusTimerRef.current);
          }
          autoSaveStatusTimerRef.current = window.setTimeout(() => {
            setAutoSaveStatus('idle');
            autoSaveStatusTimerRef.current = null;
          }, 2500);
        }
        return true;
      } finally {
        persistInFlightRef.current = false;
        if (!options?.silent) setSaving(false);
        if (persistQueuedRef.current) {
          persistQueuedRef.current = false;
          void persistScheduleToServer({ silent: true });
        }
      }
    },
    [
      dis,
      drafts,
      driverLogVersion,
      driverTripRows,
      getJob,
      schedule,
      scheduleInfo,
      syncDriverTripStateFromLogs,
    ],
  );

  const persistJobDescription = useCallback(
    async (jobId: string, description: string, options?: { silent?: boolean }) => {
      if (!canEditJob) return true;
      const normalized = description.trim();
      const saved = String(getJob(jobId)?.description ?? '').trim();
      if (normalized === saved) {
        setJobDescriptionEdits((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, jobId)) return prev;
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
        return true;
      }

      try {
        const updated = await updateJob({
          id: jobId,
          data: { description: normalized },
        }).unwrap();
        mergeJobs([jobRecordToScheduleRow(updated)]);
        setJobDescriptionEdits((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, jobId)) return prev;
          if (prev[jobId] !== description) return prev;
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
        return true;
      } catch (error) {
        if (!options?.silent) {
          toast.error(error instanceof Error ? error.message : 'Could not update work details on the job.');
        }
        return false;
      }
    },
    [canEditJob, getJob, mergeJobs, updateJob],
  );

  const persistPendingJobDescriptions = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!canEditJob) return true;
      const pending = Object.entries(jobDescriptionEditsRef.current).filter(([jobId, value]) => {
        const saved = String(getJob(jobId)?.description ?? '').trim();
        return value.trim() !== saved;
      });
      if (pending.length === 0) return true;

      let allOk = true;
      for (const [jobId, value] of pending) {
        const ok = await persistJobDescription(jobId, value, options);
        if (!ok) allOk = false;
      }
      return allOk;
    },
    [canEditJob, getJob, persistJobDescription],
  );

  const persistEditorChanges = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!schedule || !('id' in schedule)) return true;

      const jobsDirty = canEditJob && hasUnsavedJobDescriptionChanges();
      const scheduleDirty = !dis && hasUnsavedScheduleChanges();
      if (!jobsDirty && !scheduleDirty) return true;

      if (!options?.silent) setSaving(true);
      else setAutoSaveStatus('saving');

      let jobsOk = true;
      let scheduleOk = true;
      try {
        if (jobsDirty) {
          jobsOk = await persistPendingJobDescriptions({ silent: true });
        }
        if (scheduleDirty) {
          scheduleOk = await persistScheduleToServer({ silent: true, deferStatus: true });
        }
        if (!options?.silent) {
          if (jobsOk && scheduleOk) toast.success('Saved');
          else toast.error('Save failed');
        } else if (jobsOk && scheduleOk) {
          setAutoSaveStatus('saved');
          if (autoSaveStatusTimerRef.current != null) {
            window.clearTimeout(autoSaveStatusTimerRef.current);
          }
          autoSaveStatusTimerRef.current = window.setTimeout(() => {
            setAutoSaveStatus('idle');
            autoSaveStatusTimerRef.current = null;
          }, 2500);
        } else {
          setAutoSaveStatus('error');
        }
        return jobsOk && scheduleOk;
      } finally {
        if (!options?.silent) setSaving(false);
      }
    },
    [
      canEditJob,
      dis,
      hasUnsavedJobDescriptionChanges,
      hasUnsavedScheduleChanges,
      persistPendingJobDescriptions,
      persistScheduleToServer,
      schedule,
    ],
  );

  const saveAssignments = () => void persistEditorChanges({ silent: false });

  useEffect(() => {
    if (!schedule || loading) return;
    if (dis && !canEditJob) return;

    if (!hasUnsavedEditorChanges()) {
      lastPersistedFingerprintRef.current = schedulePersistenceFingerprint(
        drafts,
        scheduleInfo,
        driverTripRows,
      );
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistEditorChanges({ silent: true });
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [
    canEditJob,
    dis,
    drafts,
    driverTripRows,
    hasUnsavedEditorChanges,
    jobDescriptionEdits,
    loading,
    persistEditorChanges,
    schedule,
    scheduleInfo,
  ]);

  const runPublishValidation = useCallback(() => {
    return validateScheduleForPublish(draftsRef.current.map(asgDraftToValidationDraft));
  }, []);

  const executePublish = useCallback(
    async (options?: { acknowledgeLowHours?: boolean }) => {
      if (!schedule || !('id' in schedule)) return;

      if (hasUnsavedEditorChanges()) {
        const saved = await persistEditorChanges({ silent: false });
        if (!saved) return;
      }

      const validation = runPublishValidation();
      if (validation.blockingIssues.length > 0) {
        setPublishBlockMessages(validation.blockingIssues);
        return;
      }
      if (!options?.acknowledgeLowHours && validation.lowHourTeams.length > 0) {
        setPublishLowHourTeams(validation.lowHourTeams);
        return;
      }

      setPublishing(true);
      try {
        const sid = String((schedule as { id: string }).id);
        const res = await fetch(`/api/hr/schedule/${sid}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acknowledgeLowHours: options?.acknowledgeLowHours === true }),
        });
        const json = await readApiEnvelope<{
          success?: boolean;
          error?: string;
          details?: {
            code?: string;
            blockingIssues?: string[];
            lowHourTeams?: SchedulePublishLowHourTeam[];
          };
        }>(res);
        if (!res.ok || !json?.success) {
          const details = json?.details;
          if (details?.blockingIssues?.length) {
            setPublishBlockMessages(details.blockingIssues);
            return;
          }
          if (details?.lowHourTeams?.length) {
            setPublishLowHourTeams(details.lowHourTeams);
            return;
          }
          toast.error(json?.error ?? 'Publish failed');
          return;
        }
        toast.success('Published');
        loadSchedule();
      } finally {
        setPublishing(false);
      }
    },
    [hasUnsavedEditorChanges, loadSchedule, persistEditorChanges, runPublishValidation, schedule],
  );

  const publish = useCallback(() => {
    if (!schedule || !('id' in schedule)) return;
    const validation = runPublishValidation();
    if (validation.blockingIssues.length > 0) {
      setPublishBlockMessages(validation.blockingIssues);
      return;
    }
    if (validation.lowHourTeams.length > 0) {
      setPublishLowHourTeams(validation.lowHourTeams);
      return;
    }
    void executePublish();
  }, [executePublish, runPublishValidation, schedule]);

  const confirmPublishWithLowHours = useCallback(() => {
    setPublishLowHourTeams(null);
    void executePublish({ acknowledgeLowHours: true });
  }, [executePublish]);

  const applyPreviousScheduleTemplate = useCallback(async () => {
    if (!selectedTemplateDate) return;
    setApplyingTemplate(true);
    try {
      const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(selectedTemplateDate)}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Failed to load template');
        return;
      }
      mapFromApi(json.data as Record<string, unknown>);
      markScheduleStructureDirty();
      setTemplateModalOpen(false);
      toast.success(`Template loaded from ${selectedTemplateDate}`);
    } finally {
      setApplyingTemplate(false);
    }
  }, [mapFromApi, markScheduleStructureDirty, selectedTemplateDate]);

  const openTemplateModal = useCallback(() => {
    setSelectedTemplateDate((current) => {
      if (current && recentTemplateSchedules.some((item) => item.workDate === current)) {
        return current;
      }
      return recentTemplateSchedules[0]?.workDate ?? '';
    });
    setTemplateModalOpen(true);
  }, [recentTemplateSchedules]);

  const addColumn = () => {
    markScheduleStructureDirty();
    applyDrafts((prev) => {
      pendingScrollTeamColumnRef.current = prev.length;
      const nextNumber = getNextTeamNumber(prev);
      const empty = createEmptyDraft(
        prev.length ? Math.max(...prev.map((x) => x.columnIndex)) + 1 : 1,
        `Team#${nextNumber}`
      );
      const timing = labourTypeTiming
        ? {
            dutyStart: labourTypeTiming.dutyStart,
            dutyEnd: labourTypeTiming.dutyEnd,
            breakStart: labourTypeTiming.breakStart,
            breakEnd: labourTypeTiming.breakEnd,
          }
        : null;
      return [...prev, applyTimingFromTemplate(empty, timing)];
    });
  };

  const duplicateColumn = (idx: number) => {
    markScheduleStructureDirty();
    applyDrafts((prev) => {
      pendingScrollTeamColumnRef.current = prev.length;
      const src = prev[idx];
      if (!src) return prev;
      const nextNumber = getNextTeamNumber(prev);
      const newCol: AsgDraft = {
        ...src,
        columnIndex: prev.length ? Math.max(...prev.map((x) => x.columnIndex)) + 1 : 1,
        label: `Team#${nextNumber}`,
        members: src.members.map((m) => ({ ...m })),
        subTeams: src.subTeams.map((subTeam) => ({
          ...subTeam,
          id: createClientId(),
          members: subTeam.members.map((member) => ({ ...member })),
        })),
      };
      return [...prev, newCol];
    });
  };

  const removeColumn = (idx: number) => {
    markScheduleStructureDirty();
    applyDrafts((d) => d.filter((_, i) => i !== idx));
  };

  const reorderTeamColumns = (fromIndex: number, toIndex: number) => {
    markScheduleStructureDirty();
    applyDrafts((rows) => {
      const reordered = moveArrayItem(rows, fromIndex, toIndex);
      return reordered.map((row, index) => ({
        ...row,
        columnIndex: index + 1,
      }));
    });
  };

  const moveTeamColumn = (colIdx: number, direction: -1 | 1) => {
    const toIndex = colIdx + direction;
    if (toIndex < 0 || toIndex >= draftsRef.current.length) return;
    reorderTeamColumns(colIdx, toIndex);
  };

  const handleTeamColumnDrop = (targetColIdx: number) => {
    const sourceCol = draggingTeamColumnRef.current;
    if (sourceCol == null || dis) return;
    if (sourceCol !== targetColIdx) {
      reorderTeamColumns(sourceCol, targetColIdx);
    }
    draggingTeamColumnRef.current = null;
    setDraggingTeamColumn(null);
  };

  const addDriverTripRow = (driverEmployeeId: string) => {
    if (!driverEmployeeId || isGuestDriverRowKey(driverEmployeeId)) return;
    setDriverTripState((current) => {
      const currentIds =
        current.version === driverLogVersion
          ? current.selectedIds
          : driverTripRows.map((row) => row.rowKey);
      if (currentIds.includes(driverEmployeeId)) return current;
      return {
        version: driverLogVersion,
        values: current.version === driverLogVersion ? current.values : {},
        guestNames: current.version === driverLogVersion ? current.guestNames : {},
        selectedIds: [...currentIds, driverEmployeeId],
      };
    });
    setSelectedDriverToAdd('');
  };

  const addGuestDriverTripRow = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const rowKey = createPendingGuestDriverRowKey();
    setDriverTripState((current) => {
      const currentIds =
        current.version === driverLogVersion
          ? current.selectedIds
          : driverTripRows.map((row) => row.rowKey);
      return {
        version: driverLogVersion,
        values: current.version === driverLogVersion ? current.values : {},
        guestNames: {
          ...(current.version === driverLogVersion ? current.guestNames : {}),
          [rowKey]: trimmed,
        },
        selectedIds: [...currentIds, rowKey],
      };
    });
    setGuestDriverNameInput('');
  };

  const updateGuestDriverName = (rowKey: string, name: string) => {
    setDriverTripState((current) => ({
      version: driverLogVersion,
      values: current.version === driverLogVersion ? current.values : {},
      guestNames: {
        ...(current.version === driverLogVersion ? current.guestNames : {}),
        [rowKey]: name,
      },
      selectedIds:
        current.version === driverLogVersion
          ? current.selectedIds
          : driverTripRows.map((row) => row.rowKey),
    }));
  };

  const removeDriverTripRow = (rowKey: string) => {
    setDriverTripState((current) => {
      const currentIds =
        current.version === driverLogVersion
          ? current.selectedIds
          : driverTripRows.map((row) => row.rowKey);
      const guestNames = { ...(current.version === driverLogVersion ? current.guestNames : {}) };
      delete guestNames[rowKey];
      return {
        version: driverLogVersion,
        values: Object.fromEntries(
          Object.entries(current.version === driverLogVersion ? current.values : {}).filter(([id]) => id !== rowKey)
        ),
        guestNames,
        selectedIds: currentIds.filter((id) => id !== rowKey),
      };
    });
  };

  const applyDrafts = useCallback(
    (updater: (current: AsgDraft[]) => AsgDraft[]) => {
      const current = draftsRef.current;
      const next = updater(current);
      if (suspendHistoryRef.current) {
        draftsRef.current = next;
        setDrafts(next);
        return;
      }
      if (draftsEqual(next, current)) return;
      pushUndoSnapshot(captureEditorSnapshot(current, jobDescriptionEditsRef.current, getJob));
      draftsRef.current = next;
      setDrafts(next);
    },
    [getJob, pushUndoSnapshot],
  );

  const restoreEditorSnapshot = useCallback((snapshot: ScheduleEditorSnapshot) => {
    suspendHistoryRef.current = true;
    const restored = cloneEditorSnapshot(snapshot);
    draftsRef.current = restored.drafts;
    setDrafts(restored.drafts);
    jobDescriptionEditsRef.current = restored.jobDescriptionEdits;
    setJobDescriptionEdits(restored.jobDescriptionEdits);
    resetWorkDetailsHistorySession();
    if (workDetailsHistoryResetTimerRef.current != null) {
      window.clearTimeout(workDetailsHistoryResetTimerRef.current);
      workDetailsHistoryResetTimerRef.current = null;
    }
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, [resetWorkDetailsHistorySession]);

  const undo = useCallback(() => {
    if (publishedEditGuarded) {
      setPublishedEditWarningOpen(true);
      return;
    }
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, captureCurrentEditorSnapshot()];
    restoreEditorSnapshot(previous);
    syncHistoryUi();
  }, [captureCurrentEditorSnapshot, publishedEditGuarded, restoreEditorSnapshot, syncHistoryUi]);

  const redo = useCallback(() => {
    if (publishedEditGuarded) {
      setPublishedEditWarningOpen(true);
      return;
    }
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-39), captureCurrentEditorSnapshot()];
    restoreEditorSnapshot(next);
    syncHistoryUi();
  }, [captureCurrentEditorSnapshot, publishedEditGuarded, restoreEditorSnapshot, syncHistoryUi]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingContext =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (isTypingContext) return;

      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && key === 'z') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && !e.shiftKey && key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && !e.shiftKey && key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const upd = (idx: number, patch: Partial<AsgDraft>) =>
    applyDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleWorkDetailsChange = useCallback(
    (jobId: string, value: string) => {
      if (!canEditJob || !jobId) return;

      if (!suspendHistoryRef.current) {
        const session = workDetailsHistorySessionRef.current;
        if (session.jobId !== jobId || !session.pushed) {
          pushUndoSnapshot(
            captureEditorSnapshot(draftsRef.current, jobDescriptionEditsRef.current, getJob),
          );
          workDetailsHistorySessionRef.current = { jobId, pushed: true };
        }
      }

      const nextEdits = { ...jobDescriptionEditsRef.current, [jobId]: value };
      jobDescriptionEditsRef.current = nextEdits;
      setJobDescriptionEdits(nextEdits);

      if (workDetailsHistoryResetTimerRef.current != null) {
        window.clearTimeout(workDetailsHistoryResetTimerRef.current);
      }
      workDetailsHistoryResetTimerRef.current = window.setTimeout(() => {
        workDetailsHistoryResetTimerRef.current = null;
        resetWorkDetailsHistorySession();
      }, 1200);
    },
    [canEditJob, getJob, pushUndoSnapshot, resetWorkDetailsHistorySession],
  );

  const handleWorkDetailsKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if (mod && !e.shiftKey && key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }
      if (mod && !e.shiftKey && key === 'y') {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    },
    [redo, undo],
  );

  useEffect(() => {
    return () => {
      if (workDetailsHistoryResetTimerRef.current != null) {
        window.clearTimeout(workDetailsHistoryResetTimerRef.current);
        workDetailsHistoryResetTimerRef.current = null;
      }
    };
  }, []);

  const applyJobToColumn = useCallback(
    (colIdx: number, jid: string) => {
      const job = jid ? getJob(jid) : undefined;
      const draft = draftsRef.current[colIdx];
      const nextWorkProcess = getInitialWorkProcessDetails(job);
      applyDrafts((rows) =>
        rows.map((row, index) =>
          index === colIdx
            ? {
                ...row,
                jobId: jid,
                jobNumberSnapshot: jid ? job?.jobNumber ?? draft?.jobNumberSnapshot ?? '' : '',
                workProcessDetails: nextWorkProcess,
              }
            : row
        )
      );
    },
    [applyDrafts, getJob]
  );

  const handleJobSelect = useCallback(
    async (colIdx: number, jid: string) => {
      if (!jid) {
        applyJobToColumn(colIdx, '');
        return;
      }
      let job = getJob(jid);
      if (!job?.status) {
        const item = await resolveScheduleJobById(jid);
        job = getJob(jid) ?? ({ id: jid, jobNumber: item.label, status: item.status } as JobOpt);
      }
      const status = String(job?.status ?? 'ACTIVE');
      if (status !== 'ACTIVE') {
        setPendingInactiveJob({
          colIdx,
          jobId: jid,
          jobNumber: job?.jobNumber ?? '',
          status,
        });
        return;
      }
      applyJobToColumn(colIdx, jid);
    },
    [applyJobToColumn, getJob, resolveScheduleJobById]
  );

  const handleActivatePendingJob = useCallback(async () => {
    if (!pendingInactiveJob) return;
    setActivatingJob(true);
    try {
      const updated = await updateJob({
        id: pendingInactiveJob.jobId,
        data: { status: 'ACTIVE' },
      }).unwrap();
      mergeJobs([jobRecordToScheduleRow(updated)]);
      applyJobToColumn(pendingInactiveJob.colIdx, pendingInactiveJob.jobId);
      dismissedStaleJobIdsRef.current.delete(pendingInactiveJob.jobId);
      setPendingInactiveJob(null);
      toast.success(`Job ${updated.jobNumber} is now active.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to activate job');
    } finally {
      setActivatingJob(false);
    }
  }, [applyJobToColumn, mergeJobs, pendingInactiveJob, updateJob]);

  const syncStaleAssignedJobs = useCallback(() => {
    if (pendingInactiveJob || pendingStaleJob) return;
    const state = store.getState();
    for (let colIdx = 0; colIdx < draftsRef.current.length; colIdx += 1) {
      const draft = draftsRef.current[colIdx];
      if (!draft.jobId || dismissedStaleJobIdsRef.current.has(draft.jobId)) continue;
      const job =
        jobsApi.endpoints.getJobById.select(draft.jobId)(state)?.data ??
        getJob(draft.jobId);
      if (!job?.status || job.status === 'ACTIVE') continue;
      setPendingStaleJob({
        colIdx,
        jobId: draft.jobId,
        jobNumber: job.jobNumber,
        status: job.status,
      });
      return;
    }
  }, [getJob, pendingInactiveJob, pendingStaleJob, store]);

  const handleClearStaleJob = useCallback(() => {
    if (!pendingStaleJob) return;
    dismissedStaleJobIdsRef.current.delete(pendingStaleJob.jobId);
    applyJobToColumn(pendingStaleJob.colIdx, '');
    setPendingStaleJob(null);
  }, [applyJobToColumn, pendingStaleJob]);

  const handleActivateStaleJob = useCallback(async () => {
    if (!pendingStaleJob) return;
    setActivatingJob(true);
    try {
      const updated = await updateJob({
        id: pendingStaleJob.jobId,
        data: { status: 'ACTIVE' },
      }).unwrap();
      mergeJobs([jobRecordToScheduleRow(updated)]);
      dismissedStaleJobIdsRef.current.delete(pendingStaleJob.jobId);
      setPendingStaleJob(null);
      toast.success(`Job ${updated.jobNumber} is active again.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to activate job');
    } finally {
      setActivatingJob(false);
    }
  }, [mergeJobs, pendingStaleJob, updateJob]);

  const handleDismissStaleJob = useCallback(() => {
    if (!pendingStaleJob) return;
    dismissedStaleJobIdsRef.current.add(pendingStaleJob.jobId);
    setPendingStaleJob(null);
  }, [pendingStaleJob]);

  useEffect(() => {
    assignedJobIds.forEach((id) => {
      dispatch(jobsApi.endpoints.getJobById.initiate(id, { forceRefetch: false }));
    });
  }, [assignedJobIds, dispatch]);

  useEffect(() => {
    syncStaleAssignedJobs();
  }, [assignedJobsFingerprint, syncStaleAssignedJobs]);

  useJobLiveUpdate(
    useCallback(() => {
      invalidateJobCaches(dispatch, assignedJobIds);
      void refetchScheduleJobs().then(() => {
        syncStaleAssignedJobs();
      });
    }, [assignedJobIds, dispatch, refetchScheduleJobs, syncStaleAssignedJobs])
  );

  const getDraftWorkerCount = useCallback(
    (draft: AsgDraft) => {
      const ids = new Set<string>();
      if (draft.splitMode) {
        draft.subTeams.forEach((subTeam) => {
          subTeam.members.forEach((member) => {
            if (member.employeeId) ids.add(member.employeeId);
          });
        });
      } else {
        draft.members.forEach((member) => {
          if (member.employeeId) ids.add(member.employeeId);
        });
      }
      return ids.size;
    },
    []
  );

  const getDraftAssignedIds = useCallback(
    (
      draft: AsgDraft,
      options?: {
        excludeFlatMemberIndex?: number;
        excludeSubTeamIndex?: number;
        excludeSubTeamMemberIndex?: number;
      }
    ) => {
      const ids = new Set<string>();

      if (!draft.splitMode) {
        draft.members.forEach((member, index) => {
          if (!member.employeeId) return;
          if (options?.excludeFlatMemberIndex === index) return;
          ids.add(member.employeeId);
        });
        return ids;
      }

      draft.subTeams.forEach((subTeam, subTeamIndex) => {
        subTeam.members.forEach((member, memberIndex) => {
          if (!member.employeeId) return;
          if (
            options?.excludeSubTeamIndex === subTeamIndex &&
            options?.excludeSubTeamMemberIndex === memberIndex
          ) {
            return;
          }
          ids.add(member.employeeId);
        });
      });
      return ids;
    },
    []
  );

  const getSelectableWorkerItems = useCallback(
    (
      draft: AsgDraft,
      options?: {
        excludeFlatMemberIndex?: number;
        excludeSubTeamIndex?: number;
        excludeSubTeamMemberIndex?: number;
      }
    ) => {
      const selectedIds = getDraftAssignedIds(draft, options);
      return workerItems.filter((item) => !selectedIds.has(item.id));
    },
    [getDraftAssignedIds, workerItems]
  );

  const toggleSplitMode = (colIdx: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx) return row;
        if (row.splitMode) {
          return {
            ...row,
            splitMode: false,
            members: normalizeWorkerMemberList(row.subTeams.flatMap((subTeam) => subTeam.members)),
            subTeams: [],
          };
        }
        return {
          ...row,
          splitMode: true,
          members: [],
          subTeams: [
            {
              ...createEmptySubTeam(0),
              members: normalizeWorkerMemberList(row.members),
            },
          ],
        };
      })
    );

  const updateFlatMember = (colIdx: number, memberIndex: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || row.splitMode) return row;
        if (employeeId && getDraftAssignedIds(row, { excludeFlatMemberIndex: memberIndex }).has(employeeId)) {
          return row;
        }
        const updated = row.members.map((member, index) =>
          index === memberIndex ? { ...member, employeeId, slot: memberIndex + 1 } : member
        );
        return {
          ...row,
          members: normalizeWorkerMemberList(updated),
        };
      })
    );

  const removeFlatMember = (colIdx: number, memberIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || row.splitMode) return row;
        const updated = row.members.filter((_, index) => index !== memberIndex);
        return {
          ...row,
          members: normalizeWorkerMemberList(updated),
        };
      })
    );

  const addSubTeam = (colIdx: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) =>
        idx === colIdx && row.splitMode
          ? { ...row, subTeams: [...row.subTeams, createEmptySubTeam(row.subTeams.length)] }
          : row
      )
    );

  const removeSubTeam = (colIdx: number, subTeamIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) =>
        idx === colIdx && row.splitMode
          ? {
              ...row,
              subTeams: row.subTeams
                .filter((_, index) => index !== subTeamIndex)
                .map((subTeam, index) => ({ ...subTeam, label: subTeam.label || nextSubTeamLabel(index) })),
            }
          : row
      )
    );

  const updateSubTeamMeta = (
    colIdx: number,
    subTeamIndex: number,
    patch: Partial<Pick<subTeamDraft, 'label'>>
  ) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? { ...subTeam, ...patch }
              : subTeam
          ),
        };
      })
    );

  const reorderFlatMembers = (colIdx: number, fromIndex: number, toIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || row.splitMode) return row;
        return {
          ...row,
          members: normalizeWorkerMemberList(moveArrayItem(row.members, fromIndex, toIndex)),
        };
      })
    );

  const reorderSubTeamMembers = (
    colIdx: number,
    subTeamIndex: number,
    fromIndex: number,
    toIndex: number
  ) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? {
                  ...subTeam,
                  members: normalizeWorkerMemberList(moveArrayItem(subTeam.members, fromIndex, toIndex)),
                }
              : subTeam
          ),
        };
      })
    );

  const reorderSubTeams = (colIdx: number, fromIndex: number, toIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        const reordered = moveArrayItem(row.subTeams, fromIndex, toIndex);
        return {
          ...row,
          subTeams: reordered.map((subTeam, index) => ({
            ...subTeam,
            label: subTeam.label || nextSubTeamLabel(index),
          })),
        };
      })
    );

  const handleWorkerDrop = (target: WorkerDragTarget) => {
    const draggingWorker = draggingWorkerRef.current;
    if (!draggingWorker || dis) return;
    if (
      draggingWorker.kind === 'flat' &&
      target.kind === 'flat' &&
      draggingWorker.colIdx === target.colIdx &&
      draggingWorker.memberIndex !== target.memberIndex
    ) {
      reorderFlatMembers(target.colIdx, draggingWorker.memberIndex, target.memberIndex);
    } else if (
      draggingWorker.kind === 'subTeam' &&
      target.kind === 'subTeam' &&
      draggingWorker.colIdx === target.colIdx &&
      draggingWorker.subTeamIndex === target.subTeamIndex &&
      draggingWorker.memberIndex !== target.memberIndex
    ) {
      reorderSubTeamMembers(
        target.colIdx,
        target.subTeamIndex,
        draggingWorker.memberIndex,
        target.memberIndex
      );
    }
    draggingWorkerRef.current = null;
    setDraggingWorker(null);
  };

  const handleSubTeamDrop = (target: SubTeamDragTarget) => {
    const draggingSubTeam = draggingSubTeamRef.current;
    if (!draggingSubTeam || dis) return;
    if (
      draggingSubTeam.colIdx === target.colIdx &&
      draggingSubTeam.subTeamIndex !== target.subTeamIndex
    ) {
      reorderSubTeams(target.colIdx, draggingSubTeam.subTeamIndex, target.subTeamIndex);
    }
    draggingSubTeamRef.current = null;
    setDraggingSubTeam(null);
  };

  const resolveSchedulePointerDrop = useCallback(
    (clientX: number, clientY: number) => {
      const dropEl = document
        .elementFromPoint(clientX, clientY)
        ?.closest('[data-schedule-drop]') as HTMLElement | null;
      if (!dropEl) return;

      const dropKind = dropEl.dataset.scheduleDrop;
      if (dropKind === 'worker') {
        const kind = dropEl.dataset.workerKind;
        const colIdx = Number(dropEl.dataset.workerCol);
        const memberIndex = Number(dropEl.dataset.workerMember);
        if (!Number.isFinite(colIdx) || !Number.isFinite(memberIndex)) return;
        if (kind === 'subTeam') {
          const subTeamIndex = Number(dropEl.dataset.workerSubTeam);
          if (!Number.isFinite(subTeamIndex)) return;
          handleWorkerDrop({ kind: 'subTeam', colIdx, subTeamIndex, memberIndex });
          return;
        }
        handleWorkerDrop({ kind: 'flat', colIdx, memberIndex });
        return;
      }
      if (dropKind === 'subteam') {
        const colIdx = Number(dropEl.dataset.subteamCol);
        const subTeamIndex = Number(dropEl.dataset.subteamIndex);
        if (!Number.isFinite(colIdx) || !Number.isFinite(subTeamIndex)) return;
        handleSubTeamDrop({ colIdx, subTeamIndex });
        return;
      }
      if (dropKind === 'team-column') {
        const colIdx = Number(dropEl.dataset.teamCol);
        if (!Number.isFinite(colIdx)) return;
        handleTeamColumnDrop(colIdx);
      }
    },
    [handleSubTeamDrop, handleTeamColumnDrop, handleWorkerDrop],
  );

  const startWorkerDrag = useCallback((target: WorkerDragTarget) => {
    draggingWorkerRef.current = target;
    setDraggingWorker(target);
  }, []);

  const endWorkerDrag = useCallback(() => {
    draggingWorkerRef.current = null;
    setDraggingWorker(null);
  }, []);

  const startSubTeamDrag = useCallback((target: SubTeamDragTarget) => {
    draggingSubTeamRef.current = target;
    setDraggingSubTeam(target);
  }, []);

  const endSubTeamDrag = useCallback(() => {
    draggingSubTeamRef.current = null;
    setDraggingSubTeam(null);
  }, []);

  const startTeamColumnDrag = useCallback((colIdx: number) => {
    draggingTeamColumnRef.current = colIdx;
    setDraggingTeamColumn(colIdx);
  }, []);

  const endTeamColumnDrag = useCallback(() => {
    draggingTeamColumnRef.current = null;
    setDraggingTeamColumn(null);
  }, []);

  const isWorkerDragSource = (target: WorkerDragTarget) => {
    if (!draggingWorker) return false;
    if (draggingWorker.kind !== target.kind || draggingWorker.colIdx !== target.colIdx) return false;
    if (draggingWorker.kind === 'flat' && target.kind === 'flat') {
      return draggingWorker.memberIndex === target.memberIndex;
    }
    if (draggingWorker.kind === 'subTeam' && target.kind === 'subTeam') {
      return (
        draggingWorker.subTeamIndex === target.subTeamIndex &&
        draggingWorker.memberIndex === target.memberIndex
      );
    }
    return false;
  };

  const isSubTeamDragSource = (target: SubTeamDragTarget) =>
    draggingSubTeam != null &&
    draggingSubTeam.colIdx === target.colIdx &&
    draggingSubTeam.subTeamIndex === target.subTeamIndex;

  const updateSubTeamMember = (colIdx: number, subTeamIndex: number, memberIndex: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        if (
          employeeId &&
          getDraftAssignedIds(row, {
            excludeSubTeamIndex: subTeamIndex,
            excludeSubTeamMemberIndex: memberIndex,
          }).has(employeeId)
        ) {
          return row;
        }
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? {
                  ...subTeam,
                  members: normalizeWorkerMemberList(
                    subTeam.members.map((member, innerIndex) =>
                      innerIndex === memberIndex
                        ? { ...member, employeeId, slot: memberIndex + 1 }
                        : member
                    )
                  ),
                }
              : subTeam
          ),
        };
      })
    );

  const removeSubTeamMember = (colIdx: number, subTeamIndex: number, memberIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) =>
            index === subTeamIndex
              ? {
                  ...subTeam,
                  members: normalizeWorkerMemberList(
                    subTeam.members.filter((_, innerIndex) => innerIndex !== memberIndex)
                  ),
                }
              : subTeam
          ),
        };
      })
    );

  const openWorkerCreateModal = useCallback((suggestedName: string, target: WorkerCreateTarget) => {
    const trimmed = suggestedName.trim();
    if (!trimmed) return;
    setPendingWorkerCreate({ suggestedName: trimmed, target });
  }, []);

  const buildWorkerEmptyAction = useCallback(
    (target: WorkerCreateTarget) => {
      if (!canCreateEmployee || dis) return undefined;
      return {
        label: (query: string) => `Create employee "${query.trim()}"`,
        onAction: (query: string) => openWorkerCreateModal(query, target),
      };
    },
    [canCreateEmployee, dis, openWorkerCreateModal],
  );

  const handleWorkerEmployeeCreated = (
    employee: {
      id: string;
      fullName: string;
      preferredName: string | null;
      employeeCode: string;
      profileExtension?: unknown;
    },
  ) => {
    const row: ScheduleEmployeeRow = {
      id: employee.id,
      fullName: employee.fullName,
      preferredName: employee.preferredName,
      employeeCode: employee.employeeCode,
      status: 'ACTIVE',
      profileExtension: employee.profileExtension,
    };
    mergeEmployees([toScheduleEmployee(row)]);

    const target = pendingWorkerCreate?.target;
    if (!target) return;
    if (target.kind === 'flat') {
      updateFlatMember(target.colIdx, target.memberIndex, employee.id);
    } else {
      updateSubTeamMember(target.colIdx, target.subTeamIndex, target.memberIndex, employee.id);
    }
  };

  const addWorkerToTeam = (colIdx: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !employeeId) return row;
        if (getDraftAssignedIds(row).has(employeeId)) return row;
        if (!row.splitMode) {
          const emptyIndex = row.members.findIndex((member) => !member.employeeId);
          const updated =
            emptyIndex >= 0
              ? row.members.map((member, index) =>
                  index === emptyIndex ? { ...member, employeeId, slot: index + 1 } : member
                )
              : [...row.members, { employeeId, role: 'WORKER' as const, slot: row.members.length + 1 }];
          return {
            ...row,
            members: normalizeWorkerMemberList(updated),
          };
        }
        const targetIndex = row.subTeams.length > 0 ? row.subTeams.length - 1 : 0;
        const nextSubTeams = row.subTeams.length > 0 ? row.subTeams : [createEmptySubTeam(0)];
        return {
          ...row,
          splitMode: true,
          members: [],
          subTeams: nextSubTeams.map((subTeam, index) => {
            if (index !== targetIndex) return subTeam;
            const emptyIndex = subTeam.members.findIndex((member) => !member.employeeId);
            const updated =
              emptyIndex >= 0
                ? subTeam.members.map((member, innerIndex) =>
                    innerIndex === emptyIndex ? { ...member, employeeId, slot: innerIndex + 1 } : member
                  )
                : [
                    ...subTeam.members,
                    { employeeId, role: 'WORKER' as const, slot: subTeam.members.length + 1 },
                  ];
            return {
              ...subTeam,
              members: normalizeWorkerMemberList(updated),
            };
          }),
        };
      })
    );

  const empName = useCallback(
    (id: string) => {
      const e = getEmployee(id);
      return e ? e.preferredName || e.fullName : '';
    },
    [getEmployee]
  );

  const focusScheduleCell = useCallback((rowKey: string, col: number, sub = 0): boolean => {
    const exact = document.querySelector<HTMLElement>(
      `[data-schedule-nav="true"][data-nav-row-key="${rowKey}"][data-nav-col="${col}"][data-nav-sub="${sub}"]`
    );
    if (exact) {
      exact.focus();
      return true;
    }
    if (rowKey !== NAV_ROW.workers) {
      const fallback = document.querySelector<HTMLElement>(
        `[data-schedule-nav="true"][data-nav-row-key="${rowKey}"][data-nav-col="${col}"]`
      );
      if (fallback) {
        fallback.focus();
        return true;
      }
    }
    return false;
  }, []);

  const tryFocusScheduleRowKey = useCallback(
    (
      rowKey: string,
      col: number,
      preferredSub: number,
      enterDirection?: 'up' | 'down',
    ): boolean => {
      if (rowKey === NAV_ROW.workers) {
        const colIdx = col - 1;
        const draft = draftsRef.current[colIdx];
        const subs = draft ? getWorkerFieldNavSubs(draft) : [];
        if (subs.length === 0) return false;
        if (enterDirection === 'up') {
          return focusScheduleCell(rowKey, col, subs[subs.length - 1]);
        }
        if (enterDirection === 'down') {
          return focusScheduleCell(rowKey, col, subs[0]);
        }
        if (subs.includes(preferredSub) && focusScheduleCell(rowKey, col, preferredSub)) return true;
        for (const workerSub of subs) {
          if (focusScheduleCell(rowKey, col, workerSub)) return true;
        }
        return false;
      }
      if (rowKey === NAV_ROW.duty || rowKey === NAV_ROW.break) {
        if (focusScheduleCell(rowKey, col, preferredSub)) return true;
        const alternateSub = preferredSub === 0 ? 1 : 0;
        if (focusScheduleCell(rowKey, col, alternateSub)) return true;
        return false;
      }
      return focusScheduleCell(rowKey, col, 0);
    },
    [focusScheduleCell],
  );

  const focusAdjacentScheduleRow = useCallback(
    (direction: 'up' | 'down', currentRowKey: string, col: number, sub: number) => {
      const visibleKeys = visibleScheduleRowKeysRef.current;
      const currentIndex = visibleKeys.indexOf(currentRowKey);
      if (currentIndex < 0) return;
      const step = direction === 'down' ? 1 : -1;
      for (let i = currentIndex + step; i >= 0 && i < visibleKeys.length; i += step) {
        if (tryFocusScheduleRowKey(visibleKeys[i], col, sub, direction)) return;
      }
    },
    [tryFocusScheduleRowKey],
  );

  const focusNextWorkerField = useCallback(
    (colIdx: number, currentSub: number) => {
      window.setTimeout(() => {
        const col = colIdx + 1;
        const draft = draftsRef.current[colIdx];
        if (!draft) return;
        const subs = getWorkerFieldNavSubs(draft);
        const currentIndex = subs.indexOf(currentSub);
        const nextSub = currentIndex >= 0 ? subs[currentIndex + 1] : undefined;
        if (nextSub == null) return;
        focusScheduleCell(NAV_ROW.workers, col, nextSub);
      }, 0);
    },
    [focusScheduleCell]
  );

  const handleScheduleGridKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const target = e.currentTarget as HTMLElement;
      if (target.getAttribute('aria-expanded') === 'true') return;

      const rowKey = target.dataset.navRowKey ?? '';
      const col = Number(target.dataset.navCol ?? '-1');
      const sub = Number(target.dataset.navSub ?? '0');
      if (!rowKey || col < 0) return;

      e.preventDefault();

      if (rowKey === NAV_ROW.workers && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const colIdx = col - 1;
        const draft = draftsRef.current[colIdx];
        const subs = draft ? getWorkerFieldNavSubs(draft) : [];
        const currentIndex = subs.indexOf(sub);
        if (e.key === 'ArrowDown' && currentIndex >= 0 && currentIndex < subs.length - 1) {
          focusScheduleCell(rowKey, col, subs[currentIndex + 1]);
          return;
        }
        if (e.key === 'ArrowUp' && currentIndex > 0) {
          focusScheduleCell(rowKey, col, subs[currentIndex - 1]);
          return;
        }
      }

      const isPairedTimeRow = rowKey === NAV_ROW.duty || rowKey === NAV_ROW.break;
      if (isPairedTimeRow && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const maxCol = draftsRef.current.length;
        if (e.key === 'ArrowRight') {
          if (sub === 0) {
            focusScheduleCell(rowKey, col, 1);
            return;
          }
          if (col < maxCol) {
            focusScheduleCell(rowKey, col + 1, 0);
            return;
          }
          return;
        }
        if (sub === 1) {
          focusScheduleCell(rowKey, col, 0);
          return;
        }
        if (col > 1) {
          focusScheduleCell(rowKey, col - 1, 1);
          return;
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        focusAdjacentScheduleRow('up', rowKey, col, sub);
        return;
      }
      if (e.key === 'ArrowDown') {
        focusAdjacentScheduleRow('down', rowKey, col, sub);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const nextCol = e.key === 'ArrowLeft' ? Math.max(1, col - 1) : col + 1;
        if (rowKey === NAV_ROW.workers) {
          const targetSub = resolveWorkerNavSubForColumn(
            draftsRef.current[nextCol - 1],
            draftsRef.current[col - 1],
            sub,
          );
          focusScheduleCell(rowKey, nextCol, targetSub);
          return;
        }
        focusScheduleCell(rowKey, nextCol, sub);
      }
    },
    [focusAdjacentScheduleRow, focusScheduleCell],
  );

  const getGridNavProps = useCallback(
    (rowKey: string, col: number, sub = 0) => ({
      'data-schedule-nav': 'true',
      'data-nav-row-key': rowKey,
      'data-nav-col': String(col),
      'data-nav-sub': String(sub),
      onKeyDown: handleScheduleGridKeyDown,
    }),
    [handleScheduleGridKeyDown]
  );

  const getWorkerSearchInputProps = useCallback(
    (colIdx: number, sub: number) =>
      scheduleSearchInputProps(getGridNavProps(NAV_ROW.workers, colIdx + 1, sub)),
    [getGridNavProps]
  );

  const suggestedWorkersByColumn = useMemo(() => {
    const byColumn = new Map<number, EmployeeProfile[]>();
    for (let ci = 0; ci < drafts.length; ci++) {
      const d = drafts[ci];
      const job = getJob(d.jobId);
      const required = parseJobExpertise(job);
      if (required.length === 0) {
        byColumn.set(ci, []);
        continue;
      }
      const requiredNorm = new Set(required.map(normalizeSkill));
      const usedInColumn = getDraftAssignedIds(d);
      const suggestions = workerPool.filter((w) => {
        if (usedInColumn.has(w.id)) return false;
        const expertiseNorm = new Set(w.workforce.expertises.map(normalizeSkill));
        for (const r of requiredNorm) {
          if (expertiseNorm.has(r)) return true;
        }
        return false;
      });
      byColumn.set(ci, suggestions);
    }
    return byColumn;
  }, [drafts, getJob, getDraftAssignedIds, workerPool]);

  const scheduleSummary = useMemo(() => {
    const workerCount = drafts.reduce(
      (sum, draft) => sum + getDraftWorkerCount(draft),
      0
    );
    const groupsWithTiming = drafts.filter((draft) => draft.dutyStart && draft.dutyEnd).length;
    return {
      groups: drafts.length,
      workers: workerCount,
      groupsWithTiming,
    };
  }, [drafts, getDraftWorkerCount]);

  const buildSchedulePreviewData = (): WorkScheduleContext => {
    const primaryJob =
      drafts
        .map((draft) => getJob(draft.jobId))
        .find((job): job is JobOpt => Boolean(job)) ?? null;

    const printTeamAssignments = buildEmployeeTeamAssignmentMap(
      collectDraftPrintTeamAssignments(drafts),
    );
    const printWorkerName = (employeeId: string) =>
      formatScheduleWorkerNameForPrint(empName(employeeId), employeeId, printTeamAssignments);

    return {
      company: {
        name: session?.user?.activeCompanyName ?? '',
        address: '',
        phone: '',
        email: '',
        letterheadUrl: '',
      },
      job: {
        jobNumber: primaryJob?.jobNumber ?? '',
        customerName: primaryJob?.customerName ?? '',
        projectDetails: primaryJob?.projectDetails ?? '',
        workProcessDetails: primaryJob?.description ?? '',
        locationLabel: primaryJob?.site ?? '',
      },
      schedule: {
        title: 'Daily Work Schedule',
        workDate,
        workDateLabel: new Date(`${workDate}T00:00:00`).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        status: status || 'DRAFT',
        groupCount: drafts.length,
        assignedWorkerCount: scheduleSummary.workers,
        groupsWithTiming: scheduleSummary.groupsWithTiming,
        driverCount: driverTripRows.length,
        driverTripSummary: `${driverTripRows.length} active driver${driverTripRows.length === 1 ? '' : 's'} listed`,
        notes: scheduleInfo.trim(),
        remarksSummary: [scheduleInfo.trim(), ...drafts.map((draft) => draft.remarks.trim()).filter(Boolean)].filter(Boolean).join(' | '),
        multiAssignedWorkerSummary: buildMultiAssignedWorkerSummary(printTeamAssignments, empName),
      },
      scheduleGroups: drafts.map((draft) => {
        const job = getJob(draft.jobId);
        const workDetails = getJobWorkDetails(draft.jobId);
        const flatWorkerNames = draft.splitMode
          ? draft.subTeams
              .flatMap((subTeam) =>
                subTeam.members
                  .map((member) => printWorkerName(member.employeeId))
                  .filter(Boolean),
              )
          : draft.members
              .map((member) => printWorkerName(member.employeeId))
              .filter(Boolean);
        const numberedFlatWorkerNames = draft.splitMode
          ? draft.subTeams.flatMap((subTeam) =>
              subTeam.members
                .map((member, index) =>
                  formatNumberedScheduleWorkerNameForPrint(
                    index + 1,
                    empName(member.employeeId),
                    member.employeeId,
                    printTeamAssignments,
                  ),
                )
                .filter(Boolean),
            )
          : draft.members
              .map((member, index) =>
                formatNumberedScheduleWorkerNameForPrint(
                  index + 1,
                  empName(member.employeeId),
                  member.employeeId,
                  printTeamAssignments,
                ),
              )
              .filter(Boolean);
        const dutyStartLabel = formatScheduleTimeForPrint(draft.dutyStart);
        const dutyEndLabel = formatScheduleTimeForPrint(draft.dutyEnd);
        const breakStartLabel = formatScheduleTimeForPrint(draft.breakStart);
        const breakEndLabel = formatScheduleTimeForPrint(draft.breakEnd);
        const workerNames = flatWorkerNames.join(', ');
        const driverNames = [draft.driver1EmployeeId, draft.driver2EmployeeId]
          .map((id) => printWorkerName(id))
          .filter(Boolean)
          .join(' / ');
        const workerBlockRows = !draft.splitMode
          ? draft.members
              .map((member, index) => {
                const text = formatNumberedScheduleWorkerNameForPrint(
                  index + 1,
                  empName(member.employeeId),
                  member.employeeId,
                  printTeamAssignments,
                );
                return text
                  ? {
                      kind: index === 0 ? ('leader' as const) : ('worker' as const),
                      text,
                    }
                  : null;
              })
              .filter((row): row is { kind: 'leader' | 'worker'; text: string } => Boolean(row))
          : draft.subTeams.flatMap((subTeam, subTeamIndex) => {
              const rows: Array<{ kind: 'subteam' | 'leader' | 'worker' | 'spacer'; text: string }> = [];
              if (subTeamIndex > 0) rows.push({ kind: 'spacer', text: '' });
              rows.push({ kind: 'subteam', text: subTeam.label });
              subTeam.members.forEach((member, index) => {
                const text = formatNumberedScheduleWorkerNameForPrint(
                  index + 1,
                  empName(member.employeeId),
                  member.employeeId,
                  printTeamAssignments,
                );
                if (!text) return;
                rows.push({
                  kind: index === 0 ? 'leader' : 'worker',
                  text,
                });
              });
              return rows;
            });
        return {
          label: draft.label,
          locationLabel:
            draft.locationType === 'SITE_JOB'
              ? 'Site job'
              : draft.locationType === 'FACTORY'
                ? 'Factory'
                : 'Other',
          siteName: String(job?.site ?? '').trim(),
          locationDisplay:
            draft.locationType === 'SITE_JOB'
              ? String(job?.site ?? '').trim() || 'Site'
              : draft.locationType === 'FACTORY'
                ? 'Factory'
                : 'Other',
          locationBadgeVariant:
            draft.locationType === 'SITE_JOB'
              ? 'site'
              : draft.locationType === 'FACTORY'
                ? 'factory'
                : 'other',
          jobNumber:
            draft.locationType === 'SITE_JOB'
              ? job?.jobNumber ?? draft.jobNumberSnapshot ?? ''
              : draft.factoryCode || draft.jobNumberSnapshot || '',
          customerName: job?.customerName ?? '',
          projectDetails: String(job?.projectDetails ?? '').trim(),
          projectType: String(job?.projectType ?? '').trim(),
          projectQtyArea: String(job?.projectQtyArea ?? '').trim(),
          workProcessDetails: workDetails,
          targetQty: draft.targetQty,
          teamLeaderName: flatWorkerNames[0] ?? '',
          driverNames,
          workerNames,
          workerDisplay: workerBlockRows.map((row) => row.text).filter(Boolean).join('\n'),
          workerRows: numberedFlatWorkerNames,
          workerStructuredRows: workerBlockRows.map((row) => row.text),
          workerBlocks: workerBlockRows,
          workerCount: getDraftWorkerCount(draft),
          dutyStart: dutyStartLabel,
          dutyEnd: dutyEndLabel,
          breakStart: breakStartLabel,
          breakEnd: breakEndLabel,
          dutyRange:
            dutyStartLabel && dutyEndLabel ? `${dutyStartLabel} - ${dutyEndLabel}` : '',
          breakRange:
            breakStartLabel && breakEndLabel ? `${breakStartLabel} - ${breakEndLabel}` : '',
          remarks: draft.remarks,
        };
      }),
      driverTrips: driverTripRows.map((row) => ({
        driverName: row.guestDriverName || (row.driverEmployeeId ? empName(row.driverEmployeeId) : ''),
        tripOrder: row.routeText,
      })),
      today: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    };
  };

  const openSchedulePrintOutput = async (intent: 'print' | 'download') => {
    const previewData = buildSchedulePreviewData();
    const companyId =
      session?.user?.activeCompanyId ??
      (schedule && typeof schedule === 'object' && 'companyId' in schedule
        ? String((schedule as { companyId?: string | null }).companyId ?? '')
        : '');
    if (!companyId) {
      toast.error('No active company found for schedule printing.');
      return;
    }
    const printJobId = `schedule-print-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload: WorkSchedulePrintPayload = {
      printJobId,
      previewData,
      companyId,
      workDate,
      savedAt: new Date().toISOString(),
    };

    const printWindow = window.open(`/hr-schedule-print?mode=${intent}&job=${encodeURIComponent(printJobId)}`, '_blank');
    if (!printWindow) {
      toast.error('Could not open print window');
      return;
    }

    try {
      localStorage.removeItem(WORK_SCHEDULE_PRINT_PAYLOAD_KEY);
      localStorage.setItem(WORK_SCHEDULE_PRINT_PAYLOAD_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota/storage failures; the broadcast channel below will carry the payload.
    }

    try {
      const channel = new BroadcastChannel(WORK_SCHEDULE_PRINT_CHANNEL);
      const message = {
        type: 'work-schedule-print-payload',
        payload,
      };
      channel.postMessage(message);
      const retry1 = window.setTimeout(() => channel.postMessage(message), 120);
      const retry2 = window.setTimeout(() => channel.postMessage(message), 320);
      window.setTimeout(() => {
        window.clearTimeout(retry1);
        window.clearTimeout(retry2);
        channel.close();
      }, 700);
    } catch {
      // Older environments can still rely on the localStorage payload.
    }
  };

  const openSignatureSheetPrint = () => {
    const group = signatureSheetGroup.trim();
    if (!group) {
      toast.error('Select a signature group');
      return;
    }
    const url = `/hr-attendance-signature-print?workDate=${encodeURIComponent(workDate)}&group=${encodeURIComponent(group)}&auto=1`;
    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      toast.error('Could not open print window');
      return;
    }
    setSignatureSheetModalOpen(false);
  };

  
  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <p className="text-sm text-muted-foreground">You do not have permission to view HR schedules.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="h-112 animate-pulse rounded-lg border border-border bg-muted/30" />
      </div>
    );
  }

  const renderCell = (d: AsgDraft, colIdx: number, fieldKey: string) => {
    const fieldDisabled = dis;

    switch (fieldKey) {
      case 'locationType': {
        const isFactory = d.locationType === 'FACTORY';
        const nextType = isFactory ? 'SITE_JOB' : 'FACTORY';
        const label = isFactory ? 'Factory' : 'Site';
        return (
          <button
            type="button"
            disabled={fieldDisabled}
            aria-label={`Location: ${label}. Click to switch to ${isFactory ? 'Site' : 'Factory'}.`}
            title={dis ? undefined : `Switch to ${isFactory ? 'Site' : 'Factory'}`}
            onClick={() => upd(colIdx, { locationType: nextType })}
            className={cn(
              'h-full w-full rounded border px-1.5 py-1 text-xs font-semibold transition-colors',
              isFactory
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-950 hover:bg-amber-500/30 dark:text-amber-50'
                : 'border-sky-600/40 bg-sky-500/15 text-sky-950 hover:bg-sky-500/25 dark:text-sky-100',
              fieldDisabled && 'cursor-not-allowed opacity-50',
            )}
            {...getGridNavProps(NAV_ROW.locationType, colIdx + 1)}
          >
            {label}
          </button>
        );
      }
      case 'job':
        return (
          <ScheduleSearchSelect
            value={d.jobId}
            onChange={(jid) => {
              void handleJobSelect(colIdx, jid);
            }}
            search={loadScheduleJobs}
            resolveById={resolveScheduleJobById}
            seedItems={scheduleJobSeedItems}
            placeholder="Job no, company, LPO, quotation, site…"
            disabled={fieldDisabled}
            minCharactersToSearch={0}
            passThroughArrowKeys
            inputProps={scheduleSearchInputProps(getGridNavProps(NAV_ROW.job, colIdx + 1))}
            renderItem={(item, isHighlighted) => (
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={cn('font-medium', isHighlighted ? 'text-primary' : 'text-foreground')}>
                    {item.label}
                  </div>
                  {item.status !== 'ACTIVE' ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {prettyJobStatus(item.status)}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {[item.companyName, item.siteName, item.quotationNumber && `QO ${item.quotationNumber}`, item.lpoNumber && `LPO ${item.lpoNumber}`]
                    .filter(Boolean)
                    .join(' | ') || 'No extra job details'}
                </div>
              </div>
            )}
          />
        );
      case 'jobCompany': {
        const job = getJob(d.jobId);
        const customerName = String(job?.customerName ?? '').trim();
        return (
          <div className="flex min-h-4 items-center px-1 py-0.5">
            <span className="truncate text-xs text-foreground/90" title={customerName || undefined}>
              {customerName || '—'}
            </span>
          </div>
        );
      }
      case 'siteName': {
        const job = getJob(d.jobId);
        const siteName = String(job?.site ?? '').trim();
        return (
          <div className="flex min-h-4 items-center px-1 py-0.5">
            <span className="truncate text-xs text-foreground/90" title={siteName || undefined}>
              {siteName || '—'}
            </span>
          </div>
        );
      }
      case 'workProcessDetails': {
        const workDetails = getJobWorkDetails(d.jobId);
        const canEditWorkDetails = canEditJob && !fieldDisabled && Boolean(d.jobId);
        if (!canEditWorkDetails) {
          return (
            <div className="flex min-h-14 items-start px-1 py-0.5">
              <span
                className="whitespace-pre-wrap text-xs text-foreground/90"
                title={workDetails || undefined}
              >
                {workDetails || '—'}
              </span>
            </div>
          );
        }
        const workDetailsNavProps = getGridNavProps(NAV_ROW.workProcess, colIdx + 1);
        return (
          <div className="space-y-0.5 px-1 py-0.5">
            <textarea
              value={workDetails}
              onChange={(e) => handleWorkDetailsChange(d.jobId, e.target.value)}
              rows={1}
              placeholder="Enter work details..."
              className={gridTextareaCls}
              {...workDetailsNavProps}
              onKeyDown={(e) => {
                handleWorkDetailsKeyDown(e);
                if (!e.defaultPrevented) {
                  workDetailsNavProps.onKeyDown(e);
                }
              }}
            />
          </div>
        );
      }
      case 'projectType':
      case 'projectQtyArea': {
        const job = getJob(d.jobId);
        const value =
          fieldKey === 'projectType'
            ? String(job?.projectType ?? '').trim()
            : String(job?.projectQtyArea ?? '').trim();
        return (
          <div className="flex min-h-4 items-center px-1 py-0.5">
            <span className="truncate text-xs text-foreground/90" title={value || undefined}>
              {value || '—'}
            </span>
          </div>
        );
      }
      case 'targetQty':
        return (
          <textarea
            value={d.targetQty}
            onChange={(e) => upd(colIdx, { targetQty: e.target.value })}
            disabled={fieldDisabled}
            rows={1}
            placeholder="Enter target qty..."
            className={gridTextareaCls}
            {...getGridNavProps(NAV_ROW.targetQty, colIdx + 1)}
          />
        );
      case 'driver1EmployeeId':
      case 'driver2EmployeeId': {
        const isMulti = multiAssigned.has(d[fieldKey]);
        return (
          <div className={isMulti ? 'rounded ring-2 ring-amber-400/60' : ''}>
            <SearchSelect
              items={driverItems}
              value={d[fieldKey]}
              onChange={(v) => upd(colIdx, { [fieldKey]: v } as Partial<AsgDraft>)}
              placeholder="Search driver..."
              disabled={fieldDisabled}
              minCharactersToSearch={1}
              passThroughArrowKeys
              inputProps={scheduleSearchInputProps(
                getGridNavProps(fieldKey === 'driver1EmployeeId' ? NAV_ROW.driver1 : NAV_ROW.driver2, colIdx + 1),
              )}
            />
          </div>
        );
      }
      case 'dutyRange':
        return (
          <div className="space-y-0.5 px-1 py-0.5">
            <div className="grid grid-cols-2 gap-1">
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Duty in</p>
                <TimeEntryInput
                  value={d.dutyStart}
                  onChange={(value) => upd(colIdx, { dutyStart: value })}
                  disabled={fieldDisabled}
                  className={gridFlatInputCls}
                  {...getGridNavProps(NAV_ROW.duty, colIdx + 1, 0)}
                />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Duty out</p>
                <TimeEntryInput
                  value={d.dutyEnd}
                  onChange={(value) => upd(colIdx, { dutyEnd: value })}
                  disabled={fieldDisabled}
                  className={gridFlatInputCls}
                  {...getGridNavProps(NAV_ROW.duty, colIdx + 1, 1)}
                />
              </div>
            </div>
          </div>
        );
      case 'breakRange':
        return (
          <div className="grid grid-cols-2 gap-0.5 px-1 py-0.5">
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Break out</p>
              <TimeEntryInput
                value={d.breakStart}
                onChange={(value) => upd(colIdx, { breakStart: value })}
                disabled={dis}
                className={gridFlatInputCls}
                {...getGridNavProps(NAV_ROW.break, colIdx + 1, 0)}
              />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Break in</p>
              <TimeEntryInput
                value={d.breakEnd}
                onChange={(value) => upd(colIdx, { breakEnd: value })}
                disabled={dis}
                className={gridFlatInputCls}
                {...getGridNavProps(NAV_ROW.break, colIdx + 1, 1)}
              />
            </div>
          </div>
        );
      case 'hourBreakRange': {
        const summary = formatScheduleHourBreakSummary(d);
        return (
          <div className="flex min-h-4 items-center px-1 py-0.5">
            <span className="text-xs text-foreground/90" title={summary === '—' ? undefined : summary}>
              {summary}
            </span>
          </div>
        );
      }
      case 'remarks':
        return (
          <textarea
            value={d.remarks}
            onChange={(e) => upd(colIdx, { remarks: e.target.value })}
            disabled={fieldDisabled}
            rows={2}
            className={gridTextareaCls}
            {...getGridNavProps(NAV_ROW.remarks, colIdx + 1)}
          />
        );
      default:
        return null;
    }
  };

  const renderWorkersCell = (draft: AsgDraft, colIdx: number) => {
    const blockCls = 'rounded border border-border bg-muted/30 p-1';
    const fieldDisabled = dis;

    return (
      <div className="min-w-0 space-y-1">
        {!dis && (
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => toggleSplitMode(colIdx)}>
              {draft.splitMode ? 'Use single team' : 'Split team'}
            </Button>
            {draft.splitMode ? (
              <Button type="button" variant="outline" size="sm" onClick={() => addSubTeam(colIdx)}>
                + Add sub-team
              </Button>
            ) : null}
          </div>
        )}

        {!draft.splitMode ? (
          <div className="space-y-1">
            {draft.members.map((member, memberIndex) => {
              const isMulti = member.employeeId ? multiAssigned.has(member.employeeId) : false;
              const workerNavSub = memberIndex;
              const dragTarget: WorkerDragTarget = { kind: 'flat', colIdx, memberIndex };
              const isDragging = isWorkerDragSource(dragTarget);
              return (
                <div
                  key={`flat-worker-${memberIndex}`}
                  data-schedule-drop="worker"
                  data-schedule-drag-preview=""
                  data-worker-kind="flat"
                  data-worker-col={colIdx}
                  data-worker-member={memberIndex}
                  className={cn(
                    'rounded transition-all duration-150 data-[schedule-drop-active=true]:scale-[1.01] data-[schedule-drop-active=true]:ring-2 data-[schedule-drop-active=true]:ring-primary/40',
                    isMulti && 'ring-2 ring-amber-400/60',
                    isDragging && 'bg-primary/5 ring-2 ring-primary/30'
                  )}
                >
                  <div className="flex items-center gap-1">
                    <ScheduleDragHandle
                      label="worker"
                      disabled={fieldDisabled}
                      onDragStart={() => startWorkerDrag(dragTarget)}
                      onDragEnd={endWorkerDrag}
                      onPointerDrop={resolveSchedulePointerDrop}
                    />
                    <div className="min-w-0 flex-1">
                      <SearchSelect
                        items={getSelectableWorkerItems(draft, { excludeFlatMemberIndex: memberIndex })}
                        value={member.employeeId}
                        onChange={(value) => updateFlatMember(colIdx, memberIndex, value)}
                        placeholder={memberIndex === 0 ? 'Team Leader' : ``}
                        disabled={fieldDisabled}
                        minCharactersToSearch={1}
                        searchFilter={searchEmployeePickerItems}
                        allowClearButton={false}
                        clearOnEmptyInput
                        dropdownInPortal
                        passThroughArrowKeys
                        renderItem={renderWorkerSearchItem}
                        emptyAction={buildWorkerEmptyAction({ kind: 'flat', colIdx, memberIndex })}
                        onAfterSelect={() => focusNextWorkerField(colIdx, workerNavSub)}
                        inputProps={getWorkerSearchInputProps(colIdx, workerNavSub)}
                      />
                    </div>
                    {!fieldDisabled && member.employeeId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFlatMember(colIdx, memberIndex)}
                        aria-label="Remove worker row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="h-7 w-7 shrink-0" aria-hidden />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {draft.subTeams.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Add a sub-team to start splitting this team.</p>
            )}
            {draft.subTeams.map((subTeam, subTeamIndex) => {
              const subTeamDragTarget: SubTeamDragTarget = { colIdx, subTeamIndex };
              const isSubTeamDragging = isSubTeamDragSource(subTeamDragTarget);
              return (
              <div
                key={subTeam.id}
                data-schedule-drop="subteam"
                data-schedule-drag-preview=""
                data-subteam-col={colIdx}
                data-subteam-index={subTeamIndex}
                className={cn(
                  blockCls,
                  'transition-all duration-150',
                  'data-[schedule-drop-active=true]:scale-[1.01] data-[schedule-drop-active=true]:ring-2 data-[schedule-drop-active=true]:ring-primary/40',
                  isSubTeamDragging && 'ring-2 ring-primary/30',
                )}
              >
                <div className="flex items-center gap-1">
                  <ScheduleDragHandle
                    label="sub-team"
                    disabled={fieldDisabled}
                    className={SUB_TEAM_DRAG_HANDLE_CLS}
                    onDragStart={() => startSubTeamDrag(subTeamDragTarget)}
                    onDragEnd={endSubTeamDrag}
                    onPointerDrop={resolveSchedulePointerDrop}
                  />
                  <input
                    value={subTeam.label}
                    onChange={(e) => updateSubTeamMeta(colIdx, subTeamIndex, { label: e.target.value })}
                    disabled={fieldDisabled}
                    className={cn(gridFlatInputCls, SUB_TEAM_LABEL_INPUT_CLS, 'min-w-0 flex-1')}
                    placeholder={nextSubTeamLabel(subTeamIndex)}
                  />
                  {!dis && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn('h-7 w-7 shrink-0', SUB_TEAM_DELETE_BTN_CLS)}
                      onClick={() => removeSubTeam(colIdx, subTeamIndex)}
                      aria-label="Remove sub-team"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {subTeam.members.map((member, memberIndex) => {
                    const isMulti = member.employeeId ? multiAssigned.has(member.employeeId) : false;
                    const workerNavSub = encodeWorkerNavSub(subTeamIndex, memberIndex);
                    const dragTarget: WorkerDragTarget = {
                      kind: 'subTeam',
                      colIdx,
                      subTeamIndex,
                      memberIndex,
                    };
                    const isDragging = isWorkerDragSource(dragTarget);
                    return (
                      <div
                        key={`${subTeam.id}-member-${memberIndex}`}
                        data-schedule-drop="worker"
                        data-schedule-drag-preview=""
                        data-worker-kind="subTeam"
                        data-worker-col={colIdx}
                        data-worker-sub-team={subTeamIndex}
                        data-worker-member={memberIndex}
                        className={cn(
                          'rounded transition-all duration-150 data-[schedule-drop-active=true]:scale-[1.01] data-[schedule-drop-active=true]:ring-2 data-[schedule-drop-active=true]:ring-primary/40',
                          isMulti && 'ring-2 ring-amber-400/60',
                          isDragging && 'bg-primary/5 ring-2 ring-primary/30'
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <ScheduleDragHandle
                            label="worker"
                            disabled={fieldDisabled}
                            onDragStart={() => startWorkerDrag(dragTarget)}
                            onDragEnd={endWorkerDrag}
                            onPointerDrop={resolveSchedulePointerDrop}
                          />
                          <div className="min-w-0 flex-1">
                            <SearchSelect
                              items={getSelectableWorkerItems(draft, {
                                excludeSubTeamIndex: subTeamIndex,
                                excludeSubTeamMemberIndex: memberIndex,
                              })}
                              value={member.employeeId}
                              onChange={(value) => updateSubTeamMember(colIdx, subTeamIndex, memberIndex, value)}
                              placeholder={memberIndex === 0 ? 'Team Leader' : ``}
                              disabled={fieldDisabled}
                              minCharactersToSearch={1}
                              searchFilter={searchEmployeePickerItems}
                              allowClearButton={false}
                              clearOnEmptyInput
                              dropdownInPortal
                              passThroughArrowKeys
                              renderItem={renderWorkerSearchItem}
                              emptyAction={buildWorkerEmptyAction({
                                kind: 'subTeam',
                                colIdx,
                                subTeamIndex,
                                memberIndex,
                              })}
                              onAfterSelect={() => focusNextWorkerField(colIdx, workerNavSub)}
                              inputProps={getWorkerSearchInputProps(colIdx, workerNavSub)}
                            />
                          </div>
                          {!fieldDisabled && member.employeeId ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSubTeamMember(colIdx, subTeamIndex, memberIndex)}
                              aria-label="Remove worker row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="h-7 w-7 shrink-0" aria-hidden />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderScheduleTableRow = (rowKey: string) => {
      const theme = getRowThemeClasses(rowKey);
      const label = SCHEDULE_TABLE_ROW_LABELS[rowKey] ?? rowKey;

      if (rowKey === 'workers') {
        return (
          <tr key={rowKey} className={theme.row}>
            {showRowLabels ? <th className={theme.label}>{label}</th> : null}
            {drafts.map((d, ci) => (
              <td key={ci} className={plannerCellCls(rowKey)}>
                <div className='relative min-h-14 min-w-0'>{renderWorkersCell(d, ci)}</div>
              </td>
            ))}
          </tr>
        );
      }

      if (rowKey === 'workerCount') {
        return (
          <tr key={rowKey} className={theme.row}>
            {showRowLabels ? <th className={theme.label}>{label}</th> : null}
            {drafts.map((d, ci) => (
              <td key={ci} className={plannerCellCls(rowKey)}>
                <div className='inline-flex min-w-12 items-center justify-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground'>
                  {getDraftWorkerCount(d)}
                </div>
              </td>
            ))}
          </tr>
        );
      }

      if (rowKey === 'suggestedWorkers') {
        return (
          <tr key={rowKey} className={theme.row}>
            {showRowLabels ? <th className={theme.label}>{label}</th> : null}
            {drafts.map((d, ci) => {
              const job = getJob(d.jobId);
              const required = parseJobExpertise(job);
              const suggestions = suggestedWorkersByColumn.get(ci) ?? [];
              return (
                <td key={ci} className={plannerCellCls(rowKey)}>
                  {required.length === 0 ? (
                    <p className='text-[11px] text-muted-foreground'>No job expertise configured yet.</p>
                  ) : suggestions.length === 0 ? (
                    <p className='text-[11px] text-muted-foreground'>No matching workers available.</p>
                  ) : (
                    <div className='flex flex-wrap gap-1'>
                      {suggestions.slice(0, 8).map((w) => (
                        <button
                          key={w.id}
                          type='button'
                          disabled={dis}
                          onClick={() => addWorkerToTeam(ci, w.id)}
                          className='rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-300'
                          title={w.workforce.expertises.join(', ')}
                        >
                          {w.preferredName || w.fullName}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        );
      }

      return (
        <tr key={rowKey} className={theme.row}>
          {showRowLabels ? <th className={theme.label}>{label}</th> : null}
          {drafts.map((d, ci) => (
            <td key={ci} className={plannerCellCls(rowKey)}>
              <div className='min-w-0'>{renderCell(d, ci, rowKey)}</div>
            </td>
          ))}
        </tr>
      );
  };

  return (
		<div className='flex w-full min-w-0 flex-col gap-3'>
			<header className='flex w-full min-w-0 flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-start lg:justify-between'>
				<div className='min-w-0 space-y-0.5'>
					<p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
						HR planning
					</p>
					<h1 className='text-lg font-semibold tracking-tight text-foreground'>
						Day schedule · {workDateLabel}
					</h1>
					{schedule ? (
						<p className='text-xs text-muted-foreground'>
							{scheduleSummary.groups} teams ·{' '}
							{scheduleSummary.workers} workers ·{' '}
							{scheduleSummary.groupsWithTiming} with timing
						</p>
					) : null}
				</div>
				<div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
					{autoSaveStatus === 'saving' || saving ? (
						<span className='text-xs text-muted-foreground'>
							Saving…
						</span>
					) : autoSaveStatus === 'saved' ? (
						<span className='text-xs text-emerald-600 dark:text-emerald-400'>
							All saved
						</span>
					) : autoSaveStatus === 'error' ? (
						<span className='text-xs text-destructive'>
							Save failed
						</span>
					) : null}
					{schedule ? (
						<span
							className={cn(
								'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
								scheduleStatusTag.className,
							)}
						>
							{scheduleStatusTag.label}
						</span>
					) : null}
					{/* {schedule ? (
						<Badge variant='outline' className='tabular-nums'>
							{drafts.length} teams
						</Badge>
					) : null} */}
					{showTemplateOption ? (
						<>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={openTemplateModal}
								disabled={recentTemplateSchedules.length === 0}
							>
								<LayoutTemplate className='size-4' />
								Template
							</Button>
							<Separator
								orientation='vertical'
								className='hidden h-6 sm:block'
							/>
						</>
					) : null}
					{schedule && (canEdit || canEditJob) && !locked ? (
						<>
							<Button
								type='button'
								size='sm'
								variant='secondary'
								onClick={() =>
									requestPublishedEdit(() => void saveAssignments())
								}
								disabled={saving}
							>
								{saving ? 'Saving…' : 'Save now'}
							</Button>
						</>
					) : null}
					{schedule && canPub && status === 'DRAFT' ? (
						<Button
							type='button'
							size='sm'
							onClick={publish}
							disabled={publishing}
						>
							{publishing ? 'Publishing…' : 'Publish'}
						</Button>
					) : null}
				</div>
			</header>

			{!schedule && canEdit ? (
				<Alert>
					<AlertDescription>
						No schedule for this date. Create a draft to start
						planning teams and assignments.
					</AlertDescription>
				</Alert>
			) : null}
			{!schedule && canEdit ? (
				<Button type='button' size='sm' onClick={createSchedule}>
					Create schedule draft
				</Button>
			) : null}

			{schedule ? (
				<>
					{publishedEditGuarded ? (
						<Alert className='flex gap-3 border-amber-500/40 bg-amber-500/10'>
							<AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300' />
							<AlertDescription className='text-amber-950 dark:text-amber-100'>
								This schedule is published. Changes may affect
								attendance and other downstream records. Choose
								to continue only if you intend to edit it.
								<Button
									type='button'
									size='sm'
									variant='outline'
									className='mt-2 border-amber-600/40 bg-background/80'
									onClick={() => setPublishedEditWarningOpen(true)}
								>
									Continue edit anyway
								</Button>
							</AlertDescription>
						</Alert>
					) : null}
					<div
						className={cn(
							'grid min-h-0 gap-3',
							showWorkerRail
								? 'xl:grid-cols-[1fr_12rem] xl:items-stretch'
								: 'grid-cols-1',
						)}
					>
						<section className='flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm'>
							<div
								className='flex flex-col gap-2 border-b border-border px-3 py-2 lg:flex-row lg:items-center lg:justify-between'
								data-published-edit-exempt
							>
								<div className='flex flex-wrap items-center gap-2'>
									<TooltipProvider delayDuration={400}>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type='button'
													variant='outline'
													size='icon'
													className='h-8 w-8'
													onClick={() =>
														setRowSettingsOpen(true)
													}
													aria-label='Row settings'
												>
													<Settings2 className='h-4 w-4' />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												Choose which rows to show and
												their order
											</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type='button'
													variant='outline'
													size='icon'
													className='h-8 w-8'
													onClick={() =>
														void openSchedulePrintOutput(
															'print',
														)
													}
													aria-label='Print schedule'
												>
													<Printer className='h-4 w-4' />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												Print schedule
											</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type='button'
													variant='outline'
													size='icon'
													className='h-8 w-8'
													onClick={() => setSignatureSheetModalOpen(true)}
													aria-label='Print signature sheet'
												>
													<ClipboardList className='h-4 w-4' />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												Signature sheet
											</TooltipContent>
										</Tooltip>
										<Separator
											orientation='vertical'
											className='hidden h-6 sm:block'
										/>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type='button'
													variant={
														showWorkerRail
															? 'secondary'
															: 'outline'
													}
													size='icon'
													className='h-8 w-8'
													onClick={() =>
														setShowWorkerRail(
															(c) => !c,
														)
													}
													aria-label={
														showWorkerRail
															? 'Hide worker pool'
															: 'Show worker pool'
													}
												>
													<SlashedIcon
														icon={Users}
														slashed={
															!showWorkerRail
														}
													/>
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												{showWorkerRail
													? 'Hide worker pool'
													: 'Show worker pool'}
											</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type='button'
													variant={
														showRowLabels
															? 'secondary'
															: 'outline'
													}
													size='icon'
													className='h-8 w-8'
													onClick={() =>
														setShowRowLabels(
															(c) => !c,
														)
													}
													aria-label={
														showRowLabels
															? 'Hide row labels'
															: 'Show row labels'
													}
												>
													<SlashedIcon
														icon={Tag}
														slashed={!showRowLabels}
													/>
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												{showRowLabels
													? 'Hide row labels'
													: 'Show row labels'}
											</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type='button'
													variant={
														useLightGridTheme
															? 'outline'
															: 'secondary'
													}
													size='icon'
													className='h-8 w-8'
													onClick={() =>
														setUseLightGridTheme(
															(c) => !c,
														)
													}
													aria-label={
														useLightGridTheme
															? 'Switch to color-coded rows'
															: 'Switch to plain rows'
													}
												>
													<Palette className='h-4 w-4' />
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												{useLightGridTheme
													? 'Switch to color-coded rows'
													: 'Switch to plain rows'}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<Separator
										orientation='vertical'
										className='hidden h-6 sm:block'
									/>
									{(canEdit || canEditJob) && !locked ? (
										<>
											<Button
												type='button'
												variant='outline'
												size='icon'
												className='h-8 w-8'
												onClick={undo}
												disabled={!canUndo}
												title='Undo'
												aria-label='Undo'
											>
												<Undo2 className='h-4 w-4' />
											</Button>
											<Button
												type='button'
												variant='outline'
												size='icon'
												className='h-8 w-8'
												onClick={redo}
												disabled={!canRedo}
												title='Redo'
												aria-label='Redo'
											>
												<Redo2 className='h-4 w-4' />
											</Button>
										</>
									) : null}
									<Button
										type='button'
										variant='ghost'
										size='sm'
										disabled={!canZoomOut}
										onClick={() =>
											setViewScale((s) =>
												Math.max(
													0.8,
													Math.round(
														(s - 0.05) * 100,
													) / 100,
												),
											)
										}
									>
										−
									</Button>
									<span className='text-xs tabular-nums text-muted-foreground'>
										{Math.round(viewScale * 100)}%
									</span>
									<Button
										type='button'
										variant='ghost'
										size='sm'
										disabled={!canZoomIn}
										onClick={() =>
											setViewScale((s) =>
												Math.min(
													1.35,
													Math.round(
														(s + 0.05) * 100,
													) / 100,
												),
											)
										}
									>
										+
									</Button>
								</div>
								<div className='min-w-0 space-y-0.5 space-x-1.5'>
									{/* <h2 className='text-base font-semibold text-foreground'>
										Team board
									</h2>
									<p className='text-xs text-muted-foreground'>
										{drafts.length} team
										{drafts.length === 1 ? '' : 's'} —
										scroll horizontally to view all columns
									</p> */}
									{otherScheduleEditors.length > 0 ? (
										<span className='inline-flex max-w-full flex-wrap items-center gap-1.5'>
											<span className='text-xs text-muted-foreground'>
												Editing:
											</span>
											{otherScheduleEditors.map(
												(editor) => (
													<span
														key={editor.sessionId}
														className='inline-flex max-w-[10rem] truncate rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-950 dark:text-violet-100'
														title={
															editor.displayName
														}
													>
														{editor.displayName}
													</span>
												),
											)}
										</span>
									) : null}
									{canEdit && !dis ? (
										<Button
											type='button'
											size='sm'
											onClick={addColumn}
										>
											<UserPlus className='h-3.5 w-3.5' />
										</Button>
									) : publishedEditGuarded && canEdit ? (
										<Button
											type='button'
											size='sm'
											variant='outline'
											onClick={() => setPublishedEditWarningOpen(true)}
										>
											<UserPlus className='h-3.5 w-3.5' />
										</Button>
									) : null}
								</div>
							</div>

							<div
								ref={teamBoardScrollRef}
								className='isolate overflow-x-auto'
								style={{ zoom: viewScale } as CSSProperties}
								onPointerDownCapture={handlePublishedEditAttempt}
							>
								<table
									className={`border-collapse text-xs ${drafts.length <= 0 ? 'min-w-full' : 'w-max'}`}
								>
									<thead className='border-b border-border bg-muted'>
										<tr>
											{showRowLabels ? (
												<th
													scope='col'
													className={cn(
														STICKY_ROW_LABEL_CLASS,
														'sticky top-0 z-30 align-middle bg-muted!',
													)}
												>
													Team
												</th>
											) : null}
											{drafts.map((d, ci) => (
												<th
													key={`team-header-${ci}-${d.columnIndex}`}
													data-team-column={ci}
													data-schedule-drop='team-column'
													data-team-col={ci}
													scope='col'
													className={cn(
														teamHeaderCls(),
														'data-[schedule-drop-active=true]:scale-[1.01] data-[schedule-drop-active=true]:ring-2 data-[schedule-drop-active=true]:ring-primary/40 transition-all duration-150',
														draggingTeamColumn ===
															ci &&
															'ring-2 ring-primary/30',
													)}
												>
													<div
														className='flex items-center justify-between gap-2'
														data-schedule-drag-preview=''
													>
														<div className='flex min-w-0 items-center gap-1'>
															{canEdit && !dis ? (
																<>
																	<ScheduleDragHandle
																		label='team column'
																		onDragStart={() =>
																			startTeamColumnDrag(
																				ci,
																			)
																		}
																		onDragEnd={
																			endTeamColumnDrag
																		}
																		onPointerDrop={
																			resolveSchedulePointerDrop
																		}
																	/>
																	<Button
																		type='button'
																		variant='ghost'
																		size='icon'
																		className='h-7 w-7'
																		disabled={
																			ci ===
																			0
																		}
																		onClick={() =>
																			moveTeamColumn(
																				ci,
																				-1,
																			)
																		}
																		title='Move team left'
																		aria-label='Move team left'
																	>
																		<ChevronLeft className='h-4 w-4' />
																	</Button>
																	<Button
																		type='button'
																		variant='ghost'
																		size='icon'
																		className='h-7 w-7'
																		disabled={
																			ci ===
																			drafts.length -
																				1
																		}
																		onClick={() =>
																			moveTeamColumn(
																				ci,
																				1,
																			)
																		}
																		title='Move team right'
																		aria-label='Move team right'
																	>
																		<ChevronRight className='h-4 w-4' />
																	</Button>
																</>
															) : null}
															<Badge
																variant='secondary'
																className='shrink-0'
															>
																Team{' '}
																{d.columnIndex}
															</Badge>
														</div>
														{canEdit && !dis ? (
															<div className='flex shrink-0 items-center gap-0.5'>
																<Button
																	type='button'
																	variant='ghost'
																	size='icon'
																	className='h-7 w-7'
																	onClick={() =>
																		duplicateColumn(
																			ci,
																		)
																	}
																	title='Copy team'
																	aria-label='Copy team'
																>
																	<Copy className='h-3.5 w-3.5' />
																</Button>
																<Button
																	type='button'
																	variant='ghost'
																	size='icon'
																	className='h-7 w-7 text-destructive hover:text-destructive'
																	onClick={() =>
																		removeColumn(
																			ci,
																		)
																	}
																	title='Remove team'
																	aria-label='Remove team'
																>
																	<Trash2 className='h-3.5 w-3.5' />
																</Button>
															</div>
														) : null}
													</div>
												</th>
											))}
										</tr>
									</thead>
									<tbody className='divide-y divide-border'>
										{drafts.length === 0 ? (
											<tr>
												<td
													colSpan={
														showRowLabels ? 1 : 1
													}
													className='px-4 py-8 text-center text-xs text-muted-foreground'
												>
													<p className='text-sm font-semibold text-foreground'>
														No teams on the board
														yet
													</p>
													<p className='mt-1 text-sm text-muted-foreground'>
														Add a team column or load
														a recent schedule as a
														starting point.
													</p>
													{canEdit && !dis ? (
														<div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
															<Button
																type='button'
																size='sm'
																onClick={addColumn}
															>
																<UserPlus className='mr-1.5 h-3.5 w-3.5' />
																Add first team
															</Button>
															{showTemplateOption &&
															recentTemplateSchedules.length >
																0 ? (
																<Button
																	type='button'
																	size='sm'
																	variant='outline'
																	onClick={
																		openTemplateModal
																	}
																>
																	<LayoutTemplate className='mr-1.5 h-3.5 w-3.5' />
																	Load template
																</Button>
															) : null}
														</div>
													) : null}
												</td>
											</tr>
										) : (
											<>
												{visibleScheduleRowKeys.map(
													(rowKey) =>
														renderScheduleTableRow(
															rowKey,
														),
												)}
											</>
										)}
									</tbody>
								</table>
							</div>
						</section>

						{showWorkerRail ? (
							<Card
								className='flex max-h-[calc(100vh-1rem)] flex-col overflow-hidden xl:sticky xl:top-2 xl:self-start'
								onPointerDownCapture={handlePublishedEditAttempt}
							>
								<CardHeader className='shrink-0 space-y-0.5 px-3 py-2 pb-1'>
									<CardTitle className='text-sm'>
										Worker pool
									</CardTitle>
									<CardDescription>
										{`${unassignedWorkers.length} unassigned${workerPool.length > 0 ? ` of ${workerPool.length} workers` : ''}`}
									</CardDescription>
								</CardHeader>
								<CardContent className='flex min-h-0 flex-1 flex-col overflow-hidden p-0 pt-0'>
									<div className='min-h-0 flex-1 overflow-y-auto px-3 pb-2'>
										<div className='flex flex-col gap-1'>
											{workerPool.length === 0 ? (
												<p className='text-xs text-muted-foreground'>
													No active workers loaded.
												</p>
											) : unassignedWorkers.length ===
											  0 ? (
												<p className='text-xs text-muted-foreground'>
													All workers are assigned to
													teams.
												</p>
											) : (
												unassignedWorkers.map((e) => (
													<ScheduleWorkerPoolCard
														key={e.id}
														employee={e}
													/>
												))
											)}
										</div>
									</div>

									{multiAssigned.size > 0 ? (
										<div className='shrink-0 border-t border-border bg-muted/30 px-3 py-2'>
											<p className='text-xs font-medium text-amber-800 dark:text-amber-200'>
												Multi-assigned
											</p>
											<div className='mt-1 flex flex-wrap gap-1'>
												{[...multiAssigned].map(
													(id) => (
														<Badge
															key={id}
															variant='outline'
															className='border-amber-500/40 text-amber-900 dark:text-amber-100'
														>
															{empName(id)} ×
															{empAssignCount.get(
																id,
															)}
														</Badge>
													),
												)}
											</div>
										</div>
									) : null}
								</CardContent>
							</Card>
						) : null}
					</div>

					<section className='w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm'>
						<div className='border-b border-border px-3 py-2'>
							<h2 className='text-base font-semibold text-foreground'>
								Schedule notes
							</h2>
							<p className='mt-0.5 text-xs text-muted-foreground'>
								Shared note for the whole day (separate from
								team remarks).
							</p>
						</div>
						<div className='px-3 py-2'>
							<textarea
								value={scheduleInfo}
								onChange={(e) =>
									setScheduleInfo(e.target.value)
								}
								disabled={dis}
								rows={2}
								placeholder='General notes for this schedule…'
								className={cn(
									SCHEDULE_GRID_FLAT_INPUT,
									'min-h-16 w-full resize-y py-1',
								)}
							/>
						</div>
					</section>

					<section className='relative z-0 w-full overflow-visible rounded-lg border border-border bg-card shadow-sm'>
						<div className='flex flex-col gap-2 border-b border-border px-3 py-2 lg:flex-row lg:items-end lg:justify-between'>
							<div className='min-w-0 space-y-0.5'>
								<h2 className='text-base font-semibold text-foreground'>
									Driver trips
								</h2>
								<p className='text-xs text-muted-foreground'>
									All active drivers are listed below. Add
									route notes, extra drivers, or guest drivers
									(rental / hire).
								</p>
							</div>
							<div className='flex w-full flex-col gap-2 lg:w-auto lg:min-w-88'>
								<div className='relative z-20 flex flex-col gap-2 sm:flex-row sm:items-center'>
									<SearchSelect
										items={availableDriverItems}
										value={selectedDriverToAdd}
										onChange={(value) => {
											setSelectedDriverToAdd(value);
											addDriverTripRow(value);
										}}
										placeholder={
											availableDriverItems.length > 0
												? 'Add another driver…'
												: 'All active drivers are on the list'
										}
										disabled={
											dis ||
											availableDriverItems.length === 0
										}
										minCharactersToSearch={0}
										openOnFocus
										dropdownInPortal
										inputProps={{
											className: SCHEDULE_GRID_FLAT_INPUT,
										}}
									/>
									<Button
										type='button'
										variant='outline'
										size='sm'
										className='shrink-0'
										onClick={() =>
											addDriverTripRow(
												selectedDriverToAdd,
											)
										}
										disabled={dis || !selectedDriverToAdd}
									>
										Add driver
									</Button>
								</div>
								<div className='relative z-20 flex flex-col gap-2 sm:flex-row sm:items-center'>
									<Input
										value={guestDriverNameInput}
										onChange={(e) =>
											setGuestDriverNameInput(
												e.target.value,
											)
										}
										disabled={dis}
										placeholder='Guest driver name (rental / hire)'
										className={SCHEDULE_GRID_FLAT_INPUT}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												addGuestDriverTripRow(
													guestDriverNameInput,
												);
											}
										}}
									/>
									<Button
										type='button'
										variant='secondary'
										size='sm'
										className='shrink-0'
										onClick={() =>
											addGuestDriverTripRow(
												guestDriverNameInput,
											)
										}
										disabled={
											dis || !guestDriverNameInput.trim()
										}
									>
										Add guest driver
									</Button>
								</div>
							</div>
						</div>
						<div className='overflow-x-auto'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Driver</TableHead>
										<TableHead>Route / order</TableHead>
										<TableHead className='text-right'>
											Action
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{driverTripRows.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={3}
												className='py-4 text-center text-xs text-muted-foreground'
											>
												{driverPool.length === 0
													? 'No active drivers loaded.'
													: 'Loading driver list…'}
											</TableCell>
										</TableRow>
									) : (
										driverTripRows.map((log, index) => {
											const isGuest = Boolean(
												log.guestDriverName,
											);
											return (
												<TableRow
													key={`${log.rowKey}-${index}`}
												>
													<TableCell className='font-medium'>
														{isGuest ? (
															<div className='space-y-1'>
																<Badge
																	variant='outline'
																	className='text-[10px]'
																>
																	Guest
																</Badge>
																<Input
																	value={
																		log.guestDriverName ??
																		''
																	}
																	onChange={(
																		e,
																	) =>
																		updateGuestDriverName(
																			log.rowKey,
																			e
																				.target
																				.value,
																		)
																	}
																	disabled={
																		dis
																	}
																	placeholder='Guest driver name'
																	className={
																		SCHEDULE_GRID_FLAT_INPUT
																	}
																/>
															</div>
														) : (
															empName(
																log.driverEmployeeId ??
																	'',
															) || 'Driver'
														)}
													</TableCell>
													<TableCell>
														<Input
															className='min-w-2xl'
															value={
																log.routeText
															}
															onChange={(e) =>
																setDriverTripState(
																	(
																		current,
																	) => ({
																		version:
																			driverLogVersion,
																		values: {
																			...(current.version ===
																			driverLogVersion
																				? current.values
																				: {}),
																			[log.rowKey]:
																				e
																					.target
																					.value,
																		},
																		guestNames:
																			current.version ===
																			driverLogVersion
																				? current.guestNames
																				: {},
																		selectedIds:
																			current.version ===
																			driverLogVersion
																				? current.selectedIds
																				: driverTripRows.map(
																						(
																							row,
																						) =>
																							row.rowKey,
																					),
																	}),
																)
															}
															disabled={dis}
															placeholder='Trip order / route'
														/>
													</TableCell>
													<TableCell className='text-right'>
														<Button
															type='button'
															variant='ghost'
															size='sm'
															onClick={() =>
																removeDriverTripRow(
																	log.rowKey,
																)
															}
															disabled={dis}
															className='text-destructive hover:text-destructive'
														>
															Remove
														</Button>
													</TableCell>
												</TableRow>
											);
										})
									)}
								</TableBody>
							</Table>
						</div>
					</section>
				</>
			) : null}

			<Modal
				isOpen={rowSettingsOpen}
				onClose={() => setRowSettingsOpen(false)}
				title='Schedule row settings'
				description='Check rows to show them on the team board. Use arrows to reorder. Saved to your account for this company.'
				size='sm'
				actions={
					<>
						<Button
							type='button'
							variant='outline'
							onClick={resetScheduleRowSettings}
						>
							Reset defaults
						</Button>
						<Button
							type='button'
							onClick={() => setRowSettingsOpen(false)}
						>
							Done
						</Button>
					</>
				}
			>
				<div className='max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto pr-1'>
					{rowSettings.order.map((rowKey, index) => {
						const visible = !rowSettings.hidden.includes(rowKey);
						return (
							<div
								key={rowKey}
								className={cn(
									'flex items-center gap-1 rounded-md border border-border px-1.5 py-1',
									!visible && 'bg-muted/40',
								)}
							>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='h-7 w-7 shrink-0'
									disabled={index === 0}
									onClick={() =>
										moveScheduleRowSetting(index, -1)
									}
									aria-label={`Move ${SCHEDULE_TABLE_ROW_LABELS[rowKey]} up`}
								>
									<ChevronUp className='h-4 w-4' />
								</Button>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='h-7 w-7 shrink-0'
									disabled={
										index === rowSettings.order.length - 1
									}
									onClick={() =>
										moveScheduleRowSetting(index, 1)
									}
									aria-label={`Move ${SCHEDULE_TABLE_ROW_LABELS[rowKey]} down`}
								>
									<ChevronDown className='h-4 w-4' />
								</Button>
								<label className='flex min-w-0 flex-1 cursor-pointer items-center gap-2'>
									<input
										type='checkbox'
										checked={visible}
										onChange={() =>
											toggleScheduleRowVisibility(rowKey)
										}
										className='h-4 w-4 shrink-0 rounded border-border'
									/>
									<span
										className={cn(
											'truncate text-sm text-foreground',
											!visible && 'text-muted-foreground',
										)}
									>
										{SCHEDULE_TABLE_ROW_LABELS[rowKey] ??
											rowKey}
									</span>
								</label>
							</div>
						);
					})}
				</div>
			</Modal>

			<CreateEmployeeModal
				isOpen={Boolean(pendingWorkerCreate)}
				onClose={() => setPendingWorkerCreate(null)}
				initialFullName={pendingWorkerCreate?.suggestedName ?? ''}
				defaultEmployeeType='LABOUR_WORKER'
				onCreated={handleWorkerEmployeeCreated}
			/>

			<Modal
				isOpen={Boolean(pendingInactiveJob)}
				onClose={() => setPendingInactiveJob(null)}
				title='Job is not active'
				description='This job must be active before it can be used on the schedule.'
				size='sm'
				actions={
					<>
						<Button
							type='button'
							variant='outline'
							onClick={() => setPendingInactiveJob(null)}
							disabled={activatingJob}
						>
							Cancel
						</Button>
						<Button
							type='button'
							onClick={() => void handleActivatePendingJob()}
							disabled={activatingJob || !canEditJob}
						>
							{activatingJob ? 'Activating…' : 'Activate job'}
						</Button>
					</>
				}
			>
				{pendingInactiveJob ? (
					<div className='space-y-2 text-sm text-muted-foreground'>
						<p>
							<span className='font-medium text-foreground'>
								{pendingInactiveJob.jobNumber}
							</span>{' '}
							is currently{' '}
							<span className='font-medium text-foreground'>
								{prettyJobStatus(pendingInactiveJob.status)}
							</span>
							.
						</p>
						<p>
							Activate this job to assign it to the team, or
							cancel to keep the current selection.
						</p>
						{!canEditJob ? (
							<p className='text-destructive'>
								You do not have permission to activate jobs. Ask
								someone with job edit access.
							</p>
						) : null}
					</div>
				) : null}
			</Modal>

			<Modal
				isOpen={Boolean(pendingStaleJob)}
				onClose={handleDismissStaleJob}
				title='Job changed outside schedule'
				description='This team still has a job that is no longer active.'
				size='sm'
				actions={
					<>
						<Button
							type='button'
							variant='outline'
							onClick={handleDismissStaleJob}
							disabled={activatingJob}
						>
							Keep for now
						</Button>
						{pendingStaleJob?.status === 'ON_HOLD' && canEditJob ? (
							<Button
								type='button'
								variant='secondary'
								onClick={() => void handleActivateStaleJob()}
								disabled={activatingJob}
							>
								{activatingJob ? 'Activating…' : 'Activate job'}
							</Button>
						) : null}
						<Button
							type='button'
							variant='destructive'
							onClick={handleClearStaleJob}
							disabled={activatingJob}
						>
							Clear from team
						</Button>
					</>
				}
			>
				{pendingStaleJob ? (
					<div className='space-y-2 text-sm text-muted-foreground'>
						<p>
							<span className='font-medium text-foreground'>
								{pendingStaleJob.jobNumber}
							</span>{' '}
							was marked{' '}
							<span className='font-medium text-foreground'>
								{prettyJobStatus(pendingStaleJob.status)}
							</span>{' '}
							elsewhere (for example Jobs quick edit).
						</p>
						<p>
							Clear it from this team or re-activate the job
							before continuing.
						</p>
					</div>
				) : null}
			</Modal>

			<Modal
				isOpen={publishedEditWarningOpen}
				onClose={() => setPublishedEditWarningOpen(false)}
				title='Edit published schedule?'
				description='This schedule is already published. Editing it may change attendance, driver logs, and other records that depend on the published plan.'
				size='sm'
				actions={
					<>
						<Button
							type='button'
							variant='outline'
							onClick={() => setPublishedEditWarningOpen(false)}
						>
							Cancel
						</Button>
						<Button type='button' onClick={confirmPublishedEdit}>
							Continue edit anyway
						</Button>
					</>
				}
			>
				<p className='text-sm text-muted-foreground'>
					You can still view and print the schedule without editing. Only
					continue if you need to make changes to this published day.
				</p>
			</Modal>

			<Modal
				isOpen={templateModalOpen}
				onClose={() => setTemplateModalOpen(false)}
				title='Load schedule template'
				description='Copy teams and assignments from a recent schedule day into this draft.'
				size='sm'
				actions={
					<>
						<Button
							type='button'
							variant='outline'
							onClick={() => setTemplateModalOpen(false)}
							disabled={applyingTemplate}
						>
							Cancel
						</Button>
						<Button
							type='button'
							onClick={() => void applyPreviousScheduleTemplate()}
							disabled={!selectedTemplateDate || applyingTemplate}
						>
							{applyingTemplate ? 'Applying…' : 'Apply template'}
						</Button>
					</>
				}
			>
				<div className='space-y-2'>
					<label
						htmlFor='schedule-template-date'
						className='text-sm font-medium text-foreground'
					>
						Template date
					</label>
					{recentTemplateSchedules.length === 0 ? (
						<p className='text-sm text-muted-foreground'>
							No other schedule days are available yet.
						</p>
					) : (
						<select
							id='schedule-template-date'
							value={selectedTemplateDate}
							onChange={(e) => setSelectedTemplateDate(e.target.value)}
							className={cn(SCHEDULE_GRID_FLAT_INPUT, 'h-9 w-full')}
						>
							{recentTemplateSchedules.map((item) => (
								<option key={item.id} value={item.workDate}>
									{item.workDate}
									{item.status ? ` (${item.status.toLowerCase()})` : ''}
								</option>
							))}
						</select>
					)}
					<p className='text-xs text-muted-foreground'>
						Showing the 5 most recent schedule dates (excluding today).
					</p>
				</div>
			</Modal>

			<Modal
				isOpen={signatureSheetModalOpen}
				onClose={() => setSignatureSheetModalOpen(false)}
				title='Print signature sheet'
				description={`Attendance signature list for ${workDate}. Only active employees in the selected group are included.`}
				size='sm'
				actions={
					<>
						<Button type='button' variant='outline' onClick={() => setSignatureSheetModalOpen(false)}>
							Cancel
						</Button>
						<Button type='button' onClick={openSignatureSheetPrint} disabled={!signatureSheetGroup.trim()}>
							Print
						</Button>
					</>
				}
			>
				<label className='block space-y-1.5'>
					<span className='text-sm font-medium text-foreground'>Signature group</span>
					<EmployeeMetaSelect
						kind='SIGNATURE_GROUP'
						name='signatureSheetGroup'
						value={signatureSheetGroup}
						onValueChange={setSignatureSheetGroup}
						fieldClass='h-9 w-full rounded-md border border-border bg-background px-3 text-sm'
						emptyLabel='Select group…'
					/>
				</label>
			</Modal>

			<Modal
				isOpen={Boolean(publishBlockMessages?.length)}
				onClose={() => setPublishBlockMessages(null)}
				title='Cannot publish schedule'
				description='Fix the issues below before publishing. Saving and auto-save are not affected.'
				size='sm'
				actions={
					<Button
						type='button'
						onClick={() => setPublishBlockMessages(null)}
					>
						OK
					</Button>
				}
			>
				{publishBlockMessages ? (
					<ul className='list-disc space-y-1.5 pl-5 text-sm text-muted-foreground'>
						{publishBlockMessages.map((message) => (
							<li key={message}>{message}</li>
						))}
					</ul>
				) : null}
			</Modal>

			<Modal
				isOpen={Boolean(publishLowHourTeams?.length)}
				onClose={() => setPublishLowHourTeams(null)}
				title='Short work hours'
				description='Some teams have 5 hours or less of net duty time. Do you want to publish anyway?'
				size='sm'
				actions={
					<>
						<Button
							type='button'
							variant='outline'
							onClick={() => setPublishLowHourTeams(null)}
							disabled={publishing}
						>
							Cancel
						</Button>
						<Button
							type='button'
							onClick={confirmPublishWithLowHours}
							disabled={publishing}
						>
							{publishing ? 'Publishing…' : 'Publish anyway'}
						</Button>
					</>
				}
			>
				{publishLowHourTeams ? (
					<ul className='list-disc space-y-1.5 pl-5 text-sm text-muted-foreground'>
						{publishLowHourTeams.map((team) => (
							<li key={team.label}>
								<span className='font-medium text-foreground'>
									{team.label}
								</span>
								:{' '}
								{Number.isInteger(team.netHours)
									? team.netHours
									: team.netHours.toFixed(1)}{' '}
								h net duty
							</li>
						))}
					</ul>
				) : null}
			</Modal>
		</div>
  );
}
