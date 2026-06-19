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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import CreateEmployeeModal from '@/components/hr/CreateEmployeeModal';
import ScheduleSearchSelect from '@/components/hr/ScheduleSearchSelect';
import { ScheduleWorkerPoolCard } from '@/components/hr/ScheduleWorkerPoolCard';
import TimeEntryInput from '@/components/hr/TimeEntryInput';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import type { EmployeeTypeTimingSetting } from '@/lib/hr/employeeTypeSettings';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import {
  fetchActiveEmployeesForSchedule,
  fetchEmployeesByIds,
  fetchJobsByIds,
  normalizeScheduleJobRow,
  toScheduleEmployee,
  type ScheduleEmployeeRow,
  type ScheduleJobRow,
} from '@/lib/hr/scheduleSearchApi';
import {
  SCHEDULE_JOB_PICKER_LIST_PARAMS,
  jobRecordToScheduleRow,
  scheduleJobPickerParams,
  scheduleJobToSearchItem,
} from '@/lib/hr/scheduleJobPicker';
import { useJobLiveUpdate } from '@/lib/jobs/jobLiveUpdate';
import { jobsApi } from '@/store/api/endpoints/jobs';
import { useAppDispatch, useAppSelector, useGetJobsPageQuery, useUpdateJobMutation } from '@/store/hooks';
import type { RootState } from '@/store/store';
import type { WorkScheduleContext } from '@/lib/utils/templateData';
import {
  WORK_SCHEDULE_PRINT_CHANNEL,
  WORK_SCHEDULE_PRINT_PAYLOAD_KEY,
  type WorkSchedulePrintPayload,
} from '@/lib/utils/printTemplateSession';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Copy, GripVertical, Redo2, Trash2, Undo2 } from 'lucide-react';

const GUEST_DRIVER_ROW_PREFIX = 'guest:';

function isGuestDriverRowKey(key: string) {
  return key.startsWith(GUEST_DRIVER_ROW_PREFIX);
}

function guestDriverRowKeyFromLogId(logId: string) {
  return `${GUEST_DRIVER_ROW_PREFIX}${logId}`;
}

function createPendingGuestDriverRowKey() {
  return `${GUEST_DRIVER_ROW_PREFIX}pending-${crypto.randomUUID()}`;
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
}: {
  label: string;
  disabled?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  if (disabled) return null;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="inline-flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground transition hover:bg-muted active:cursor-grabbing"
      title={`Drag to reorder ${label}`}
      aria-label={`Drag to reorder ${label}`}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

const TEAM_COLUMN_CLASS = 'min-w-[20rem] w-[20rem] max-w-[20rem] align-top overflow-hidden';
const STICKY_ROW_LABEL_CLASS =
  'sticky left-0 z-20 min-w-[8rem] w-[8rem] border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)]';

/** In-grid controls — matches shadcn Input sizing. */
const SCHEDULE_GRID_FLAT_INPUT =
  'flex h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const SCHEDULE_GRID_SEARCH_INPUT =
  '!h-8 !rounded-md !border !border-border !bg-background !px-2 !text-sm focus-visible:!ring-2 focus-visible:!ring-ring min-w-0';

function scheduleSearchInputProps(navProps?: Record<string, unknown>) {
  const nav = (navProps ?? {}) as { className?: string };
  return { ...navProps, className: cn(SCHEDULE_GRID_SEARCH_INPUT, nav.className) };
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
  const saved = String(job?.description ?? '').trim();
  return saved;
}

function resolveWorkProcessDetails(workProcessDetails: string, job: JobOpt | null | undefined): string {
  if (workProcessDetails) return String(workProcessDetails).trim();
  if (job?.description) return String(job.description).trim();
  return String(workProcessDetails ?? '').trim();
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
  if (index < letters.length) return `Sub-team ${letters[index]}`;
  return `Sub-team ${index + 1}`;
}

function createEmptySubTeam(index: number): subTeamDraft {
  return {
    id: crypto.randomUUID(),
    label: nextSubTeamLabel(index),
    members: normalizeWorkerMemberList([]),
  };
}

function normalizeMemberList(members: MemberRow[]): MemberRow[] {
  return members.map((member, index) => ({
    employeeId: String(member.employeeId ?? ''),
    role: member.role === 'HELPER' || member.role === 'TEAM_LEADER' ? member.role : 'WORKER',
    slot: index + 1,
  }));
}

const MIN_WORKER_SLOTS = 2;

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
      currentSubTeam = createEmptySubTeam(subTeams.length);
      subTeams.push(currentSubTeam);
      currentSubTeam.members.push({
        employeeId: member.employeeId,
        role: 'TEAM_LEADER',
        slot: currentSubTeam.members.length + 1,
      });
      continue;
    }

    if (!currentSubTeam) {
      currentSubTeam = createEmptySubTeam(subTeams.length);
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

function draftsEqual(a: AsgDraft[], b: AsgDraft[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeDraft(raw: Partial<AsgDraft>, fallbackIndex = 0): AsgDraft {
  const baseMembers = Array.isArray(raw.members) ? normalizeMemberList(raw.members) : [];
  const derived = extractSubTeamsFromMembers(baseMembers);
  const subTeams = Array.isArray(raw.subTeams) && raw.subTeams.length > 0
    ? raw.subTeams.map((subTeam, index) => ({
        id: subTeam.id || crypto.randomUUID(),
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

const FIELD_ROWS: { key: string; label: string }[] = [
  { key: 'locationType', label: 'Location' },
  { key: 'job', label: 'Job number' },
  { key: 'jobCompany', label: 'Customer' },
  { key: 'workProcessDetails', label: 'Work process details' },
  { key: 'projectType', label: 'Project type' },
  { key: 'projectQtyArea', label: 'Project qty / area' },
  { key: 'dutyRange', label: 'Duty in / duty out' },
  { key: 'breakRange', label: 'Break out / break in' },
];
const NAV_ROW = {
  locationType: 0,
  job: 1,
  workProcess: 2,
  targetQty: 3,
  driver1: 4,
  driver2: 5,
  duty: 6,
  break: 7,
  workers: 8,
  remarks: 9,
} as const;

const WORKER_NAV_SUB_STRIDE = 1000;

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

const DRAFT_STORAGE_PREFIX = 'hr-schedule-draft:';
const VIEW_PREFS_STORAGE_KEY = 'hr-schedule-view-prefs';

function readStoredScheduleViewPrefs() {
  if (typeof window === 'undefined') {
    return {
      showWorkerRail: true,
      showRowLabels: true,
      viewScale: 1,
      useLightGridTheme: false,
    };
  }
  try {
    const raw = window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        showWorkerRail: true,
        showRowLabels: true,
        viewScale: 1,
        useLightGridTheme: false,
      };
    }
    const parsed = JSON.parse(raw) as {
      showWorkerRail?: boolean;
      showRowLabels?: boolean;
      viewScale?: number;
      useLightGridTheme?: boolean;
    };
    return {
      showWorkerRail: typeof parsed.showWorkerRail === 'boolean' ? parsed.showWorkerRail : true,
      showRowLabels: typeof parsed.showRowLabels === 'boolean' ? parsed.showRowLabels : true,
      viewScale:
        typeof parsed.viewScale === 'number' && parsed.viewScale >= 0.8 && parsed.viewScale <= 1.35
          ? parsed.viewScale
          : 1,
      useLightGridTheme: typeof parsed.useLightGridTheme === 'boolean' ? parsed.useLightGridTheme : false,
    };
  } catch {
    return {
      showWorkerRail: true,
      showRowLabels: true,
      viewScale: 1,
      useLightGridTheme: false,
    };
  }
}

export default function HrScheduleDayPage() {
  const params = useParams();
  const workDate = String(params.workDate ?? '');
  const { data: session } = useSession();
  const [schedule, setSchedule] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeById, setEmployeeById] = useState<Map<string, EmployeeProfile>>(() => new Map());
  const [jobById, setJobById] = useState<Map<string, JobOpt>>(() => new Map());
  const [labourTypeTiming, setLabourTypeTiming] = useState<EmployeeTypeTimingSetting | null>(null);
  const [previousSchedules, setPreviousSchedules] = useState<ScheduleTemplateOption[]>([]);
  const [selectedTemplateDate, setSelectedTemplateDate] = useState('');
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
  const [showWorkerRail, setShowWorkerRail] = useState(() => readStoredScheduleViewPrefs().showWorkerRail);
  const [showRowLabels, setShowRowLabels] = useState(() => readStoredScheduleViewPrefs().showRowLabels);
  const [viewScale, setViewScale] = useState(() => readStoredScheduleViewPrefs().viewScale);
  const [useLightGridTheme, setUseLightGridTheme] = useState(() => readStoredScheduleViewPrefs().useLightGridTheme);
  const [undoStack, setUndoStack] = useState<AsgDraft[][]>([]);
  const [redoStack, setRedoStack] = useState<AsgDraft[][]>([]);
  const suspendHistoryRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const draftsRef = useRef<AsgDraft[]>([]);
  const teamBoardBodyRef = useRef<HTMLDivElement>(null);
  const [workerRailMaxHeight, setWorkerRailMaxHeight] = useState<number | null>(null);
  const [pendingWorkerCreate, setPendingWorkerCreate] = useState<PendingWorkerCreate | null>(null);
  const [pendingInactiveJob, setPendingInactiveJob] = useState<PendingInactiveJob | null>(null);
  const [pendingStaleJob, setPendingStaleJob] = useState<PendingStaleJob | null>(null);
  const [activatingJob, setActivatingJob] = useState(false);
  const dismissedStaleJobIdsRef = useRef<Set<string>>(new Set());
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [updateJob] = useUpdateJobMutation();
  const [draggingWorker, setDraggingWorker] = useState<WorkerDragTarget | null>(null);
  const [draggingSubTeam, setDraggingSubTeam] = useState<SubTeamDragTarget | null>(null);
  const [draggingTeamColumn, setDraggingTeamColumn] = useState<number | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');
  const canEditJob = isSA || perms.includes('job.edit');
  const canCreateEmployee = isSA || perms.includes('hr.employee.edit');
  const { data: scheduleJobsPage } = useGetJobsPageQuery(SCHEDULE_JOB_PICKER_LIST_PARAMS, { skip: !canView });
  const canPub = isSA || perms.includes('hr.schedule.publish');
  const status = schedule && typeof schedule === 'object' ? String((schedule as { status?: string }).status ?? '') : '';
  const locked = status === 'LOCKED';
  const dis = !canEdit || locked;
  const draftStorageKey = useMemo(() => `${DRAFT_STORAGE_PREFIX}${workDate}`, [workDate]);
  const canZoomOut = viewScale > 0.8;
  const canZoomIn = viewScale < 1.35;
  const scheduleRowLabelCls = STICKY_ROW_LABEL_CLASS;
  const scheduleRowCls = 'border-b border-border transition-colors hover:bg-muted/40';
  const gridFlatInputCls = SCHEDULE_GRID_FLAT_INPUT;
  const gridTextareaCls = cn(SCHEDULE_GRID_FLAT_INPUT, 'min-h-20 resize-y py-2');
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

  useEffect(() => {
    try {
      localStorage.setItem(
        VIEW_PREFS_STORAGE_KEY,
        JSON.stringify({
          showWorkerRail,
          showRowLabels,
          viewScale,
          useLightGridTheme,
        })
      );
    } catch {
      // ignore storage quota / availability issues
    }
  }, [showWorkerRail, showRowLabels, viewScale, useLightGridTheme]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    if (!showWorkerRail) return;
    const node = teamBoardBodyRef.current;
    if (!node) return;

    const syncHeight = () => {
      const height = Math.round(node.getBoundingClientRect().height);
      setWorkerRailMaxHeight(height > 120 ? height : null);
    };

    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(node);
    window.addEventListener('resize', syncHeight);
    requestAnimationFrame(syncHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeight);
    };
  }, [showWorkerRail, drafts.length, showRowLabels, viewScale, loading, schedule]);

  const getRowThemeClasses = useCallback((rowKey: string): { row: string; label: string; cell: string } => {
      if (!useLightGridTheme) {
        return {
          row: scheduleRowCls,
          label: scheduleRowLabelCls,
          cell: 'p-2',
        };
      }

      const shared = { row: scheduleRowCls };
      const themedLabel = (tone: string) => cn(STICKY_ROW_LABEL_CLASS, tone);
      if (
        rowKey === 'locationType' ||
        rowKey === 'job' ||
        rowKey === 'jobCompany' ||
        rowKey === 'workProcessDetails' ||
        rowKey === 'projectType' ||
        rowKey === 'projectQtyArea' ||
        rowKey === 'targetQty'
      ) {
        return {
          row: shared.row,
          label: themedLabel('!bg-sky-100 text-sky-900 dark:!bg-sky-950 dark:text-sky-100'),
          cell: 'bg-sky-500/5 p-2',
        };
      }
      if (rowKey === 'dutyRange' || rowKey === 'breakRange') {
        return {
          row: shared.row,
          label: themedLabel('!bg-emerald-100 text-emerald-900 dark:!bg-emerald-950 dark:text-emerald-100'),
          cell: 'bg-emerald-500/5 p-2',
        };
      }
      if (rowKey === 'workers' || rowKey === 'suggestedWorkers') {
        return {
          row: shared.row,
          label: themedLabel('!bg-amber-100 text-amber-950 dark:!bg-amber-950 dark:text-amber-100'),
          cell: 'bg-amber-500/5 p-2',
        };
      }
      if (rowKey === 'workerCount') {
        return {
          row: shared.row,
          label: themedLabel('!bg-orange-100 text-orange-950 dark:!bg-orange-950 dark:text-orange-100'),
          cell: 'bg-orange-500/5 p-2',
        };
      }
      if (rowKey === 'driver1EmployeeId' || rowKey === 'driver2EmployeeId') {
        return {
          row: shared.row,
          label: themedLabel('!bg-rose-100 text-rose-900 dark:!bg-rose-950 dark:text-rose-100'),
          cell: 'bg-rose-500/5 p-2',
        };
      }
      if (rowKey === 'remarks') {
        return { row: shared.row, label: scheduleRowLabelCls, cell: 'bg-muted/30 p-2' };
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
      'sticky top-0 z-20 border-b border-border bg-muted px-3 py-3 text-left align-top',
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
    if (!assignedJobIds.length) return;
    const jobs = assignedJobIds
      .map((id) => jobsApi.endpoints.getJobById.select(id)(store.getState())?.data)
      .filter((job): job is NonNullable<typeof job> => Boolean(job));
    if (jobs.length > 0) {
      mergeJobs(jobs.map(jobRecordToScheduleRow));
    }
  }, [assignedJobIds, assignedJobsFingerprint, mergeJobs, store]);

  const loadScheduleJobs = useCallback(
    async (query: string) => {
      const result = await dispatch(
        jobsApi.endpoints.getJobsPage.initiate(scheduleJobPickerParams(query), {
          subscribe: false,
          forceRefetch: false,
        })
      ).unwrap();
      mergeJobs(result.items.map(jobRecordToScheduleRow));
      return result.items.map((job) => scheduleJobToSearchItem(job));
    },
    [dispatch, mergeJobs]
  );

  const resolveScheduleJobById = useCallback(
    async (id: string) => {
      const cached = getJob(id);
      if (cached) return scheduleJobToSearchItem(cached);
      const row = await dispatch(
        jobsApi.endpoints.getJobById.initiate(id, { subscribe: false, forceRefetch: false })
      ).unwrap();
      mergeJobs([jobRecordToScheduleRow(row)]);
      return scheduleJobToSearchItem(row);
    },
    [dispatch, getJob, mergeJobs]
  );

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) setSchedule(json.data);
    else setSchedule(null);
  }, [workDate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) return;
      if (!cancelled) setLoading(true);
      await loadSchedule();
      const [timingRes, sr, activeEmployees] = await Promise.all([
        fetch('/api/hr/employee-type-settings', { cache: 'no-store' }),
        fetch('/api/hr/schedule', { cache: 'no-store' }),
        fetchActiveEmployeesForSchedule(),
      ]);
      const [timingJson, sj] = await Promise.all([timingRes.json(), sr.json()]);
      if (cancelled) return;
      if (activeEmployees.length > 0) mergeEmployees(activeEmployees);
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
        setSelectedTemplateDate((current) => current || options[0]?.workDate || '');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canView, loadSchedule, mergeEmployees, workDate]);

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
    if (jobsFromAssignments.length > 0) mergeJobs(jobsFromAssignments);
    suspendHistoryRef.current = true;
    setScheduleInfo(String((sch as { notes?: string | null }).notes ?? ''));
    setDrafts(
      asg.map((a, idx) =>
        normalizeDraft(
          {
            columnIndex: typeof a.columnIndex === 'number' ? a.columnIndex : idx + 1,
            label: String(a.label ?? `Team#${idx + 1}`),
            locationType: (a.locationType as AsgDraft['locationType']) ?? 'SITE_JOB',
            jobId: (a.job as { id?: string })?.id ?? '',
            factoryCode: String(a.factoryCode ?? ''),
            jobNumberSnapshot: String(a.jobNumberSnapshot ?? ''),
            workProcessDetails:
              getInitialWorkProcessDetails({
              id: String((a.job as { id?: string })?.id ?? ''),
              jobNumber: String((a.job as { jobNumber?: string })?.jobNumber ?? a.jobNumberSnapshot ?? ''),
                customerName: String((a.job as { customer?: { name?: string } })?.customer?.name ?? ''),
                description: String((a.job as { description?: string })?.description ?? ''),
                projectDetails:
                  String((a.job as { projectDetails?: string })?.projectDetails ?? '') || '',
              }) || String(a.projectDetailsSnapshot ?? ''),
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
          idx
        )
      )
    );
    setUndoStack([]);
    setRedoStack([]);
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, [mergeJobs]);

  useEffect(() => {
    queueMicrotask(() => {
      if (schedule && typeof schedule === 'object' && 'id' in schedule) mapFromApi(schedule as Record<string, unknown>);
      else {
        suspendHistoryRef.current = true;
        setScheduleInfo('');
        setDrafts([]);
        setUndoStack([]);
        setRedoStack([]);
        queueMicrotask(() => {
          suspendHistoryRef.current = false;
        });
      }
    });
  }, [schedule, mapFromApi]);

  useEffect(() => {
    restoredDraftRef.current = false;
  }, [draftStorageKey]);

  useEffect(() => {
    if (!schedule || restoredDraftRef.current || dis) return;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { drafts?: Array<Partial<AsgDraft>>; savedAt?: string };
      if (!Array.isArray(parsed?.drafts)) return;
      restoredDraftRef.current = true;
      queueMicrotask(() => {
        suspendHistoryRef.current = true;
        setDrafts((parsed.drafts ?? []).map((draft, index) => normalizeDraft(draft, index)));
        setUndoStack([]);
        setRedoStack([]);
        suspendHistoryRef.current = false;
      });
      toast.success(`Recovered local draft${parsed.savedAt ? ` (${new Date(parsed.savedAt).toLocaleTimeString()})` : ''}`);
    } catch {
      // ignore invalid localStorage payload
    }
  }, [schedule, dis, draftStorageKey]);

  useEffect(() => {
    if (!schedule || dis) return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          drafts,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage quota / availability issues
    }
  }, [drafts, schedule, dis, draftStorageKey]);

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
    () =>
      workerPool.map((e) => ({
        id: e.id,
        label: e.preferredName || e.fullName,
        searchText: `${e.fullName} ${e.preferredName ?? ''} ${e.employeeCode} ${e.workforce.expertises.join(' ')}`,
      })),
    [workerPool]
  );

  const driverItems = useMemo(
    () =>
      driverPool.map((e) => ({
        id: e.id,
        label: e.preferredName || e.fullName,
        searchText: `${e.fullName} ${e.preferredName ?? ''} ${e.employeeCode}`,
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

  const saveAssignments = async () => {
    if (!schedule || !('id' in schedule)) return;
    const invalidSplitTeam = drafts.find((draft) =>
      draft.splitMode && draft.subTeams.some((subTeam) => !subTeam.members.some((member) => member.employeeId))
    );
    if (invalidSplitTeam) {
      toast.error(`${invalidSplitTeam.label} has an empty sub-team.`);
      return;
    }
    setSaving(true);
    const sid = String((schedule as { id: string }).id);
    const uniqueJobUpdates = new Map<string, string>();
    for (const draft of drafts) {
      if (!draft.jobId || draft.locationType !== 'SITE_JOB') continue;
      const job = getJob(draft.jobId);
      const resolvedWorkProcess = resolveWorkProcessDetails(draft.workProcessDetails, job);
      const currentSaved = String(job?.description ?? '').trim();
      if (resolvedWorkProcess !== currentSaved) {
        uniqueJobUpdates.set(draft.jobId, resolvedWorkProcess);
      }
    }

    if (uniqueJobUpdates.size > 0) {
      const jobUpdateResults = await Promise.all(
        [...uniqueJobUpdates.entries()].map(async ([jobId, projectDetails]) => {
          const response = await fetch(`/api/jobs/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: projectDetails }),
          });
          const json = await response.json().catch(() => null);
          return { ok: response.ok && json?.success, error: json?.error as string | undefined };
        })
      );

      const failed = jobUpdateResults.find((result) => !result.ok);
      if (failed) {
        setSaving(false);
        toast.error(failed.error ?? 'Could not update work process details on the job.');
        return;
      }
    }

    const body = {
      notes: scheduleInfo || null,
      assignments: drafts.map((d) => {
        const job = getJob(d.jobId);
        const resolvedWorkProcess = resolveWorkProcessDetails(d.workProcessDetails, job);
        const parsedTargetQty = Number.parseFloat(String(d.targetQty ?? '').trim());
        const nonSplitMembers = normalizeMemberList(d.members.filter((member) => member.employeeId));
        const splitMembers = d.subTeams.flatMap((subTeam) => {
          const people = normalizeMemberList(subTeam.members.filter((member) => member.employeeId));
          return people.map((member, index) => ({
            employeeId: member.employeeId,
            role: index === 0 ? ('TEAM_LEADER' as const) : member.role === 'HELPER' ? ('HELPER' as const) : ('WORKER' as const),
            slot: 0,
          }));
        });
        const memberPayload = d.splitMode
          ? splitMembers.map((member, index) => ({ ...member, slot: index + 1 }))
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
          projectDetailsSnapshot: d.locationType === 'SITE_JOB' ? resolvedWorkProcess || null : null,
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
    const res = await fetch(`/api/hr/schedule/${sid}/assignments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await readApiEnvelope<{ success?: boolean; error?: string; data?: Record<string, unknown> }>(res);
    if (!res.ok || !json?.success) {
      setSaving(false);
      toast.error(json?.error ?? 'Save failed');
      return;
    }

    const driverRes = await fetch(`/api/hr/schedule/${sid}/driver-logs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });
    const driverJson = await readApiEnvelope<{ success?: boolean; error?: string; data?: unknown }>(driverRes);
    setSaving(false);
    if (!driverRes.ok || !driverJson?.success) {
      toast.error(driverJson?.error ?? 'Driver trip save failed');
      return;
    }

    toast.success('Saved');
    localStorage.removeItem(draftStorageKey);
    restoredDraftRef.current = false;
    const savedLogs = (driverJson.data ?? []) as ScheduleDriverLogRecord[];
    setSchedule({
      ...(json.data as Record<string, unknown>),
      driverLogs: savedLogs,
    });
    syncDriverTripStateFromLogs(savedLogs, driverLogVersion, false);
  };

  const publish = async () => {
    if (!schedule || !('id' in schedule)) return;
    const sid = String((schedule as { id: string }).id);
    const res = await fetch(`/api/hr/schedule/${sid}/publish`, { method: 'POST' });
    const json = await readApiEnvelope<{ success?: boolean; error?: string }>(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Publish failed');
    else { toast.success('Published'); loadSchedule(); }
  };

  const applyPreviousScheduleTemplate = async () => {
    if (!selectedTemplateDate) return;
    const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(selectedTemplateDate)}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json?.success || !json.data) {
      toast.error(json?.error ?? 'Failed to load template');
      return;
    }
    mapFromApi(json.data as Record<string, unknown>);
    toast.success(`Template loaded from ${selectedTemplateDate}`);
  };

  const addColumn = () => {
    applyDrafts((prev) => {
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
    applyDrafts((prev) => {
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
          id: crypto.randomUUID(),
          members: subTeam.members.map((member) => ({ ...member })),
        })),
      };
      return [...prev, newCol];
    });
  };

  const removeColumn = (idx: number) => applyDrafts((d) => d.filter((_, i) => i !== idx));

  const reorderTeamColumns = (fromIndex: number, toIndex: number) =>
    applyDrafts((rows) => {
      const reordered = moveArrayItem(rows, fromIndex, toIndex);
      return reordered.map((row, index) => ({
        ...row,
        columnIndex: index + 1,
      }));
    });

  const moveTeamColumn = (colIdx: number, direction: -1 | 1) => {
    const toIndex = colIdx + direction;
    if (toIndex < 0 || toIndex >= draftsRef.current.length) return;
    reorderTeamColumns(colIdx, toIndex);
  };

  const handleTeamColumnDrop = (targetColIdx: number) => {
    if (draggingTeamColumn == null || dis) return;
    if (draggingTeamColumn !== targetColIdx) {
      reorderTeamColumns(draggingTeamColumn, targetColIdx);
    }
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

  const applyDrafts = useCallback((updater: (current: AsgDraft[]) => AsgDraft[]) => {
    setDrafts((current) => {
      const next = updater(current);
      if (suspendHistoryRef.current) return next;
      if (draftsEqual(next, current)) return current;
      setUndoStack((prev) => [...prev.slice(-39), cloneDrafts(current)]);
      setRedoStack([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previous = prevUndo[prevUndo.length - 1];
      const currentSnapshot = cloneDrafts(draftsRef.current);
      setRedoStack((prevRedo) => [...prevRedo, currentSnapshot]);
      setDrafts(cloneDrafts(previous));
      return prevUndo.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const next = prevRedo[prevRedo.length - 1];
      const currentSnapshot = cloneDrafts(draftsRef.current);
      setUndoStack((prevUndo) => [...prevUndo.slice(-39), currentSnapshot]);
      setDrafts(cloneDrafts(next));
      return prevRedo.slice(0, -1);
    });
  }, []);

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
      void Promise.allSettled(
        assignedJobIds.map((id) =>
          dispatch(jobsApi.endpoints.getJobById.initiate(id, { forceRefetch: true })).unwrap()
        )
      ).then(() => {
        syncStaleAssignedJobs();
      });
    }, [assignedJobIds, dispatch, syncStaleAssignedJobs])
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
    setDraggingWorker(null);
  };

  const handleSubTeamDrop = (target: SubTeamDragTarget) => {
    if (!draggingSubTeam || dis) return;
    if (
      draggingSubTeam.colIdx === target.colIdx &&
      draggingSubTeam.subTeamIndex !== target.subTeamIndex
    ) {
      reorderSubTeams(target.colIdx, draggingSubTeam.subTeamIndex, target.subTeamIndex);
    }
    setDraggingSubTeam(null);
  };

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

  const focusScheduleCell = useCallback((row: number, col: number, sub = 0) => {
    const exact = document.querySelector<HTMLElement>(
      `[data-schedule-nav="true"][data-nav-row="${row}"][data-nav-col="${col}"][data-nav-sub="${sub}"]`
    );
    if (exact) {
      exact.focus();
      return;
    }
    const fallback = document.querySelector<HTMLElement>(
      `[data-schedule-nav="true"][data-nav-row="${row}"][data-nav-col="${col}"]`
    );
    fallback?.focus();
  }, []);

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

      const row = Number(target.dataset.navRow ?? '-1');
      const col = Number(target.dataset.navCol ?? '-1');
      const sub = Number(target.dataset.navSub ?? '0');
      if (row < 0 || col < 0) return;

      e.preventDefault();

      if (row === NAV_ROW.workers && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const colIdx = col - 1;
        const draft = draftsRef.current[colIdx];
        const subs = draft ? getWorkerFieldNavSubs(draft) : [];
        const currentIndex = subs.indexOf(sub);
        if (e.key === 'ArrowDown' && currentIndex >= 0 && currentIndex < subs.length - 1) {
          focusScheduleCell(row, col, subs[currentIndex + 1]);
          return;
        }
        if (e.key === 'ArrowUp' && currentIndex > 0) {
          focusScheduleCell(row, col, subs[currentIndex - 1]);
          return;
        }
      }

      if (e.key === 'ArrowUp') focusScheduleCell(Math.max(0, row - 1), col, sub);
      if (e.key === 'ArrowDown') focusScheduleCell(row + 1, col, sub);
      if (e.key === 'ArrowLeft') focusScheduleCell(row, Math.max(0, col - 1), sub);
      if (e.key === 'ArrowRight') focusScheduleCell(row, col + 1, sub);
    },
    [focusScheduleCell]
  );

  const getGridNavProps = useCallback(
    (row: number, col: number, sub = 0) => ({
      'data-schedule-nav': 'true',
      'data-nav-row': String(row),
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
      },
      scheduleGroups: drafts.map((draft) => {
        const job = getJob(draft.jobId);
        const resolvedWorkProcess = resolveWorkProcessDetails(draft.workProcessDetails, job);
        const flatWorkerNames = draft.splitMode
          ? draft.subTeams.flatMap((subTeam) => subTeam.members.map((member) => empName(member.employeeId))).filter(Boolean)
          : draft.members.map((member) => empName(member.employeeId)).filter(Boolean);
        const numberedFlatWorkerNames = flatWorkerNames.map((name, index) => `${index + 1}. ${name}`);
        const dutyStartLabel = formatScheduleTimeForPrint(draft.dutyStart);
        const dutyEndLabel = formatScheduleTimeForPrint(draft.dutyEnd);
        const breakStartLabel = formatScheduleTimeForPrint(draft.breakStart);
        const breakEndLabel = formatScheduleTimeForPrint(draft.breakEnd);
        const workerNames = flatWorkerNames.join(', ');
        const driverNames = [draft.driver1EmployeeId, draft.driver2EmployeeId]
          .map((id) => empName(id))
          .filter(Boolean)
          .join(' / ');
        const workerBlockRows = !draft.splitMode
          ? flatWorkerNames.map((name, index) => ({
              kind: index === 0 ? ('leader' as const) : ('worker' as const),
              text: `${index + 1}. ${name}`,
            }))
          : draft.subTeams.flatMap((subTeam, subTeamIndex) => {
              const rows: Array<{ kind: 'subteam' | 'leader' | 'worker' | 'spacer'; text: string }> = [];
              if (subTeamIndex > 0) rows.push({ kind: 'spacer', text: '' });
              rows.push({ kind: 'subteam', text: subTeam.label });
              const subTeamPeople = subTeam.members.map((member) => empName(member.employeeId)).filter(Boolean);
              subTeamPeople.forEach((name, index) => {
                rows.push({
                  kind: index === 0 ? 'leader' : 'worker',
                  text: `${index + 1}. ${name}`,
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
          siteName: draft.locationType === 'SITE_JOB' ? String(job?.site ?? '').trim() : '',
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
          workProcessDetails: resolvedWorkProcess,
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

  
  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <p className="text-sm text-muted-foreground">You do not have permission to view HR schedules.</p>
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
              'h-full w-full rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors',
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
          <div className="flex min-h-4 items-center px-2 py-1">
            <span className="truncate text-xs text-foreground/90" title={customerName || undefined}>
              {customerName || '—'}
            </span>
          </div>
        );
      }
      case 'workProcessDetails': {
        return (
          <div className="space-y-1 px-2 py-1.5">
            <textarea
              value={d.workProcessDetails}
              onChange={(e) => upd(colIdx, { workProcessDetails: e.target.value })}
              disabled={fieldDisabled}
              rows={2}
              placeholder="Enter work process details..."
              className={gridTextareaCls}
              {...getGridNavProps(NAV_ROW.workProcess, colIdx + 1)}
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
          <div className="flex min-h-4 items-center px-2 py-1">
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
            rows={2}
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
              inputProps={scheduleSearchInputProps(
                getGridNavProps(fieldKey === 'driver1EmployeeId' ? NAV_ROW.driver1 : NAV_ROW.driver2, colIdx + 1),
              )}
            />
          </div>
        );
      }
      case 'dutyRange':
        return (
          <div className="space-y-1 px-2 py-1.5">
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
          <div className="grid grid-cols-2 gap-1 px-2 py-1.5">
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
    const blockCls = 'rounded-lg border border-border bg-muted/30 p-2';
    const fieldDisabled = dis;

    return (
      <div className="min-w-0 space-y-2">
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
                  className={cn(
                    'rounded transition-colors',
                    isMulti && 'ring-2 ring-amber-400/60',
                    isDragging && 'bg-primary/5 ring-2 ring-primary/30'
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleWorkerDrop(dragTarget)}
                >
                  <div className="flex items-center gap-1">
                    <ScheduleDragHandle
                      label="worker"
                      disabled={fieldDisabled}
                      onDragStart={() => setDraggingWorker(dragTarget)}
                      onDragEnd={() => setDraggingWorker(null)}
                    />
                    <div className="min-w-0 flex-1">
                      <SearchSelect
                        items={getSelectableWorkerItems(draft, { excludeFlatMemberIndex: memberIndex })}
                        value={member.employeeId}
                        onChange={(value) => updateFlatMember(colIdx, memberIndex, value)}
                        placeholder={memberIndex === 0 ? 'Team Leader' : ``}
                        disabled={fieldDisabled}
                        minCharactersToSearch={1}
                        allowClearButton={false}
                        clearOnEmptyInput
                        dropdownInPortal
                        passThroughArrowKeys
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
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFlatMember(colIdx, memberIndex)}
                        aria-label="Remove worker row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="h-8 w-8 shrink-0" aria-hidden />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            {draft.subTeams.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Add a sub-team to start splitting this team.</p>
            )}
            {draft.subTeams.map((subTeam, subTeamIndex) => {
              const subTeamDragTarget: SubTeamDragTarget = { colIdx, subTeamIndex };
              const isSubTeamDragging = isSubTeamDragSource(subTeamDragTarget);
              return (
              <div
                key={subTeam.id}
                className={cn(
                  blockCls,
                  isSubTeamDragging && 'ring-2 ring-primary/30'
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleSubTeamDrop(subTeamDragTarget)}
              >
                <div className="flex items-center gap-1.5">
                  <ScheduleDragHandle
                    label="sub-team"
                    disabled={fieldDisabled}
                    onDragStart={() => setDraggingSubTeam(subTeamDragTarget)}
                    onDragEnd={() => setDraggingSubTeam(null)}
                  />
                  <input
                    value={subTeam.label}
                    onChange={(e) => updateSubTeamMeta(colIdx, subTeamIndex, { label: e.target.value })}
                    disabled={fieldDisabled}
                    className={cn(gridFlatInputCls, 'min-w-0 flex-1')}
                    placeholder={nextSubTeamLabel(subTeamIndex)}
                  />
                  {!dis && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSubTeam(colIdx, subTeamIndex)}
                      aria-label="Remove sub-team"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="mt-1.5 space-y-1">
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
                        className={cn(
                          'rounded transition-colors',
                          isMulti && 'ring-2 ring-amber-400/60',
                          isDragging && 'bg-primary/5 ring-2 ring-primary/30'
                        )}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleWorkerDrop(dragTarget)}
                      >
                        <div className="flex items-center gap-1">
                          <ScheduleDragHandle
                            label="worker"
                            disabled={fieldDisabled}
                            onDragStart={() => setDraggingWorker(dragTarget)}
                            onDragEnd={() => setDraggingWorker(null)}
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
                              allowClearButton={false}
                              clearOnEmptyInput
                              dropdownInPortal
                              passThroughArrowKeys
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
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSubTeamMember(colIdx, subTeamIndex, memberIndex)}
                              aria-label="Remove worker row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="h-8 w-8 shrink-0" aria-hidden />
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

  return (
		<div className='flex w-full min-w-0 flex-col gap-5'>
			<header className='flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between'>
				<div className='min-w-0 space-y-1'>
					<p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
						HR planning
					</p>
					<h1 className='text-xl font-semibold tracking-tight text-foreground'>
						Day schedule · {workDateLabel}
					</h1>
					{schedule ? (
						<p className='text-sm text-muted-foreground'>
							{scheduleSummary.groups} teams ·{' '}
							{scheduleSummary.workers} workers ·{' '}
							{scheduleSummary.groupsWithTiming} with timing
						</p>
					) : null}
				</div>
				<div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
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
					{schedule ? (
						<Badge variant='outline' className='tabular-nums'>
							{drafts.length} teams
						</Badge>
					) : null}
					{schedule && canEdit && !locked ? (
						<>
							<select
								value={selectedTemplateDate}
								onChange={(e) =>
									setSelectedTemplateDate(e.target.value)
								}
								className={cn(
									SCHEDULE_GRID_FLAT_INPUT,
									'h-9 w-auto min-w-40',
								)}
								aria-label='Copy schedule from date'
							>
								<option value=''>Copy from date…</option>
								{previousSchedules.map((item) => (
									<option key={item.id} value={item.workDate}>
										{item.workDate} ({item.status})
									</option>
								))}
							</select>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={applyPreviousScheduleTemplate}
								disabled={!selectedTemplateDate}
							>
								Apply template
							</Button>
							<Separator
								orientation='vertical'
								className='hidden h-6 sm:block'
							/>
						</>
					) : null}
					{schedule && canEdit && !locked ? (
						<Button
							type='button'
							size='sm'
							variant='secondary'
							onClick={saveAssignments}
							disabled={saving}
						>
							{saving ? 'Saving…' : 'Save schedule'}
						</Button>
					) : null}
					{schedule && canPub && status === 'DRAFT' ? (
						<Button type='button' size='sm' onClick={publish}>
							Publish
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
					<div
						className={cn(
							'grid gap-5',
							showWorkerRail
								? 'xl:grid-cols-[1fr_12rem] xl:items-stretch'
								: 'grid-cols-1',
						)}
					>
						<section className='overflow-hidden rounded-lg border border-border bg-card shadow-sm'>
							<div className='flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between'>
								<div className='min-w-0 space-y-1'>
									<h2 className='text-lg font-semibold text-foreground'>
										Team board
									</h2>
									<p className='text-sm text-muted-foreground'>
										{drafts.length} team
										{drafts.length === 1 ? '' : 's'} —
										scroll horizontally to view all columns
									</p>
								</div>
								<div className='flex flex-wrap items-center gap-2'>
									{canEdit && !locked ? (
										<Button
											type='button'
											size='sm'
											onClick={addColumn}
										>
											Add team
										</Button>
									) : null}
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={() =>
											void openSchedulePrintOutput(
												'print',
											)
										}
									>
										Print
									</Button>
									<Separator
										orientation='vertical'
										className='hidden h-6 sm:block'
									/>
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={() =>
											setShowWorkerRail((c) => !c)
										}
									>
										{showWorkerRail
											? 'Hide workers'
											: 'Workers'}
									</Button>
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={() =>
											setShowRowLabels((c) => !c)
										}
									>
										{showRowLabels
											? 'Hide labels'
											: 'Labels'}
									</Button>
									<Button
										type='button'
										variant={
											useLightGridTheme
												? 'secondary'
												: 'outline'
										}
										size='sm'
										onClick={() =>
											setUseLightGridTheme((c) => !c)
										}
									>
										{useLightGridTheme
											? 'Plain rows'
											: 'Color rows'}
									</Button>
									{canEdit && !locked ? (
										<>
											<Button
												type='button'
												variant='outline'
												size='icon'
												className='h-8 w-8'
												onClick={undo}
												disabled={
													undoStack.length === 0
												}
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
												disabled={
													redoStack.length === 0
												}
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
							</div>

							<div
								ref={teamBoardBodyRef}
								className='isolate overflow-x-auto'
								style={{ zoom: viewScale } as CSSProperties}
							>
								<table
									className={`border-collapse text-sm ${drafts.length <= 0 ? 'min-w-full' : 'w-max'}`}
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
													scope='col'
													className={cn(
														teamHeaderCls(),
														draggingTeamColumn === ci && 'ring-2 ring-primary/30'
													)}
													onDragOver={(e) => e.preventDefault()}
													onDrop={() => handleTeamColumnDrop(ci)}
												>
													<div className='flex items-center justify-between gap-2'>
														<div className='flex min-w-0 items-center gap-1'>
															{canEdit && !locked ? (
																<>
																	<ScheduleDragHandle
																		label='team column'
																		onDragStart={() => setDraggingTeamColumn(ci)}
																		onDragEnd={() => setDraggingTeamColumn(null)}
																	/>
																	<Button
																		type='button'
																		variant='ghost'
																		size='icon'
																		className='h-7 w-7'
																		disabled={ci === 0}
																		onClick={() => moveTeamColumn(ci, -1)}
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
																		disabled={ci === drafts.length - 1}
																		onClick={() => moveTeamColumn(ci, 1)}
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
																Team {d.columnIndex}
															</Badge>
														</div>
														{canEdit && !locked ? (
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
													className='px-6 py-12 text-center text-sm text-muted-foreground'
												>
													<p className='text-sm font-semibold text-foreground'>
														No teams on the board
														yet
													</p>
													<p className='mt-1 text-sm text-muted-foreground'>
														Add a team column to
														start planning jobs,
														workers, and timings.
													</p>
													{canEdit && !locked ? (
														<Button
															type='button'
															size='sm'
															className='mt-4'
															onClick={addColumn}
														>
															+ Add first team
														</Button>
													) : null}
												</td>
											</tr>
										) : (
											<>
												{FIELD_ROWS.map((f) => (
													<tr
														key={f.key}
														className={
															getRowThemeClasses(
																f.key,
															).row
														}
													>
														{showRowLabels && (
															<th
																className={
																	getRowThemeClasses(
																		f.key,
																	).label
																}
															>
																{f.label}
															</th>
														)}
														{drafts.map((d, ci) => (
															<td
																key={ci}
																className={plannerCellCls(
																	f.key,
																)}
															>
																<div className='min-w-0'>
																	{renderCell(
																		d,
																		ci,
																		f.key,
																	)}
																</div>
															</td>
														))}
													</tr>
												))}

												<tr
													className={
														getRowThemeClasses(
															'workers',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'workers',
																).label
															}
														>
															Workers
														</th>
													)}
													{drafts.map((d, ci) => (
														<td
															key={ci}
															className={plannerCellCls(
																'workers',
															)}
														>
															<div className='relative min-h-20 min-w-0'>
																{renderWorkersCell(
																	d,
																	ci,
																)}
															</div>
														</td>
													))}
												</tr>

												<tr
													className={
														getRowThemeClasses(
															'workerCount',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'workerCount',
																).label
															}
														>
															Assigned workers
														</th>
													)}
													{drafts.map((d, ci) => (
														<td
															key={ci}
															className={plannerCellCls(
																'workerCount',
															)}
														>
															<div className='inline-flex min-w-12 items-center justify-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground'>
																{getDraftWorkerCount(
																	d,
																)}
															</div>
														</td>
													))}
												</tr>

												<tr
													className={
														getRowThemeClasses(
															'suggestedWorkers',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'suggestedWorkers',
																).label
															}
														>
															Suggested workers
														</th>
													)}
													{drafts.map((d, ci) => {
														const job = getJob(
															d.jobId,
														);
														const required =
															parseJobExpertise(
																job,
															);
														const suggestions =
															suggestedWorkersByColumn.get(
																ci,
															) ?? [];
														return (
															<td
																key={ci}
																className={plannerCellCls(
																	'suggestedWorkers',
																)}
															>
																{required.length ===
																0 ? (
																	<p className='text-[11px] text-muted-foreground'>
																		No job
																		expertise
																		configured
																		yet.
																	</p>
																) : suggestions.length ===
																  0 ? (
																	<p className='text-[11px] text-muted-foreground'>
																		No
																		matching
																		workers
																		available.
																	</p>
																) : (
																	<div className='flex flex-wrap gap-1'>
																		{suggestions
																			.slice(
																				0,
																				8,
																			)
																			.map(
																				(
																					w,
																				) => (
																					<button
																						key={
																							w.id
																						}
																						type='button'
																						disabled={
																							dis
																						}
																						onClick={() =>
																							addWorkerToTeam(
																								ci,
																								w.id,
																							)
																						}
																						className='rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-300'
																						title={w.workforce.expertises.join(
																							', ',
																						)}
																					>
																						{w.preferredName ||
																							w.fullName}
																					</button>
																				),
																			)}
																	</div>
																)}
															</td>
														);
													})}
												</tr>

												<tr
													className={
														getRowThemeClasses(
															'targetQty',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'targetQty',
																).label
															}
														>
															Target Qty
														</th>
													)}
													{drafts.map((d, ci) => (
														<td
															key={ci}
															className={plannerCellCls(
																'targetQty',
															)}
														>
															<div className='min-w-0'>
																{renderCell(
																	d,
																	ci,
																	'targetQty',
																)}
															</div>
														</td>
													))}
												</tr>

												<tr
													className={
														getRowThemeClasses(
															'driver1EmployeeId',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'driver1EmployeeId',
																).label
															}
														>
															Driver 1
														</th>
													)}
													{drafts.map((d, ci) => (
														<td
															key={ci}
															className={plannerCellCls(
																'driver1EmployeeId',
															)}
														>
															<div className='min-w-0'>
																{renderCell(
																	d,
																	ci,
																	'driver1EmployeeId',
																)}
															</div>
														</td>
													))}
												</tr>

												<tr
													className={
														getRowThemeClasses(
															'driver2EmployeeId',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'driver2EmployeeId',
																).label
															}
														>
															Driver 2
														</th>
													)}
													{drafts.map((d, ci) => (
														<td
															key={ci}
															className={plannerCellCls(
																'driver2EmployeeId',
															)}
														>
															<div className='min-w-0'>
																{renderCell(
																	d,
																	ci,
																	'driver2EmployeeId',
																)}
															</div>
														</td>
													))}
												</tr>

												{/* Remarks row */}
												<tr
													className={
														getRowThemeClasses(
															'remarks',
														).row
													}
												>
													{showRowLabels && (
														<th
															className={
																getRowThemeClasses(
																	'remarks',
																).label
															}
														>
															Remarks
														</th>
													)}
													{drafts.map((d, ci) => (
														<td
															key={ci}
															className={plannerCellCls(
																'remarks',
															)}
														>
															<div className='min-w-0'>
																{renderCell(
																	d,
																	ci,
																	'remarks',
																)}
															</div>
														</td>
													))}
												</tr>
											</>
										)}
									</tbody>
								</table>
							</div>
						</section>

						{showWorkerRail ? (
							<Card
								className='flex min-h-screen flex-col overflow-hidden xl:sticky xl:top-4'
								style={
									workerRailMaxHeight != null
										? { maxHeight: workerRailMaxHeight }
										: undefined
								}
							>
								<CardHeader className='shrink-0 space-y-1 pb-2'>
									<CardTitle className='text-base'>
										Worker pool
									</CardTitle>
									<CardDescription>
										{`${unassignedWorkers.length} unassigned${workerPool.length > 0 ? ` of ${workerPool.length} workers` : ''}`}
									</CardDescription>
								</CardHeader>
								<CardContent className='flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0 pt-0'>
									<div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4'>
										<div className='flex flex-col gap-2'>
											{workerPool.length === 0 ? (
												<p className='text-sm text-muted-foreground'>
													No active workers loaded.
												</p>
											) : unassignedWorkers.length ===
											  0 ? (
												<p className='text-sm text-muted-foreground'>
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
										<div className='shrink-0 border-t border-border bg-muted/30 px-6 py-3'>
											<p className='text-xs font-medium text-amber-800 dark:text-amber-200'>
												Multi-assigned
											</p>
											<div className='mt-2 flex flex-wrap gap-1'>
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
						<div className='border-b border-border px-5 py-4'>
							<h2 className='text-lg font-semibold text-foreground'>
								Schedule notes
							</h2>
							<p className='mt-1 text-sm text-muted-foreground'>
								Shared note for the whole day (separate from
								team remarks).
							</p>
						</div>
						<div className='px-5 py-4'>
							<textarea
								value={scheduleInfo}
								onChange={(e) =>
									setScheduleInfo(e.target.value)
								}
								disabled={dis}
								rows={3}
								placeholder='General notes for this schedule…'
								className={cn(
									SCHEDULE_GRID_FLAT_INPUT,
									'min-h-24 w-full resize-y py-2',
								)}
							/>
						</div>
					</section>

					<section className='relative z-0 w-full overflow-visible rounded-lg border border-border bg-card shadow-sm'>
						<div className='flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-end lg:justify-between'>
							<div className='min-w-0 space-y-1'>
								<h2 className='text-lg font-semibold text-foreground'>
									Driver trips
								</h2>
								<p className='text-sm text-muted-foreground'>
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
												className='py-8 text-center text-muted-foreground'
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
				title="Job is not active"
				description="This job must be active before it can be used on the schedule."
				size="sm"
				actions={
					<>
						<Button type="button" variant="outline" onClick={() => setPendingInactiveJob(null)} disabled={activatingJob}>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => void handleActivatePendingJob()}
							disabled={activatingJob || !canEditJob}
						>
							{activatingJob ? 'Activating…' : 'Activate job'}
						</Button>
					</>
				}
			>
				{pendingInactiveJob ? (
					<div className="space-y-2 text-sm text-muted-foreground">
						<p>
							<span className="font-medium text-foreground">{pendingInactiveJob.jobNumber}</span> is currently{' '}
							<span className="font-medium text-foreground">{prettyJobStatus(pendingInactiveJob.status)}</span>.
						</p>
						<p>Activate this job to assign it to the team, or cancel to keep the current selection.</p>
						{!canEditJob ? (
							<p className="text-destructive">You do not have permission to activate jobs. Ask someone with job edit access.</p>
						) : null}
					</div>
				) : null}
			</Modal>

			<Modal
				isOpen={Boolean(pendingStaleJob)}
				onClose={handleDismissStaleJob}
				title="Job changed outside schedule"
				description="This team still has a job that is no longer active."
				size="sm"
				actions={
					<>
						<Button type="button" variant="outline" onClick={handleDismissStaleJob} disabled={activatingJob}>
							Keep for now
						</Button>
						{pendingStaleJob?.status === 'ON_HOLD' && canEditJob ? (
							<Button type="button" variant="secondary" onClick={() => void handleActivateStaleJob()} disabled={activatingJob}>
								{activatingJob ? 'Activating…' : 'Activate job'}
							</Button>
						) : null}
						<Button type="button" variant="destructive" onClick={handleClearStaleJob} disabled={activatingJob}>
							Clear from team
						</Button>
					</>
				}
			>
				{pendingStaleJob ? (
					<div className="space-y-2 text-sm text-muted-foreground">
						<p>
							<span className="font-medium text-foreground">{pendingStaleJob.jobNumber}</span> was marked{' '}
							<span className="font-medium text-foreground">{prettyJobStatus(pendingStaleJob.status)}</span> elsewhere
							(for example Jobs quick edit).
						</p>
						<p>Clear it from this team or re-activate the job before continuing.</p>
					</div>
				) : null}
			</Modal>
		</div>
  );
}
