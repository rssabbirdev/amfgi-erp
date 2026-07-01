'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Redo2, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';

import AttendanceEntryGrid, {
  ATTENDANCE_EMPLOYEE_MONTH_GRID_PREFERENCE_KEY,
  type AttendanceGridAssignmentMeta,
  type AttendanceGridDraftRow,
  type AttendanceGridEmployee,
} from '@/components/hr/AttendanceEntryGrid';
import HrPageChrome from '@/components/hr/HrPageChrome';
import {
  defaultUnpaidLeaveTypeId,
  isDraftNonWorking,
  type LeaveTypeOption,
} from '@/lib/hr/attendanceDraftStatus';
import {
  assignmentFromAttendanceWorkAssignment,
  attendanceDraftRowKey,
  buildDraftForNewEmployeeDate,
  buildDraftFromExistingAttendanceRow,
  calculateWorkedMinutes,
  cloneDraftRows,
  collectSaveValidationIssues,
  combineDateAndTimeToIso,
  DAY_SHEET_FIELD_CLASS,
  draftsEqual,
  employeeDisplayName,
  formatHourValue,
  formatWorkDateLabel,
  hourIndicatorDotClass,
  sanitizeAbsentDraft,
  TOOLBAR_TAG_CLASS,
  type AttendanceAssignmentRow,
  type AttendanceSheetEmployee,
  type SaveValidationIssues,
} from '@/lib/hr/attendanceSheetModel';
import { daysInMonth } from '@/lib/hr/payroll/calendar';
import {
  fetchJobById,
  jobToSearchItem,
  searchJobsApi,
  type ScheduleJobRow,
} from '@/lib/hr/scheduleSearchApi';
import { useJobLiveUpdate } from '@/lib/jobs/jobLiveUpdate';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';

type EmployeeListRow = AttendanceSheetEmployee & {
  employeeCode: string;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthDateBounds(month: string) {
  const lastDay = daysInMonth(month);
  return {
    min: `${month}-01`,
    max: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatMonthLabel(month: string) {
  try {
    const [year, part] = month.split('-');
    return new Date(Number(year), Number(part) - 1, 1).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return month;
  }
}

function employeeListLabel(employee: EmployeeListRow) {
  return `${employee.employeeCode} · ${employeeDisplayName(employee)}`;
}

function assignmentFromScheduleRaw(raw: Record<string, unknown>): AttendanceAssignmentRow {
  const job = (raw.job as Record<string, unknown> | null) ?? null;
  const customer = (job?.customer as Record<string, unknown> | null) ?? null;
  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    jobId: String(raw.jobId ?? job?.id ?? '').trim() || null,
    jobNumberSnapshot: String(raw.jobNumberSnapshot ?? job?.jobNumber ?? '').trim() || null,
    siteNameSnapshot: raw.siteNameSnapshot != null ? String(raw.siteNameSnapshot) : null,
    customerName: String(raw.clientNameSnapshot ?? customer?.name ?? '').trim() || null,
    siteName: String(raw.siteNameSnapshot ?? job?.site ?? '').trim() || null,
    projectDetails: String(raw.projectDetailsSnapshot ?? job?.projectDetails ?? '').trim() || null,
    shiftStart: (raw.shiftStart as string | null | undefined) ?? null,
    shiftEnd: (raw.shiftEnd as string | null | undefined) ?? null,
    breakWindow: (raw.breakWindow as string | null | undefined) ?? null,
    teamLeaderEmployeeId: (raw.teamLeaderEmployeeId as string | null | undefined) ?? null,
    driver1EmployeeId: (raw.driver1EmployeeId as string | null | undefined) ?? null,
    driver2EmployeeId: (raw.driver2EmployeeId as string | null | undefined) ?? null,
    members: Array.isArray(raw.members) ? (raw.members as AttendanceAssignmentRow['members']) : [],
  };
}

function datesInRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startYmd}T00:00:00.000Z`);
  const end = new Date(`${endYmd}T00:00:00.000Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function HrEmployeeAttendancePage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const canEdit = isSA || perms.includes('hr.attendance.edit');

  const [employeeDirectory, setEmployeeDirectory] = useState<EmployeeListRow[]>([]);
  const [employeeId, setEmployeeId] = useState(searchParams.get('employeeId') ?? '');
  const [month, setMonth] = useState(searchParams.get('month')?.slice(0, 7) || currentMonth());
  const [loadedKey, setLoadedKey] = useState('');
  const [employee, setEmployee] = useState<AttendanceSheetEmployee | null>(null);
  const [drafts, setDrafts] = useState<AttendanceGridDraftRow[]>([]);
  const [assignments, setAssignments] = useState<AttendanceAssignmentRow[]>([]);
  const [schedulesByDate, setSchedulesByDate] = useState<Map<string, AttendanceAssignmentRow[]>>(new Map());
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [leavePreviewByDate, setLeavePreviewByDate] = useState<Record<string, string>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'assigned' | 'exceptions'>('all');
  const [insertDate, setInsertDate] = useState('');
  const [includeAllJobs, setIncludeAllJobs] = useState(true);
  const [allJobOptions, setAllJobOptions] = useState<
    Array<{ value: string; label: string; searchText: string; customerName: string; siteName: string }>
  >([]);
  const [allJobsLoading, setAllJobsLoading] = useState(false);
  const [jobsById, setJobsById] = useState<Map<string, ScheduleJobRow>>(new Map());
  const [jobCatalogVersion, setJobCatalogVersion] = useState(0);
  const [saveValidationConfirm, setSaveValidationConfirm] = useState<SaveValidationIssues | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const dateBounds = useMemo(() => monthDateBounds(month), [month]);

  const draftsRef = useRef<AttendanceGridDraftRow[]>([]);
  const undoStackRef = useRef<AttendanceGridDraftRow[][]>([]);
  const redoStackRef = useRef<AttendanceGridDraftRow[][]>([]);
  const suspendHistoryRef = useRef(false);
  const editHistorySessionRef = useRef<{ rowKey: string | null; pushed: boolean }>({
    rowKey: null,
    pushed: false,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useJobLiveUpdate(useCallback(() => setJobCatalogVersion((version) => version + 1), []));

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    if (!canView) return;
    void fetch('/api/hr/employees?limit=500', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        const rows = Array.isArray(json?.data?.items)
          ? json.data.items
          : Array.isArray(json?.data)
            ? json.data
            : [];
        if (json?.success) setEmployeeDirectory(rows as EmployeeListRow[]);
      });
  }, [canView]);

  const syncHistoryUi = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const clearHistoryStacks = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    editHistorySessionRef.current = { rowKey: null, pushed: false };
    syncHistoryUi();
  }, [syncHistoryUi]);

  const pushUndoSnapshot = useCallback(
    (snapshot: AttendanceGridDraftRow[]) => {
      undoStackRef.current = [...undoStackRef.current.slice(-39), cloneDraftRows(snapshot)];
      redoStackRef.current = [];
      editHistorySessionRef.current = { rowKey: null, pushed: false };
      syncHistoryUi();
    },
    [syncHistoryUi]
  );

  const runWithoutHistory = useCallback((fn: () => void) => {
    suspendHistoryRef.current = true;
    fn();
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, []);

  const restoreDraftRows = useCallback((snapshot: AttendanceGridDraftRow[]) => {
    suspendHistoryRef.current = true;
    const restored = cloneDraftRows(snapshot);
    draftsRef.current = restored;
    setDrafts(restored);
    editHistorySessionRef.current = { rowKey: null, pushed: false };
    queueMicrotask(() => {
      suspendHistoryRef.current = false;
    });
  }, []);

  const applyDraftRows = useCallback(
    (updater: (current: AttendanceGridDraftRow[]) => AttendanceGridDraftRow[], options?: { recordUndo?: boolean }) => {
      const current = draftsRef.current;
      const next = updater(current);
      if (draftsEqual(next, current)) return;
      if (!suspendHistoryRef.current && options?.recordUndo !== false) {
        pushUndoSnapshot(current);
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

  const ensureScheduleForDate = useCallback(async (workDate: string) => {
    if (schedulesByDate.has(workDate)) return;
    const res = await fetch(`/api/hr/schedule?workDate=${encodeURIComponent(workDate)}`, { cache: 'no-store' });
    const json = await res.json();
    const scheduleData = res.ok && json?.success ? json.data : null;
    const dayAssignments: AttendanceAssignmentRow[] = Array.isArray(scheduleData?.assignments)
      ? scheduleData.assignments.map((raw: Record<string, unknown>) => assignmentFromScheduleRaw(raw))
      : [];
    setSchedulesByDate((prev) => {
      const next = new Map(prev);
      next.set(workDate, dayAssignments);
      return next;
    });
    if (dayAssignments.length > 0) {
      setAssignments((prev) => {
        const merged = new Map(prev.map((item) => [item.id, item]));
        for (const assignment of dayAssignments) merged.set(assignment.id, assignment);
        return [...merged.values()];
      });
    }
  }, [schedulesByDate]);

  const loadSheet = useCallback(async () => {
    if (!employeeId || !month) {
      toast.error('Select an employee and month');
      return;
    }
    setLoading(true);
    setPendingDeletes(new Set());

    const bounds = monthDateBounds(month);
    const [attendanceRes, employeeRes, leaveTypesRes, leaveRes] = await Promise.all([
      fetch(
        `/api/hr/attendance?employeeId=${encodeURIComponent(employeeId)}&month=${encodeURIComponent(month)}`,
        { cache: 'no-store' }
      ),
      fetch(`/api/hr/employees?ids=${encodeURIComponent(employeeId)}`, { cache: 'no-store' }),
      fetch('/api/hr/leave-types', { cache: 'no-store' }),
      fetch(
        `/api/hr/leave-requests?employeeId=${encodeURIComponent(employeeId)}&status=APPROVED&from=${encodeURIComponent(bounds.min)}&to=${encodeURIComponent(bounds.max)}`,
        { cache: 'no-store' }
      ),
    ]);

    const [attendanceJson, employeeJson, leaveTypesJson, leaveJson] = await Promise.all([
      attendanceRes.json(),
      employeeRes.json(),
      leaveTypesRes.json(),
      leaveRes.json(),
    ]);

    setLoading(false);

    if (!employeeRes.ok || !employeeJson?.success) {
      toast.error(employeeJson?.error ?? 'Employee not found');
      return;
    }

    const employeeRows = Array.isArray(employeeJson.data) ? employeeJson.data : [];
    const rawEmployee = employeeRows[0] as Record<string, unknown> | undefined;
    if (!rawEmployee) {
      toast.error('Employee not found');
      return;
    }

    const loadedLeaveTypes: LeaveTypeOption[] =
      leaveTypesRes.ok && leaveTypesJson?.success && Array.isArray(leaveTypesJson.data)
        ? (leaveTypesJson.data as LeaveTypeOption[]).filter((t) => t.isActive !== false)
        : [];
    setLeaveTypes(loadedLeaveTypes);

    const previewByDate: Record<string, string> = {};
    if (leaveRes.ok && leaveJson?.success && Array.isArray(leaveJson.data)) {
      for (const req of leaveJson.data as Array<{
        startDate: string;
        endDate: string;
        leaveTypeRef?: { name?: string } | null;
        leaveType?: string;
      }>) {
        const label = req.leaveTypeRef?.name ?? String(req.leaveType ?? 'Leave').replace(/_/g, ' ');
        const start = String(req.startDate).slice(0, 10);
        const end = String(req.endDate).slice(0, 10);
        for (const ymd of datesInRange(start, end)) {
          if (ymd >= bounds.min && ymd <= bounds.max) previewByDate[ymd] = label;
        }
      }
    }
    setLeavePreviewByDate(previewByDate);

    const rawEmployeeRecord = rawEmployee;
    const loadedEmployee: AttendanceSheetEmployee = {
      id: String(rawEmployeeRecord.id),
      fullName: String(rawEmployeeRecord.fullName ?? ''),
      preferredName: (rawEmployeeRecord.preferredName as string | null) ?? null,
      employeeCode: String(rawEmployeeRecord.employeeCode ?? ''),
      status: (rawEmployeeRecord.status as AttendanceSheetEmployee['status']) ?? 'ACTIVE',
      employeeType: (rawEmployeeRecord.employeeType as AttendanceSheetEmployee['employeeType']) ?? 'LABOUR_WORKER',
      basicHoursPerDay: Number(rawEmployeeRecord.basicHoursPerDay ?? 0) || undefined,
      defaultTiming: (rawEmployeeRecord.defaultTiming as AttendanceSheetEmployee['defaultTiming']) ?? null,
      profileExtension: rawEmployeeRecord.profileExtension,
    };
    setEmployee(loadedEmployee);

    const assignmentMap = new Map<string, AttendanceAssignmentRow>();
    const nextDrafts: AttendanceGridDraftRow[] = [];

    if (attendanceRes.ok && attendanceJson?.success && Array.isArray(attendanceJson.data?.items)) {
      for (const row of attendanceJson.data.items as Array<Record<string, unknown>>) {
        const workAssignment = (row.workAssignment as Record<string, unknown> | null) ?? null;
        if (workAssignment?.id) {
          const assignment = assignmentFromAttendanceWorkAssignment(workAssignment);
          assignmentMap.set(assignment.id, assignment);
        }
        nextDrafts.push(buildDraftFromExistingAttendanceRow(loadedEmployee, row, loadedLeaveTypes));
      }
    }

    setAssignments([...assignmentMap.values()]);
    setSchedulesByDate(new Map());
    runWithoutHistory(() => {
      clearHistoryStacks();
      draftsRef.current = nextDrafts;
      setDrafts(nextDrafts);
    });
    setLoadedKey(`${employeeId}:${month}`);

    void Promise.all(nextDrafts.map((draft) => (draft.workDate ? ensureScheduleForDate(draft.workDate) : Promise.resolve())));
  }, [clearHistoryStacks, employeeId, ensureScheduleForDate, month, runWithoutHistory]);

  const sheetReady = loadedKey === `${employeeId}:${month}` && employee !== null;

  const employeeById = useMemo(() => {
    const map = new Map<string, AttendanceGridEmployee>();
    if (employee) map.set(employee.id, employee);
    return map;
  }, [employee]);

  const assignmentsById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments]
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
          .filter((assignment): assignment is AttendanceAssignmentRow & { jobId: string } => Boolean(assignment.jobId))
          .map((assignment) => [assignment.id, assignment.jobId!])
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
      .catch(() => {
        if (!cancelled) setAllJobOptions([]);
      })
      .finally(() => {
        if (!cancelled) setAllJobsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeAllJobs, jobCatalogVersion, mergeJobs]);

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

  const assignmentOptionsForRow = useCallback(
    (draft: AttendanceGridDraftRow) => {
      const workDate = draft.workDate ?? '';
      const dayAssignments = schedulesByDate.get(workDate) ?? [];
      return dayAssignments.map((assignment) => ({
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
      }));
    },
    [schedulesByDate]
  );

  const existingDates = useMemo(
    () => new Set(drafts.map((draft) => draft.workDate).filter(Boolean) as string[]),
    [drafts]
  );

  const stats = useMemo(() => {
    return drafts.reduce(
      (acc, row) => {
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
  }, [drafts, employee?.basicHoursPerDay]);

  const visibleDrafts = useMemo(() => {
    return drafts
      .filter((draft) => {
        const assignment = draft.workAssignmentId ? assignmentsById.get(draft.workAssignmentId) : undefined;
        const externalJobMeta = draft.externalJobId ? externalJobMetaById.get(draft.externalJobId) : undefined;
        const dateLabel = draft.workDate ? formatWorkDateLabel(draft.workDate) : '';
        const matchesSearch =
          !deferredSearch ||
          [
            dateLabel,
            draft.workDate ?? '',
            draft.jobNumber,
            assignment?.customerName ?? externalJobMeta?.customerName ?? '',
            assignment?.siteName ?? externalJobMeta?.siteName ?? '',
            draft.status,
            draft.remarks ?? '',
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
      .sort((a, b) => String(a.workDate ?? '').localeCompare(String(b.workDate ?? '')));
  }, [assignmentsById, deferredSearch, drafts, externalJobMetaById, scopeFilter]);

  const patchDraftRow = useCallback(
    (rowKey: string, patch: Partial<AttendanceGridDraftRow>) => {
      if (!suspendHistoryRef.current) {
        const sessionState = editHistorySessionRef.current;
        if (sessionState.rowKey !== rowKey || !sessionState.pushed) {
          pushUndoSnapshot(draftsRef.current);
          editHistorySessionRef.current = { rowKey, pushed: true };
        }
      }
      applyDraftRows((prev) =>
        prev.map((draft) => {
          if (attendanceDraftRowKey(draft) !== rowKey) return draft;
          const next = sanitizeAbsentDraft({
            ...draft,
            ...patch,
            source: draft.source === 'existing' ? 'existing' : 'manual',
          });
          return next;
        })
      );
    },
    [applyDraftRows, pushUndoSnapshot]
  );

  const onWorkDateChange = useCallback(
    (rowKey: string, workDate: string) => {
      if (!workDate || existingDates.has(workDate)) {
        if (existingDates.has(workDate)) toast.error('A row already exists for that date');
        return;
      }
      patchDraftRow(rowKey, { workDate });
      void ensureScheduleForDate(workDate);
    },
    [ensureScheduleForDate, existingDates, patchDraftRow]
  );

  const onAssignmentChange = useCallback(
    (rowKey: string, assignmentId: string) => {
      const draft = draftsRef.current.find((row) => attendanceDraftRowKey(row) === rowKey);
      if (!employee || !draft) return;
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (!assignment) {
        patchDraftRow(rowKey, {
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
      const next = buildDraftForNewEmployeeDate(employee, draft.workDate ?? '', leaveTypes, assignment);
      patchDraftRow(rowKey, { ...next, workDate: draft.workDate, entryId: draft.entryId, source: draft.source });
    },
    [assignments, employee, leaveTypes, patchDraftRow]
  );

  const onAllJobsChange = useCallback(
    (rowKey: string, jobId: string) => {
      const draft = draftsRef.current.find((row) => attendanceDraftRowKey(row) === rowKey);
      if (!employee || !draft?.workDate) return;
      if (!jobId) {
        patchDraftRow(rowKey, {
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
        onAssignmentChange(rowKey, matchingAssignment.id);
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
        patchDraftRow(rowKey, {
          workAssignmentId: '',
          externalJobId: jobId,
          jobNumber: job?.jobNumber ?? '',
          status: 'PRESENT',
          leaveTypeId: null,
          source: 'manual',
        });
      })();
    },
    [assignments, employee, jobsById, leaveTypes, mergeJobs, onAssignmentChange, patchDraftRow]
  );

  const insertDateRow = () => {
    if (!employee || !insertDate) return;
    if (insertDate < dateBounds.min || insertDate > dateBounds.max) {
      toast.error('Date must be in the selected month');
      return;
    }
    if (existingDates.has(insertDate)) {
      toast.error('Attendance row already exists for that date');
      return;
    }
    applyDraftRows((prev) => [
      ...prev,
      buildDraftForNewEmployeeDate(employee, insertDate, leaveTypes),
    ]);
    setInsertDate('');
    void ensureScheduleForDate(insertDate);
  };

  const removeRow = useCallback(
    (rowKey: string) => {
      const target = draftsRef.current.find((draft) => attendanceDraftRowKey(draft) === rowKey);
      if (!target) return;
      if (target.leaveRequestId) {
        toast.error('This row is linked to leave management and cannot be removed here.');
        return;
      }
      if (target.entryId) {
        setPendingDeletes((prev) => new Set(prev).add(target.entryId!));
      }
      applyDraftRows((prev) => prev.filter((draft) => attendanceDraftRowKey(draft) !== rowKey));
    },
    [applyDraftRows]
  );

  const saveAll = async () => {
    if (!canEdit || !employee) return;
    if (drafts.length === 0 && pendingDeletes.size === 0) {
      toast.error('No attendance rows to save');
      return;
    }

    setSaving(true);
    try {
      for (const entryId of pendingDeletes) {
        const res = await fetch(`/api/hr/attendance/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? 'Delete failed');
        }
      }

      const byDate = new Map<string, AttendanceGridDraftRow[]>();
      for (const draft of drafts) {
        const workDate = draft.workDate?.trim();
        if (!workDate) continue;
        const group = byDate.get(workDate) ?? [];
        group.push(draft);
        byDate.set(workDate, group);
      }

      let affected = 0;
      for (const [workDate, rows] of byDate) {
        const payload = {
          workDate,
          rows: rows.map((draft) => {
            const isAbsent = draft.status === 'ABSENT';
            return {
              employeeId: employee.id,
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
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? 'Failed to save attendance');
        }
        affected += json.data?.affectedRows ?? 0;
      }

      toast.success(`Saved ${affected} attendance row${affected === 1 ? '' : 's'}`);
      setSaveValidationConfirm(null);
      setPendingDeletes(new Set());
      await loadSheet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (!canEdit || !employee) return;
    const issues = collectSaveValidationIssues(drafts, {
      labelForDraft: (draft) => (draft.workDate ? formatWorkDateLabel(draft.workDate) : 'New row'),
      isOnLeaveRow: (draft) =>
        employee.status === 'ON_LEAVE' || Boolean(draft.workDate && leavePreviewByDate[draft.workDate]),
      leaveLabelForDraft: (draft) => (draft.workDate ? leavePreviewByDate[draft.workDate] : undefined),
    });
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === 'z') {
        e.preventDefault();
        redo();
      } else if (!e.shiftKey && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y') redo();
        else undo();
      } else if (key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [redo, undo]);

  if (!canView) {
    return (
      <HrPageChrome>
        <Alert>
          <AlertDescription>You do not have permission to view HR attendance.</AlertDescription>
        </Alert>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <Link
              href="/hr/attendance"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              ← Attendance
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee attendance</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Same day-sheet editor as workforce attendance, scoped to one employee and month. Attendance records
              present or absent only; the Leave column previews approved leave from Leave management.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {sheetReady ? (
              <>
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
                    <Button type="button" variant="outline" size="sm" disabled={!canUndo} onClick={undo} className="h-7 px-2">
                      <Undo2 className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={!canRedo} onClick={redo} className="h-7 px-2">
                      <Redo2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
            <Link href="/hr/attendance" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              Cancel
            </Link>
            {canEdit && sheetReady ? (
              <Button type="submit" form="employee-attendance-form" size="sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save attendance'}
              </Button>
            ) : null}
          </div>
        </header>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_auto] lg:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee</label>
              <SearchSelect
                items={employeeDirectory.map((item) => ({
                  id: item.id,
                  label: employeeListLabel(item),
                  searchText: `${item.employeeCode} ${item.fullName} ${item.preferredName ?? ''}`,
                }))}
                value={employeeId}
                onChange={(value) => {
                  setEmployeeId(value);
                  setLoadedKey('');
                  setEmployee(null);
                  setDrafts([]);
                }}
                placeholder="Select employee…"
                minCharactersToSearch={0}
                openOnFocus
                dropdownInPortal
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="employee-attendance-month" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Month
              </label>
              <Input
                id="employee-attendance-month"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setLoadedKey('');
                  setEmployee(null);
                  setDrafts([]);
                }}
                className="h-10"
              />
            </div>
            <Button type="button" className="h-10" disabled={!employeeId || !month || loading} onClick={() => void loadSheet()}>
              {loading ? 'Loading…' : 'Load sheet'}
            </Button>
          </div>
        </section>

        {!sheetReady ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
            Select an employee and month, then click <strong className="text-foreground">Load sheet</strong> to open
            the attendance editor.
          </div>
        ) : loading ? (
          <div className="h-112 animate-pulse rounded-lg border border-border bg-muted/30" />
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
              <span className="font-medium text-foreground">{employeeListLabel(employee as EmployeeListRow)}</span>
              <span className="text-muted-foreground"> · {formatMonthLabel(month)}</span>
            </div>

            <form
              id="employee-attendance-form"
              onSubmit={(e) => {
                e.preventDefault();
                requestSave();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                  e.preventDefault();
                }
              }}
            >
              <AttendanceEntryGrid
                sheetMode="dates"
                gridPreferenceKey={ATTENDANCE_EMPLOYEE_MONTH_GRID_PREFERENCE_KEY}
                resolveRowKey={attendanceDraftRowKey}
                monthDateBounds={dateBounds}
                rows={visibleDrafts}
                employeesById={employeeById}
                assignmentsById={assignmentMetaById}
                assignmentJobIdByAssignmentId={assignmentJobIdByAssignmentId}
                externalJobMetaById={externalJobMetaById}
                assignmentOptions={[]}
                assignmentOptionsForRow={assignmentOptionsForRow}
                allJobOptions={allJobOptions}
                allJobsLoading={allJobsLoading}
                includeAllJobs={includeAllJobs}
                onIncludeAllJobsChange={setIncludeAllJobs}
                leaveTypes={leaveTypes}
                leavePreviewByRowKey={leavePreviewByDate}
                canEdit={canEdit}
                emptyMessage="No dates match the current filters."
                onUpdateRow={patchDraftRow}
                onAssignmentChange={onAssignmentChange}
                onAllJobsChange={onAllJobsChange}
                onWorkDateChange={onWorkDateChange}
                onRemoveRow={removeRow}
                filters={
                  <>
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search… (Ctrl+F)"
                      aria-label="Search dates"
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
                      <option value="all">All rows</option>
                      <option value="assigned">Assigned only</option>
                      <option value="exceptions">Exceptions only</option>
                    </select>
                    <Input
                      type="date"
                      min={dateBounds.min}
                      max={dateBounds.max}
                      value={insertDate}
                      onChange={(e) => setInsertDate(e.target.value)}
                      className={cn(DAY_SHEET_FIELD_CLASS, 'w-36')}
                      aria-label="Add work date"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      onClick={insertDateRow}
                      disabled={!insertDate || !canEdit}
                    >
                      Add date
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
          </>
        )}

        <Modal
          isOpen={saveValidationConfirm !== null}
          onClose={() => setSaveValidationConfirm(null)}
          title="Review before saving"
          size="md"
          actions={
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSaveValidationConfirm(null)}>
                Go back
              </Button>
              <Button type="button" size="sm" onClick={() => void saveAll()}>
                Save anyway
              </Button>
            </>
          }
        >
          {saveValidationConfirm ? (
            <div className="space-y-4 text-sm text-muted-foreground">
              {saveValidationConfirm.absentWithTiming.length > 0 ? (
                <div>
                  <p className="font-medium text-foreground">Absent rows still have timing filled in</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {saveValidationConfirm.absentWithTiming.map((row) => (
                      <li key={row.rowKey}>{row.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {saveValidationConfirm.presentHourWarnings.length > 0 ? (
                <div>
                  <p className="font-medium text-foreground">Unusual worked hours</p>
                  <ul className="mt-2 space-y-1">
                    {saveValidationConfirm.presentHourWarnings.map((row) => (
                      <li key={row.rowKey} className="flex items-center gap-2">
                        <span className={cn('size-2 rounded-sm', hourIndicatorDotClass(row.indicatorKind))} />
                        <span>
                          {row.label}: {row.workedLabel} ({row.indicatorLabel})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {saveValidationConfirm.onLeaveMarkedPresent.length > 0 ? (
                <div>
                  <p className="font-medium text-foreground">On leave but marked present</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {saveValidationConfirm.onLeaveMarkedPresent.map((row) => (
                      <li key={row.rowKey}>
                        {row.label} — {row.indicatorLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>
      </div>
    </HrPageChrome>
  );
}
