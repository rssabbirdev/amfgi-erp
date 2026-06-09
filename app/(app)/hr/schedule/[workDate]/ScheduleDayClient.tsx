'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
import ScheduleAbsencesPanel from '@/components/hr/ScheduleAbsencesPanel';
import ScheduleSearchSelect from '@/components/hr/ScheduleSearchSelect';
import {
  parseScheduleTeamDropId,
  parseScheduleWorkerDragId,
  ScheduleFlatTeamDropSurface,
  ScheduleTeamDropZone,
  ScheduleWorkerDraggableCard,
  scheduleTeamDropId,
} from '@/components/hr/ScheduleWorkerDnD';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import type { EmployeeTypeTimingSetting } from '@/lib/hr/employeeTypeSettings';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import {
  fetchActiveEmployeesForSchedule,
  fetchEmployeesByIds,
  fetchJobById,
  fetchJobsByIds,
  jobToSearchItem,
  searchJobsApi,
  type ScheduleEmployeeRow,
  type ScheduleJobRow,
} from '@/lib/hr/scheduleSearchApi';
import type { WorkScheduleContext } from '@/lib/utils/templateData';
import {
  WORK_SCHEDULE_PRINT_CHANNEL,
  WORK_SCHEDULE_PRINT_PAYLOAD_KEY,
  type WorkSchedulePrintPayload,
} from '@/lib/utils/printTemplateSession';
import toast from 'react-hot-toast';
import { Copy, Redo2, Trash2, Undo2 } from 'lucide-react';

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
  customerName?: string | null;
  description?: string | null;
  projectDetails?: string | null;
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

const TEAM_COLUMN_CLASS = 'min-w-[13rem] w-[13rem] align-top';
const STICKY_ROW_LABEL_CLASS =
  'sticky left-0 z-20 min-w-[8rem] w-[8rem] border-r border-border bg-muted px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)]';

/** In-grid controls — matches shadcn Input sizing. */
const SCHEDULE_GRID_FLAT_INPUT =
  'flex h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const SCHEDULE_GRID_SEARCH_INPUT =
  '!h-9 !rounded-md !border !border-border !bg-background !px-2 !text-sm focus-visible:!ring-2 focus-visible:!ring-ring min-w-0';

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
    members: [],
  };
}

function normalizeMemberList(members: MemberRow[]): MemberRow[] {
  return members.map((member, index) => ({
    employeeId: String(member.employeeId ?? ''),
    role: member.role === 'HELPER' || member.role === 'TEAM_LEADER' ? member.role : 'WORKER',
    slot: index + 1,
  }));
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
    members: splitMode ? [] : baseMembers,
    subTeams: splitMode ? subTeams : [],
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
    members: [],
    subTeams: [],
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
  { key: 'jobCompany', label: 'Customer / reference' },
  { key: 'workProcessDetails', label: 'Work process details' },
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
  const [draggingWorkerId, setDraggingWorkerId] = useState('');
  const [workerDragSessionActive, setWorkerDragSessionActive] = useState(false);
  const [activeDropColumn, setActiveDropColumn] = useState<number | null>(null);
  const [activeDropSubTeam, setActiveDropSubTeam] = useState<number | null>(null);
  const isWorkerDragActive = workerDragSessionActive;
  const workerDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [undoStack, setUndoStack] = useState<AsgDraft[][]>([]);
  const [redoStack, setRedoStack] = useState<AsgDraft[][]>([]);
  const suspendHistoryRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const draftsRef = useRef<AsgDraft[]>([]);
  const teamBoardBodyRef = useRef<HTMLDivElement>(null);
  const [workerRailMaxHeight, setWorkerRailMaxHeight] = useState<number | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.schedule.view');
  const canEdit = isSA || perms.includes('hr.schedule.edit');
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

  const teamHeaderCls = (colIdx: number) =>
    cn(
      TEAM_COLUMN_CLASS,
      'sticky top-0 z-20 border-b border-border bg-muted px-3 py-3 text-left align-top',
      getColumnDragDimmedCls(colIdx),
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
      const next = new Map(prev);
      for (const row of rows) next.set(row.id, row as JobOpt);
      return next;
    });
  }, []);

  const getEmployee = useCallback((id: string) => (id ? employeeById.get(id) : undefined), [employeeById]);
  const getJob = useCallback((id: string) => (id ? jobById.get(id) : undefined), [jobById]);

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
  }, []);

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
      return [
        ...prev,
        createEmptyDraft(
          prev.length ? Math.max(...prev.map((x) => x.columnIndex)) + 1 : 1,
          `Team#${nextNumber}`
        ),
      ];
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
            members: normalizeMemberList(row.subTeams.flatMap((subTeam) => subTeam.members)),
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
              members: normalizeMemberList(row.members),
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
        return {
          ...row,
          members: row.members.map((member, index) =>
            index === memberIndex ? { ...member, employeeId, slot: memberIndex + 1 } : member
          ),
        };
      })
    );

  const addFlatMember = (colIdx: number, employeeId = '') =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || row.splitMode) return row;
        if (employeeId && getDraftAssignedIds(row).has(employeeId)) return row;
        const emptyIndex = row.members.findIndex((member) => !member.employeeId);
        if (emptyIndex >= 0) {
          return {
            ...row,
            members: row.members.map((member, index) =>
              index === emptyIndex ? { ...member, employeeId, slot: index + 1 } : member
            ),
          };
        }
        return {
          ...row,
          members: [
            ...row.members,
            { employeeId, role: 'WORKER' as const, slot: row.members.length + 1 },
          ],
        };
      })
    );

  const removeFlatMember = (colIdx: number, memberIndex: number) =>
    applyDrafts((rows) =>
      rows.map((row, idx) =>
        idx === colIdx && !row.splitMode
          ? {
              ...row,
              members: normalizeMemberList(row.members.filter((_, index) => index !== memberIndex)),
            }
          : row
      )
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
                  members: subTeam.members.map((member, innerIndex) =>
                    innerIndex === memberIndex
                      ? { ...member, employeeId, slot: memberIndex + 1 }
                      : member
                  ),
                }
              : subTeam
          ),
        };
      })
    );

  const addSubTeamMember = (colIdx: number, subTeamIndex: number, employeeId = '') =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !row.splitMode) return row;
        if (employeeId && getDraftAssignedIds(row).has(employeeId)) return row;
        return {
          ...row,
          subTeams: row.subTeams.map((subTeam, index) => {
            if (index !== subTeamIndex) return subTeam;
            const emptyIndex = subTeam.members.findIndex((member) => !member.employeeId);
            if (emptyIndex >= 0) {
              return {
                ...subTeam,
                members: subTeam.members.map((member, innerIndex) =>
                  innerIndex === emptyIndex
                    ? { ...member, employeeId, slot: innerIndex + 1 }
                    : member
                ),
              };
            }
            return {
              ...subTeam,
              members: [
                ...subTeam.members,
                { employeeId, role: 'WORKER' as const, slot: subTeam.members.length + 1 },
              ],
            };
          }),
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
                  members: normalizeMemberList(subTeam.members.filter((_, innerIndex) => innerIndex !== memberIndex)),
                }
              : subTeam
          ),
        };
      })
    );

  const addWorkerToTeam = (colIdx: number, employeeId: string) =>
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx || !employeeId) return row;
        if (getDraftAssignedIds(row).has(employeeId)) return row;
        if (!row.splitMode) {
          const emptyIndex = row.members.findIndex((member) => !member.employeeId);
          if (emptyIndex >= 0) {
            return {
              ...row,
              members: row.members.map((member, index) =>
                index === emptyIndex ? { ...member, employeeId, slot: index + 1 } : member
              ),
            };
          }
          return {
            ...row,
            members: [...row.members, { employeeId, role: 'WORKER' as const, slot: row.members.length + 1 }],
          };
        }
        const targetIndex = row.subTeams.length > 0 ? row.subTeams.length - 1 : 0;
        const nextSubTeams = row.subTeams.length > 0 ? row.subTeams : [createEmptySubTeam(0)];
        return {
          ...row,
          splitMode: true,
          members: [],
          subTeams: nextSubTeams.map((subTeam, index) =>
            index === targetIndex
              ? {
                  ...subTeam,
                  members: [...subTeam.members, { employeeId, role: 'WORKER' as const, slot: subTeam.members.length + 1 }],
                }
              : subTeam
          ),
        };
      })
    );

  const endWorkerDragSession = useCallback(() => {
    setDraggingWorkerId('');
    setWorkerDragSessionActive(false);
    setActiveDropColumn(null);
    setActiveDropSubTeam(null);
  }, []);

  const assignWorkerToSubTeam = (colIdx: number, subTeamIndex: number, employeeId: string) => {
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx) return row;
        if (!row.splitMode) {
          if (getDraftAssignedIds(row).has(employeeId)) return row;
          const emptyIndex = row.members.findIndex((member) => !member.employeeId);
          if (emptyIndex >= 0) {
            return {
              ...row,
              members: row.members.map((member, index) =>
                index === emptyIndex ? { ...member, employeeId, slot: index + 1 } : member
              ),
            };
          }
          return {
            ...row,
            members: [...row.members, { employeeId, role: 'WORKER' as const, slot: row.members.length + 1 }],
          };
        }
        if (getDraftAssignedIds(row).has(employeeId)) return row;
        const nextSubTeams = [...row.subTeams];
        while (nextSubTeams.length <= subTeamIndex) {
          nextSubTeams.push(createEmptySubTeam(nextSubTeams.length));
        }
        return {
          ...row,
          members: [],
          subTeams: nextSubTeams.map((subTeam, index) => {
            if (index !== subTeamIndex) return subTeam;
            const emptyIndex = subTeam.members.findIndex((member) => !member.employeeId);
            if (emptyIndex >= 0) {
              return {
                ...subTeam,
                members: subTeam.members.map((member, innerIndex) =>
                  innerIndex === emptyIndex
                    ? { ...member, employeeId, slot: innerIndex + 1 }
                    : member
                ),
              };
            }
            return {
              ...subTeam,
              members: [
                ...subTeam.members,
                { employeeId, role: 'WORKER' as const, slot: subTeam.members.length + 1 },
              ],
            };
          }),
        };
      })
    );
  };

  const handleScheduleWorkerDragStart = useCallback(
    (event: DragStartEvent) => {
      if (dis) return;
      const employeeId = parseScheduleWorkerDragId(event.active.id);
      if (!employeeId) return;
      setDraggingWorkerId(employeeId);
      setWorkerDragSessionActive(true);
      setActiveDropColumn(null);
      setActiveDropSubTeam(null);
    },
    [dis],
  );

  const handleScheduleWorkerDragOver = useCallback((event: DragOverEvent) => {
    const target = event.over ? parseScheduleTeamDropId(event.over.id) : null;
    if (!target) {
      setActiveDropColumn(null);
      setActiveDropSubTeam(null);
      return;
    }
    setActiveDropColumn(target.colIdx);
    setActiveDropSubTeam(target.subTeamIndex);
  }, []);

  const handleScheduleWorkerDragEnd = (event: DragEndEvent) => {
    const employeeId = parseScheduleWorkerDragId(event.active.id);
    const target = event.over ? parseScheduleTeamDropId(event.over.id) : null;
    endWorkerDragSession();
    if (dis || !employeeId || !target) return;

    const draft = draftsRef.current[target.colIdx];
    if (!draft) return;

    if (draft.splitMode || target.subTeamIndex !== null) {
      assignWorkerToSubTeam(target.colIdx, target.subTeamIndex ?? 0, employeeId);
      return;
    }
    addWorkerToTeam(target.colIdx, employeeId);
  };

  const handleScheduleWorkerDragCancel = useCallback(() => {
    endWorkerDragSession();
  }, [endWorkerDragSession]);

  const draggingWorkerOverlay = useMemo(() => {
    if (!draggingWorkerId) return null;
    const employee = employeeById.get(draggingWorkerId);
    if (!employee) return null;
    return employee;
  }, [draggingWorkerId, employeeById]);

  const getColumnDragDimmedCls = useCallback(
    (colIdx: number) => {
      if (!isWorkerDragActive) return '';
      const isTargetColumn = activeDropColumn === colIdx;
      return cn(
        'select-none transition-all duration-150',
        isTargetColumn ? 'opacity-30 blur-[3px] saturate-50' : 'opacity-50 blur-[1.5px]',
      );
    },
    [activeDropColumn, isWorkerDragActive],
  );

  const getWorkersColumnDragCls = useCallback(
    (colIdx: number) => {
      if (!isWorkerDragActive) return '';
      const isTargetColumn = activeDropColumn === colIdx;
      return cn(
        'relative z-10',
        isTargetColumn ? 'bg-primary/5' : 'opacity-80',
      );
    },
    [activeDropColumn, isWorkerDragActive],
  );

  const isColumnFieldLocked = useCallback(
    (colIdx: number) => isWorkerDragActive && activeDropColumn === colIdx,
    [activeDropColumn, isWorkerDragActive],
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

  const labourDefaultTiming = useMemo(
    () =>
      labourTypeTiming
        ? {
            dutyStart: labourTypeTiming.dutyStart,
            dutyEnd: labourTypeTiming.dutyEnd,
            breakStart: labourTypeTiming.breakStart,
            breakEnd: labourTypeTiming.breakEnd,
          }
        : null,
    [labourTypeTiming]
  );

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

  function fillTimingTemplate(colIdx: number, mode: 'worker' | 'clear') {
    applyDrafts((rows) =>
      rows.map((row, idx) => {
        if (idx !== colIdx) return row;
        if (mode === 'clear') {
          return {
            ...row,
            dutyStart: '',
            dutyEnd: '',
            breakStart: '',
            breakEnd: '',
            };
          }
          return applyTimingFromTemplate(row, labourDefaultTiming);
        })
    );
  }

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

  const renderWorkerDropAreas = (draft: AsgDraft, colIdx: number) => (
    <div className="flex min-h-32 flex-col gap-2">
      {[0, 1].map((subTeamIndex) => (
        <ScheduleTeamDropZone
          key={`sub-drop-${subTeamIndex}`}
          dropId={scheduleTeamDropId(colIdx, subTeamIndex)}
          label={draft.subTeams[subTeamIndex]?.label?.trim() || `Sub-team ${subTeamIndex + 1}`}
          isHighlighted={
            isWorkerDragActive &&
            activeDropColumn === colIdx &&
            activeDropSubTeam === subTeamIndex
          }
        />
      ))}
    </div>
  );

  const renderCell = (d: AsgDraft, colIdx: number, fieldKey: string) => {
    const fieldDisabled = dis || isColumnFieldLocked(colIdx);

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
              const job = getJob(jid);
              const nextWorkProcess = getInitialWorkProcessDetails(job);
              upd(colIdx, {
                jobId: jid,
                jobNumberSnapshot: jid ? job?.jobNumber ?? d.jobNumberSnapshot : '',
                workProcessDetails: nextWorkProcess,
              });
            }}
            search={async (query) => {
              const rows = await searchJobsApi({ search: query, status: 'ACTIVE' });
              mergeJobs(rows);
              return rows.map(jobToSearchItem);
            }}
            resolveById={async (id) => {
              const cached = getJob(id);
              if (cached) return jobToSearchItem(cached);
              const row = await fetchJobById(id);
              if (!row) return null;
              mergeJobs([row]);
              return jobToSearchItem(row);
            }}
            placeholder="Type to search variation…"
            disabled={fieldDisabled}
            minCharactersToSearch={1}
            inputProps={scheduleSearchInputProps(getGridNavProps(NAV_ROW.job, colIdx + 1))}
            renderItem={(item, isHighlighted) => (
              <div className="space-y-0.5">
                <div className={cn('font-medium', isHighlighted ? 'text-primary' : 'text-foreground')}>{item.label}</div>
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
        return (
          <div className="flex min-h-9 items-center px-2 py-1.5">
            <span className="truncate text-xs text-foreground/90" title={job?.customerName || undefined}>
              {job?.customerName?.trim() || '—'}
            </span>
          </div>
        );
      }
      case 'workProcessDetails': {
        const job = getJob(d.jobId);
        const resolvedWorkProcess = resolveWorkProcessDetails(d.workProcessDetails, job);
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
            {resolvedWorkProcess ? (
              <p className="text-[10px] text-muted-foreground">
                This value is loaded from the job and will update the job when you save.
              </p>
            ) : null}
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
                <input type="time" value={d.dutyStart} onChange={(e) => upd(colIdx, { dutyStart: e.target.value })} disabled={fieldDisabled} className={gridFlatInputCls} {...getGridNavProps(NAV_ROW.duty, colIdx + 1, 0)} />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Duty out</p>
                <input type="time" value={d.dutyEnd} onChange={(e) => upd(colIdx, { dutyEnd: e.target.value })} disabled={fieldDisabled} className={gridFlatInputCls} {...getGridNavProps(NAV_ROW.duty, colIdx + 1, 1)} />
              </div>
            </div>
            {!dis && (
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => fillTimingTemplate(colIdx, 'worker')} className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
                  Use worker default
                </button>
                <button type="button" onClick={() => fillTimingTemplate(colIdx, 'clear')} className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
                  Clear timing
                </button>
              </div>
            )}
          </div>
        );
      case 'breakRange':
        return (
          <div className="grid grid-cols-2 gap-1 px-2 py-1.5">
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Break out</p>
              <input type="time" value={d.breakStart} onChange={(e) => upd(colIdx, { breakStart: e.target.value })} disabled={dis} className={gridFlatInputCls} {...getGridNavProps(NAV_ROW.break, colIdx + 1, 0)} />
            </div>
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Break in</p>
              <input type="time" value={d.breakEnd} onChange={(e) => upd(colIdx, { breakEnd: e.target.value })} disabled={dis} className={gridFlatInputCls} {...getGridNavProps(NAV_ROW.break, colIdx + 1, 1)} />
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
    const fieldDisabled = dis || isColumnFieldLocked(colIdx);

    return (
      <div className="min-w-0 space-y-2">
        {!dis && !isWorkerDragActive && (
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
              return (
                <div key={`flat-worker-${memberIndex}`} className={`flex items-center gap-1 ${isMulti ? 'rounded ring-2 ring-amber-400/60' : ''}`}>
                  <div className="flex-1">
                    <SearchSelect
                      items={getSelectableWorkerItems(draft, { excludeFlatMemberIndex: memberIndex })}
                      value={member.employeeId}
                      onChange={(value) => updateFlatMember(colIdx, memberIndex, value)}
                      placeholder={memberIndex === 0 ? 'Team Leader' : `Worker ${memberIndex}`}
                      disabled={fieldDisabled}
                      minCharactersToSearch={1}
                      inputProps={{ className: SCHEDULE_GRID_SEARCH_INPUT }}
                    />
                  </div>
                  {!dis && !isWorkerDragActive && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeFlatMember(colIdx, memberIndex)}
                      title="Remove worker"
                      aria-label="Remove worker"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
            {!dis && !isWorkerDragActive && (
              <button
                type="button"
                onClick={() => addFlatMember(colIdx)}
                className="text-xs font-semibold text-primary hover:underline"
                {...getGridNavProps(NAV_ROW.workers, colIdx + 1)}
              >
                + Add worker
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {draft.subTeams.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Add a sub-team to start splitting this team.</p>
            )}
            {draft.subTeams.map((subTeam, subTeamIndex) => (
              <div key={subTeam.id} className={blockCls}>
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <input
                    value={subTeam.label}
                    onChange={(e) => updateSubTeamMeta(colIdx, subTeamIndex, { label: e.target.value })}
                    disabled={fieldDisabled}
                    className={cn(gridFlatInputCls, 'min-w-36 flex-1')}
                    placeholder={nextSubTeamLabel(subTeamIndex)}
                  />
                  {!dis && !isWorkerDragActive && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => removeSubTeam(colIdx, subTeamIndex)}>
                      Remove
                    </Button>
                  )}
                </div>
                <div className="mt-1.5 space-y-1">
                  {subTeam.members.map((member, memberIndex) => {
                    const isMulti = member.employeeId ? multiAssigned.has(member.employeeId) : false;
                    return (
                      <div key={`${subTeam.id}-member-${memberIndex}`} className={`flex items-center gap-1 ${isMulti ? 'rounded ring-2 ring-amber-400/60' : ''}`}>
                        <div className="flex-1">
                          <SearchSelect
                            items={getSelectableWorkerItems(draft, {
                              excludeSubTeamIndex: subTeamIndex,
                              excludeSubTeamMemberIndex: memberIndex,
                            })}
                            value={member.employeeId}
                            onChange={(value) => updateSubTeamMember(colIdx, subTeamIndex, memberIndex, value)}
                            placeholder={memberIndex === 0 ? 'Team Leader' : `Worker ${memberIndex}`}
                            disabled={fieldDisabled}
                            minCharactersToSearch={1}
                            inputProps={{ className: SCHEDULE_GRID_SEARCH_INPUT }}
                          />
                        </div>
                        {!dis && !isWorkerDragActive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => removeSubTeamMember(colIdx, subTeamIndex, memberIndex)}
                            title="Remove worker"
                            aria-label="Remove worker"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {!dis && !isWorkerDragActive && (
                    <button type="button" onClick={() => addSubTeamMember(colIdx, subTeamIndex)} className="text-xs text-emerald-400 hover:text-emerald-300">
                      + Add worker
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR planning</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Day schedule · {workDateLabel}</h1>
          {schedule ? (
            <p className="text-sm text-muted-foreground">
              {scheduleSummary.groups} teams · {scheduleSummary.workers} workers ·{' '}
              {scheduleSummary.groupsWithTiming} with timing
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
            <Badge variant="outline" className="tabular-nums">
              {drafts.length} teams
            </Badge>
          ) : null}
          {schedule && canEdit && !locked ? (
            <>
              <select
                value={selectedTemplateDate}
                onChange={(e) => setSelectedTemplateDate(e.target.value)}
                className={cn(SCHEDULE_GRID_FLAT_INPUT, 'h-9 w-auto min-w-40')}
                aria-label="Copy schedule from date"
              >
                <option value="">Copy from date…</option>
                {previousSchedules.map((item) => (
                  <option key={item.id} value={item.workDate}>
                    {item.workDate} ({item.status})
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyPreviousScheduleTemplate}
                disabled={!selectedTemplateDate}
              >
                Apply template
              </Button>
              <Separator orientation="vertical" className="hidden h-6 sm:block" />
            </>
          ) : null}
          {schedule && canEdit && !locked ? (
            <Button type="button" size="sm" variant="secondary" onClick={saveAssignments} disabled={saving}>
              {saving ? 'Saving…' : 'Save schedule'}
            </Button>
          ) : null}
          {schedule && canPub && status === 'DRAFT' ? (
            <Button type="button" size="sm" onClick={publish}>
              Publish
            </Button>
          ) : null}
        </div>
      </header>

      {!schedule && canEdit ? (
        <Alert>
          <AlertDescription>
            No schedule for this date. Create a draft to start planning teams and assignments.
          </AlertDescription>
        </Alert>
      ) : null}
      {!schedule && canEdit ? (
        <Button type="button" size="sm" onClick={createSchedule}>
          Create schedule draft
        </Button>
      ) : null}

      {schedule ? (
        <DndContext
          sensors={workerDragSensors}
          onDragStart={handleScheduleWorkerDragStart}
          onDragOver={handleScheduleWorkerDragOver}
          onDragEnd={handleScheduleWorkerDragEnd}
          onDragCancel={handleScheduleWorkerDragCancel}
        >
        <div
          className={cn(
            'grid gap-5',
            showWorkerRail
              ? 'xl:grid-cols-[1fr_17rem] xl:items-stretch'
              : 'grid-cols-1',
          )}
        >
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Team board</h2>
                <p className="text-sm text-muted-foreground">
                  {drafts.length} team{drafts.length === 1 ? '' : 's'} — scroll horizontally to view all columns
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && !locked ? (
                  <Button type="button" size="sm" onClick={addColumn}>
                    Add team
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => void openSchedulePrintOutput('print')}>
                  Print
                </Button>
                <Separator orientation="vertical" className="hidden h-6 sm:block" />
                <Button type="button" variant="outline" size="sm" onClick={() => setShowWorkerRail((c) => !c)}>
                  {showWorkerRail ? 'Hide workers' : 'Workers'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowRowLabels((c) => !c)}>
                  {showRowLabels ? 'Hide labels' : 'Labels'}
                </Button>
                <Button
                  type="button"
                  variant={useLightGridTheme ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setUseLightGridTheme((c) => !c)}
                >
                  {useLightGridTheme ? 'Plain rows' : 'Color rows'}
                </Button>
                {canEdit && !locked ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={undo}
                      disabled={undoStack.length === 0}
                      title="Undo"
                      aria-label="Undo"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={redo}
                      disabled={redoStack.length === 0}
                      title="Redo"
                      aria-label="Redo"
                    >
                      <Redo2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
                <Button type="button" variant="ghost" size="sm" disabled={!canZoomOut} onClick={() => setViewScale((s) => Math.max(0.8, Math.round((s - 0.05) * 100) / 100))}>
                  −
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round(viewScale * 100)}%</span>
                <Button type="button" variant="ghost" size="sm" disabled={!canZoomIn} onClick={() => setViewScale((s) => Math.min(1.35, Math.round((s + 0.05) * 100) / 100))}>
                  +
                </Button>
              </div>
            </div>

            <div
              ref={teamBoardBodyRef}
              className="isolate overflow-x-auto"
              style={{ zoom: viewScale } as CSSProperties}
            >
              <table className="w-max min-w-full border-collapse text-sm">
                <thead className="border-b border-border bg-muted">
                  <tr>
                    {showRowLabels ? (
                      <th
                        scope="col"
                        className={cn(STICKY_ROW_LABEL_CLASS, 'sticky top-0 z-30 align-middle bg-muted!')}
                      >
                        Field
                      </th>
                    ) : null}
                    {drafts.map((d, ci) => (
                      <th
                        key={ci}
                        scope="col"
                        className={teamHeaderCls(ci)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="shrink-0">
                            Team {d.columnIndex}
                          </Badge>
                          {canEdit && !locked ? (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => duplicateColumn(ci)}
                                title="Copy team"
                                aria-label="Copy team"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeColumn(ci)}
                                title="Remove team"
                                aria-label="Remove team"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                {drafts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={showRowLabels ? 1 : 1}
                      className="px-6 py-12 text-center text-sm text-muted-foreground"
                    >
                      <p className="text-sm font-semibold text-foreground">No teams on the board yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Add a team column to start planning jobs, workers, and timings.
                      </p>
                      {canEdit && !locked ? (
                        <Button type="button" size="sm" className="mt-4" onClick={addColumn}>
                          + Add first team
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ) : (
                  <>
                {FIELD_ROWS.map((f) => (
                  <tr key={f.key} className={getRowThemeClasses(f.key).row}>
                    {showRowLabels && <th className={getRowThemeClasses(f.key).label}>{f.label}</th>}
                    {drafts.map((d, ci) => (
                      <td
                        key={ci}
                        className={cn(plannerCellCls(f.key), getColumnDragDimmedCls(ci))}
                      >
                        <div className="min-w-0">{renderCell(d, ci, f.key)}</div>
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className={getRowThemeClasses('workers').row}>
                  {showRowLabels && <th className={getRowThemeClasses('workers').label}>Workers</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        plannerCellCls('workers'),
                        getWorkersColumnDragCls(ci),
                      )}
                    >
                      <div className="relative min-h-20 min-w-0">
                        {isWorkerDragActive ? (
                          <>
                            <div
                              className={cn(
                                'pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-md transition-all duration-150',
                                activeDropColumn === ci ? 'opacity-25 blur-xs' : 'opacity-40 blur-[2px]',
                              )}
                              aria-hidden
                            >
                              {renderWorkersCell(d, ci)}
                            </div>
                            {d.splitMode ? (
                              <div className="relative z-10 p-2">{renderWorkerDropAreas(d, ci)}</div>
                            ) : (
                              <ScheduleFlatTeamDropSurface
                                colIdx={ci}
                                isHighlighted={
                                  isWorkerDragActive &&
                                  activeDropColumn === ci &&
                                  activeDropSubTeam === null
                                }
                              />
                            )}
                          </>
                        ) : (
                          renderWorkersCell(d, ci)
                        )}
                      </div>
                    </td>
                  ))}
                </tr>

                <tr className={getRowThemeClasses('workerCount').row}>
                  {showRowLabels && <th className={getRowThemeClasses('workerCount').label}>Assigned workers</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={cn(plannerCellCls('workerCount'), getColumnDragDimmedCls(ci))}
                    >
                        <div className="inline-flex min-w-12 items-center justify-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                        {getDraftWorkerCount(d)}
                        </div>
                      </td>
                    ))}
                </tr>

                <tr className={getRowThemeClasses('suggestedWorkers').row}>
                  {showRowLabels && <th className={getRowThemeClasses('suggestedWorkers').label}>Suggested workers</th>}
                  {drafts.map((d, ci) => {
                    const job = getJob(d.jobId);
                    const required = parseJobExpertise(job);
                    const suggestions = suggestedWorkersByColumn.get(ci) ?? [];
                    return (
                      <td
                        key={ci}
                        className={cn(plannerCellCls('suggestedWorkers'), getColumnDragDimmedCls(ci))}
                      >
                        {required.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No job expertise configured yet.</p>
                        ) : suggestions.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No matching workers available.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {suggestions.slice(0, 8).map((w) => (
                              <button
                                key={w.id}
                                type="button"
                                disabled={dis || isColumnFieldLocked(ci)}
                                onClick={() => addWorkerToTeam(ci, w.id)}
                                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-300"
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

                <tr className={getRowThemeClasses('targetQty').row}>
                  {showRowLabels && <th className={getRowThemeClasses('targetQty').label}>Target Qty</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={cn(plannerCellCls('targetQty'), getColumnDragDimmedCls(ci))}
                    >
                      <div className="min-w-0">{renderCell(d, ci, 'targetQty')}</div>
                    </td>
                  ))}
                </tr>

                <tr className={getRowThemeClasses('driver1EmployeeId').row}>
                  {showRowLabels && <th className={getRowThemeClasses('driver1EmployeeId').label}>Driver 1</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={cn(plannerCellCls('driver1EmployeeId'), getColumnDragDimmedCls(ci))}
                    >
                      <div className="min-w-0">{renderCell(d, ci, 'driver1EmployeeId')}</div>
                    </td>
                  ))}
                </tr>

                <tr className={getRowThemeClasses('driver2EmployeeId').row}>
                  {showRowLabels && <th className={getRowThemeClasses('driver2EmployeeId').label}>Driver 2</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={cn(plannerCellCls('driver2EmployeeId'), getColumnDragDimmedCls(ci))}
                    >
                      <div className="min-w-0">{renderCell(d, ci, 'driver2EmployeeId')}</div>
                    </td>
                  ))}
                </tr>

                {/* Remarks row */}
                <tr className={getRowThemeClasses('remarks').row}>
                  {showRowLabels && <th className={getRowThemeClasses('remarks').label}>Remarks</th>}
                  {drafts.map((d, ci) => (
                    <td
                      key={ci}
                      className={cn(plannerCellCls('remarks'), getColumnDragDimmedCls(ci))}
                    >
                      <div className="min-w-0">{renderCell(d, ci, 'remarks')}</div>
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
              className="flex min-h-0 flex-col overflow-hidden xl:sticky xl:top-4"
              style={workerRailMaxHeight != null ? { maxHeight: workerRailMaxHeight } : undefined}
            >
              <CardHeader className="shrink-0 space-y-1 pb-2">
                <CardTitle className="text-base">Worker pool</CardTitle>
                <CardDescription>
                  {dis
                    ? 'Drag-and-drop is disabled while the schedule is locked or read-only.'
                    : `Drag onto a team column · ${unassignedWorkers.length} available${workerPool.length > 0 ? ` of ${workerPool.length} workers` : ''}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0 pt-0">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
                  <div className="flex flex-col gap-2">
                    {workerPool.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active workers loaded.</p>
                    ) : unassignedWorkers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">All workers are assigned to teams.</p>
                    ) : (
                      unassignedWorkers.map((e) => (
                        <ScheduleWorkerDraggableCard key={e.id} employee={e} disabled={dis} />
                      ))
                    )}
                  </div>
                </div>

                {multiAssigned.size > 0 ? (
                  <div className="shrink-0 border-t border-border bg-muted/30 px-6 py-3">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Multi-assigned</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...multiAssigned].map((id) => (
                        <Badge key={id} variant="outline" className="border-amber-500/40 text-amber-900 dark:text-amber-100">
                          {empName(id)} ×{empAssignCount.get(id)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <ScheduleAbsencesPanel
          scheduleId={schedule?.id ? String(schedule.id) : null}
          workDate={workDate}
          initialAbsences={
            ((schedule?.absences as Array<{ employeeId: string; reason?: string | null }>) ?? []).map((a) => ({
              employeeId: a.employeeId,
              reason: a.reason,
            }))
          }
          employees={employeeProfiles.map((e) => ({
            id: e.id,
            fullName: e.preferredName || e.fullName,
            employeeCode: e.employeeCode,
          }))}
          disabled={dis}
        />

        <section className="w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Schedule notes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Shared note for the whole day (separate from team remarks).
            </p>
          </div>
          <div className="px-5 py-4">
            <textarea
              value={scheduleInfo}
              onChange={(e) => setScheduleInfo(e.target.value)}
              disabled={dis}
              rows={3}
              placeholder="General notes for this schedule…"
              className={cn(SCHEDULE_GRID_FLAT_INPUT, 'min-h-24 w-full resize-y py-2')}
            />
          </div>
        </section>

        <section className="relative z-0 w-full overflow-visible rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Driver trips</h2>
              <p className="text-sm text-muted-foreground">
                All active drivers are listed below. Add route notes, extra drivers, or guest drivers (rental / hire).
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-88">
              <div className="relative z-20 flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchSelect
                  items={availableDriverItems}
                  value={selectedDriverToAdd}
                  onChange={(value) => {
                    setSelectedDriverToAdd(value);
                    addDriverTripRow(value);
                  }}
                  placeholder={
                    availableDriverItems.length > 0 ? 'Add another driver…' : 'All active drivers are on the list'
                  }
                  disabled={dis || availableDriverItems.length === 0}
                  minCharactersToSearch={0}
                  openOnFocus
                  dropdownInPortal
                  inputProps={{ className: SCHEDULE_GRID_FLAT_INPUT }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => addDriverTripRow(selectedDriverToAdd)}
                  disabled={dis || !selectedDriverToAdd}
                >
                  Add driver
                </Button>
              </div>
              <div className="relative z-20 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={guestDriverNameInput}
                  onChange={(e) => setGuestDriverNameInput(e.target.value)}
                  disabled={dis}
                  placeholder="Guest driver name (rental / hire)"
                  className={SCHEDULE_GRID_FLAT_INPUT}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGuestDriverTripRow(guestDriverNameInput);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => addGuestDriverTripRow(guestDriverNameInput)}
                  disabled={dis || !guestDriverNameInput.trim()}
                >
                  Add guest driver
                </Button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Route / order</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverTripRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      {driverPool.length === 0
                        ? 'No active drivers loaded.'
                        : 'Loading driver list…'}
                    </TableCell>
                  </TableRow>
                ) : (
                  driverTripRows.map((log, index) => {
                    const isGuest = Boolean(log.guestDriverName);
                    return (
                    <TableRow key={`${log.rowKey}-${index}`}>
                      <TableCell className="font-medium">
                        {isGuest ? (
                          <div className="space-y-1">
                            <Badge variant="outline" className="text-[10px]">
                              Guest
                            </Badge>
                            <Input
                              value={log.guestDriverName ?? ''}
                              onChange={(e) => updateGuestDriverName(log.rowKey, e.target.value)}
                              disabled={dis}
                              placeholder="Guest driver name"
                              className={SCHEDULE_GRID_FLAT_INPUT}
                            />
                          </div>
                        ) : (
                          empName(log.driverEmployeeId ?? '') || 'Driver'
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={log.routeText}
                          onChange={(e) =>
                            setDriverTripState((current) => ({
                              version: driverLogVersion,
                              values: {
                                ...(current.version === driverLogVersion ? current.values : {}),
                                [log.rowKey]: e.target.value,
                              },
                              guestNames: current.version === driverLogVersion ? current.guestNames : {},
                              selectedIds:
                                current.version === driverLogVersion
                                  ? current.selectedIds
                                  : driverTripRows.map((row) => row.rowKey),
                            }))
                          }
                          disabled={dis}
                          placeholder="Trip order / route"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDriverTripRow(log.rowKey)}
                          disabled={dis}
                          className="text-destructive hover:text-destructive"
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

        <DragOverlay dropAnimation={null}>
          {draggingWorkerOverlay ? (
            <ScheduleWorkerDraggableCard employee={draggingWorkerOverlay} isOverlay disabled />
          ) : null}
        </DragOverlay>
        </DndContext>
      ) : null}
    </div>
  );
}
