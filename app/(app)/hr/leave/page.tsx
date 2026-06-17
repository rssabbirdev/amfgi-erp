'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { deductFromBalanceFromRules, parseLeaveTypeRules } from '@/lib/hr/leaveTypeRules';
import { cn } from '@/lib/utils';
import { readApiJson } from '@/lib/utils/readApiResponse';

type LeaveRow = {
  id: string;
  leaveType: string;
  leaveTypeId: string | null;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
  submittedAt: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  dayCount: number;
  leaveTypeRef?: { id: string; name: string; code: string; rules?: unknown } | null;
  employee: { id: string; fullName: string; preferredName: string | null; employeeCode: string };
  reviewedBy?: { id: string; name: string | null } | null;
  balance?: {
    year: number;
    entitlementDays: number;
    usedDays: number;
    adjustedDays: number;
    remainingDays: number;
  };
};

type LeaveTypeOption = {
  id: string;
  name: string;
  code: string;
  isActive?: boolean;
  rules?: unknown;
};

type Stats = {
  pendingCount: number;
  approvedThisMonth: number;
  onLeaveToday: number;
  employeesOnLeaveStatus: number;
};

type EmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
};

type StatusFilter = 'PENDING' | 'APPROVED' | 'ALL';

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
    APPROVED: 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200',
    REJECTED: 'bg-red-500/15 text-red-900 dark:text-red-200',
    CANCELLED: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  };
  return map[status] ?? 'bg-slate-500/15';
}

function leaveTypeLabel(row: LeaveRow) {
  return row.leaveTypeRef?.name ?? row.leaveType.replace(/_/g, ' ');
}

function employeeName(employee: EmployeeOption | LeaveRow['employee']) {
  return employee.preferredName || employee.fullName;
}

function formatDateRange(start: string, end: string) {
  const s = String(start).slice(0, 10);
  const e = String(end).slice(0, 10);
  return s === e ? s : `${s} → ${e}`;
}

function leaveTypeDeductsBalance(type: LeaveTypeOption | undefined): boolean {
  if (!type) return false;
  if (type.code.toUpperCase() === 'ANNUAL') return true;
  return deductFromBalanceFromRules(parseLeaveTypeRules(type.rules));
}

function rowDeductsBalance(row: LeaveRow): boolean {
  if (row.leaveTypeRef) return leaveTypeDeductsBalance(row.leaveTypeRef as LeaveTypeOption);
  return row.leaveType === 'ANNUAL' || row.leaveType === 'ONE_DAY';
}

export default function HrLeavePage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canApprove = session?.user?.isSuperAdmin || perms.includes('hr.leave.approve');
  const canEdit = session?.user?.isSuperAdmin || perms.includes('hr.leave.edit');
  const canDelete = session?.user?.isSuperAdmin || perms.includes('hr.leave.delete');
  const canView =
    session?.user?.isSuperAdmin ||
    perms.includes('hr.leave.view') ||
    canApprove ||
    canEdit ||
    canDelete;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordEmployeeId, setRecordEmployeeId] = useState('');
  const [recordLeaveTypeId, setRecordLeaveTypeId] = useState('');
  const [recordStart, setRecordStart] = useState('');
  const [recordEnd, setRecordEnd] = useState('');
  const [recordReason, setRecordReason] = useState('');
  const [recordApproveNow, setRecordApproveNow] = useState(true);
  const [recordOverrideBalance, setRecordOverrideBalance] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordBalance, setRecordBalance] = useState<LeaveRow['balance'] | null>(null);

  const [reviewModal, setReviewModal] = useState<{
    row: LeaveRow;
    action: 'approve' | 'reject';
    allowOverride?: boolean;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const [editModal, setEditModal] = useState<LeaveRow | null>(null);
  const [editLeaveTypeId, setEditLeaveTypeId] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editOverrideBalance, setEditOverrideBalance] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editBalance, setEditBalance] = useState<LeaveRow['balance'] | null>(null);

  useEffect(() => {
    if (!canView) return;
    void Promise.all([
      fetch('/api/hr/employees?limit=500', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/hr/leave-types', { cache: 'no-store' }).then((r) => r.json()),
    ]).then(([empJson, typesJson]) => {
      const empRows = Array.isArray(empJson?.data?.items)
        ? empJson.data.items
        : Array.isArray(empJson?.data)
          ? empJson.data
          : [];
      if (empJson?.success) setEmployees(empRows);
      if (typesJson?.success && Array.isArray(typesJson.data)) {
        const active = (typesJson.data as LeaveTypeOption[]).filter((t) => t.isActive !== false);
        setLeaveTypes(active);
        setRecordLeaveTypeId((prev) => prev || active[0]?.id || '');
      }
    });
  }, [canView]);

  const loadData = useCallback(async () => {
    const q = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
    const [reqRes, statsRes] = await Promise.all([
      fetch(`/api/hr/leave-requests${q}`, { cache: 'no-store' }),
      fetch('/api/hr/leave/stats', { cache: 'no-store' }),
    ]);
    const reqJson = await readApiJson<LeaveRow[]>(reqRes);
    const statsJson = await readApiJson<Stats>(statsRes);
    if (reqRes.ok && reqJson?.success) setRequests(reqJson.data as LeaveRow[]);
    if (statsRes.ok && statsJson?.success) setStats(statsJson.data as Stats);
  }, [statusFilter]);

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    void loadData().finally(() => setLoading(false));
  }, [canView, loadData]);

  useEffect(() => {
    if (!recordEmployeeId || !recordStart) {
      setRecordBalance(null);
      return;
    }
    const year = Number(recordStart.slice(0, 4)) || new Date().getFullYear();
    void fetch(`/api/hr/leave-balances?employeeId=${encodeURIComponent(recordEmployeeId)}&year=${year}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json) => {
        const row = Array.isArray(json?.data) ? json.data[0] : null;
        if (json?.success && row) {
          setRecordBalance({
            year: row.year,
            entitlementDays: Number(row.entitlementDays),
            usedDays: Number(row.usedDays),
            adjustedDays: Number(row.adjustedDays),
            remainingDays: Number(row.remainingDays),
          });
        } else {
          setRecordBalance(null);
        }
      })
      .catch(() => setRecordBalance(null));
  }, [recordEmployeeId, recordStart]);

  useEffect(() => {
    if (!editModal || !editStart) {
      setEditBalance(null);
      return;
    }
    const year = Number(editStart.slice(0, 4)) || new Date().getFullYear();
    void fetch(
      `/api/hr/leave-balances?employeeId=${encodeURIComponent(editModal.employee.id)}&year=${year}`,
      { cache: 'no-store' }
    )
      .then((r) => r.json())
      .then((json) => {
        const row = Array.isArray(json?.data) ? json.data[0] : null;
        if (json?.success && row) {
          setEditBalance({
            year: row.year,
            entitlementDays: Number(row.entitlementDays),
            usedDays: Number(row.usedDays),
            adjustedDays: Number(row.adjustedDays),
            remainingDays: Number(row.remainingDays),
          });
        } else {
          setEditBalance(null);
        }
      })
      .catch(() => setEditBalance(null));
  }, [editModal, editStart]);

  const visibleRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((row) =>
      [
        row.employee.fullName,
        row.employee.preferredName ?? '',
        row.employee.employeeCode,
        leaveTypeLabel(row),
        row.status,
        row.reason ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [requests, search]);

  const selectedLeaveType = leaveTypes.find((t) => t.id === recordLeaveTypeId);
  const recordDayCount = useMemo(() => {
    if (!recordStart) return 0;
    const end = recordEnd || recordStart;
    const startMs = new Date(`${recordStart}T12:00:00`).getTime();
    const endMs = new Date(`${end}T12:00:00`).getTime();
    if (endMs < startMs) return 0;
    return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  }, [recordStart, recordEnd]);

  const selectedEditLeaveType = leaveTypes.find((t) => t.id === editLeaveTypeId);
  const editDayCount = useMemo(() => {
    if (!editStart) return 0;
    const end = editEnd || editStart;
    const startMs = new Date(`${editStart}T12:00:00`).getTime();
    const endMs = new Date(`${end}T12:00:00`).getTime();
    if (endMs < startMs) return 0;
    return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  }, [editStart, editEnd]);

  const openRecordModal = () => {
    setRecordEmployeeId('');
    setRecordStart('');
    setRecordEnd('');
    setRecordReason('');
    setRecordApproveNow(true);
    setRecordOverrideBalance(false);
    setRecordBalance(null);
    setRecordLeaveTypeId(leaveTypes[0]?.id ?? '');
    setRecordOpen(true);
  };

  const submitRecord = async () => {
    if (!canApprove) return;
    if (!recordEmployeeId || !recordLeaveTypeId || !recordStart) {
      toast.error('Employee, leave type, and start date are required');
      return;
    }
    setRecordSaving(true);
    const res = await fetch('/api/hr/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: recordEmployeeId,
        leaveTypeId: recordLeaveTypeId,
        startDate: recordStart,
        endDate: recordEnd || recordStart,
        reason: recordReason.trim() || undefined,
        autoApprove: recordApproveNow,
        allowInsufficientBalance: recordOverrideBalance,
        reviewNote: recordApproveNow ? 'Recorded by HR' : undefined,
      }),
    });
    const json = await readApiJson(res);
    setRecordSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Could not save leave');
      return;
    }
    toast.success(recordApproveNow ? 'Leave recorded and approved' : 'Leave request created');
    setRecordOpen(false);
    void loadData();
  };

  const openEditModal = (row: LeaveRow) => {
    setEditModal(row);
    setEditLeaveTypeId(row.leaveTypeId ?? leaveTypes.find((t) => t.code === row.leaveType)?.id ?? '');
    setEditStart(String(row.startDate).slice(0, 10));
    setEditEnd(String(row.endDate).slice(0, 10));
    setEditReason(row.reason ?? '');
    setEditOverrideBalance(false);
    setEditBalance(row.balance ?? null);
  };

  const submitEdit = async () => {
    if (!editModal || !canEdit) return;
    if (!editLeaveTypeId || !editStart) {
      toast.error('Leave type and start date are required');
      return;
    }
    setEditSaving(true);
    const res = await fetch(`/api/hr/leave-requests/${editModal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveTypeId: editLeaveTypeId,
        startDate: editStart,
        endDate: editEnd || editStart,
        reason: editReason.trim() || null,
        allowInsufficientBalance: editOverrideBalance,
      }),
    });
    const json = await readApiJson(res);
    setEditSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Could not update leave');
      return;
    }
    toast.success('Leave updated');
    setEditModal(null);
    void loadData();
  };

  const submitReview = async () => {
    if (!reviewModal || !canApprove) return;
    const res = await fetch(`/api/hr/leave-requests/${reviewModal.row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: reviewModal.action,
        reviewNote: reviewNote.trim() || undefined,
        allowInsufficientBalance: reviewModal.allowOverride,
      }),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Action failed');
      return;
    }
    toast.success(reviewModal.action === 'approve' ? 'Leave approved' : 'Leave rejected');
    setReviewModal(null);
    setReviewNote('');
    void loadData();
  };

  const deleteRequest = async (row: LeaveRow) => {
    if (!canDelete) return;
    if (
      !confirm(
        `Delete leave for ${employeeName(row.employee)}? Approved leave will be cancelled and balance restored.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/hr/leave-requests/${row.id}`, { method: 'DELETE' });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Delete failed');
      return;
    }
    toast.success('Leave deleted');
    void loadData();
  };

  if (!canView) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You do not have permission to view leave management.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Leave management</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Approve employee requests or record official leave on their behalf. Entitlement comes from your{' '}
            <Link href="/hr/settings/leave-types" className="font-medium text-foreground underline-offset-2 hover:underline">
              leave types
            </Link>{' '}
            setup — daily attendance stays on the day sheet.
          </p>
        </div>
        {canApprove ? (
          <Button onClick={openRecordModal}>Record leave</Button>
        ) : null}
      </div>

      {showGuide ? (
        <Alert className="mb-5 border-sky-500/25 bg-sky-500/5">
          <AlertDescription className="space-y-2 text-sm">
            <p className="font-medium text-foreground">How this works</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Official leave</strong> — approve a request or use Record leave. This
                sets the approved date range and deducts balance when the leave type requires it.
              </li>
              <li>
                <strong className="text-foreground">Daily attendance</strong> — mark absent/present on the attendance day
                sheet. Compare both to spot early return or overstay.
              </li>
              <li>
                <strong className="text-foreground">Entitlement</strong> — auto-filled from the Annual leave type (HR Setup
                → Leave types). No separate balance setup needed.
              </li>
            </ol>
            <button type="button" className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300" onClick={() => setShowGuide(false)}>
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {stats ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Needs decision" value={stats.pendingCount} hint="Pending requests" tone="amber" />
          <StatCard label="Approved this month" value={stats.approvedThisMonth} tone="emerald" />
          <StatCard label="On approved leave today" value={stats.onLeaveToday} tone="sky" />
          <StatCard label="Profile: on leave" value={stats.employeesOnLeaveStatus} hint="Employee status field" />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['PENDING', 'APPROVED', 'ALL'] as const).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? 'default' : 'outline'}
              onClick={() => setStatusFilter(key)}
            >
              {key === 'PENDING' ? 'Pending' : key === 'APPROVED' ? 'Approved' : 'All'}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee or leave type…"
          className="max-w-xs"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading leave requests…</p>
        ) : visibleRequests.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'PENDING'
                ? 'No pending requests. Use Record leave to assign leave directly.'
                : 'No leave requests match this filter.'}
            </p>
            {canApprove && statusFilter === 'PENDING' ? (
              <Button className="mt-4" size="sm" onClick={openRecordModal}>
                Record leave
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Leave type</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Days</th>
                  <th className="px-4 py-3 font-medium">Balance left</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((row) => (
                  <tr key={row.id} className="border-b align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{employeeName(row.employee)}</p>
                      <p className="text-xs text-muted-foreground">{row.employee.employeeCode}</p>
                      {row.reason ? <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p> : null}
                      {row.reviewNote ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Note: {row.reviewNote}
                          {row.reviewedBy?.name ? ` · ${row.reviewedBy.name}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{leaveTypeLabel(row)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatDateRange(row.startDate, row.endDate)}</td>
                    <td className="px-4 py-3 tabular-nums">{row.dayCount}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.balance && rowDeductsBalance(row) ? (
                        <span className={row.balance.remainingDays < row.dayCount && row.status === 'PENDING' ? 'text-amber-700 dark:text-amber-300' : ''}>
                          {row.balance.remainingDays}
                          <span className="block text-xs text-muted-foreground">
                            of {row.balance.entitlementDays + row.balance.adjustedDays} yr
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('font-medium', statusBadgeClass(row.status))}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {row.status === 'PENDING' && canApprove ? (
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => {
                                setReviewNote('');
                                setReviewModal({ row, action: 'approve' });
                              }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReviewNote('');
                                setReviewModal({ row, action: 'approve', allowOverride: true });
                              }}
                            >
                              Override
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setReviewNote('');
                                setReviewModal({ row, action: 'reject' });
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                        {(row.status === 'PENDING' || row.status === 'APPROVED') && (canEdit || canDelete) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {canEdit ? (
                              <Button size="sm" variant="outline" onClick={() => openEditModal(row)}>
                                Edit
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-destructive hover:text-destructive"
                                onClick={() => void deleteRequest(row)}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={recordOpen}
        onClose={() => setRecordOpen(false)}
        title="Record leave"
        description="Create official leave for an employee. Approve now to assign immediately and update their balance."
        size="lg"
        actions={
          <>
            <Button variant="ghost" onClick={() => setRecordOpen(false)}>
              Close
            </Button>
            <Button disabled={recordSaving} onClick={() => void submitRecord()}>
              {recordSaving ? 'Saving…' : recordApproveNow ? 'Save & approve' : 'Save as pending'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee</label>
            <div className="mt-1">
              <SearchSelect
                items={employees.map((e) => ({
                  id: e.id,
                  label: `${employeeName(e)} (${e.employeeCode})`,
                  searchText: `${e.employeeCode} ${e.fullName} ${e.preferredName ?? ''}`,
                }))}
                value={recordEmployeeId}
                onChange={setRecordEmployeeId}
                placeholder="Search employee…"
                minCharactersToSearch={0}
                openOnFocus
                dropdownInPortal
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leave type</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={recordLeaveTypeId}
                onChange={(e) => setRecordLeaveTypeId(e.target.value)}
              >
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {recordBalance ? (
                <>
                  <p className="font-medium">Leave balance ({recordBalance.year})</p>
                  <p className="mt-1 tabular-nums text-muted-foreground">
                    {recordBalance.remainingDays} remaining · {recordBalance.usedDays} used · entitlement{' '}
                    {recordBalance.entitlementDays}
                    {recordBalance.adjustedDays ? ` (+${recordBalance.adjustedDays} adj)` : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Entitlement is set automatically from leave types.</p>
                </>
              ) : (
                <p className="text-muted-foreground">Select employee and start date to see balance.</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start date</label>
              <Input type="date" className="mt-1" value={recordStart} onChange={(e) => setRecordStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">End date</label>
              <Input type="date" className="mt-1" value={recordEnd} onChange={(e) => setRecordEnd(e.target.value)} />
            </div>
          </div>
          {recordDayCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Requesting <strong className="text-foreground">{recordDayCount}</strong> day(s)
              {leaveTypeDeductsBalance(selectedLeaveType) && recordBalance && recordDayCount > recordBalance.remainingDays ? (
                <span className="text-amber-700 dark:text-amber-300"> — exceeds remaining balance</span>
              ) : null}
            </p>
          ) : null}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason (optional)</label>
            <Input className="mt-1" value={recordReason} onChange={(e) => setRecordReason(e.target.value)} placeholder="e.g. Family travel" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={recordApproveNow} onChange={(e) => setRecordApproveNow(e.target.checked)} />
            Approve immediately (recommended for HR-recorded leave)
          </label>
          {recordApproveNow ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={recordOverrideBalance}
                onChange={(e) => setRecordOverrideBalance(e.target.checked)}
              />
              Allow approval even if balance is insufficient
            </label>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        title="Edit leave"
        description={
          editModal
            ? `${employeeName(editModal.employee)} · ${editModal.status === 'APPROVED' ? 'Approved leave — balance and schedule absences will be recalculated.' : 'Pending request'}`
            : undefined
        }
        size="lg"
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditModal(null)}>
              Close
            </Button>
            <Button disabled={editSaving} onClick={() => void submitEdit()}>
              {editSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leave type</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={editLeaveTypeId}
                onChange={(e) => setEditLeaveTypeId(e.target.value)}
              >
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {editBalance ? (
                <>
                  <p className="font-medium">Leave balance ({editBalance.year})</p>
                  <p className="mt-1 tabular-nums text-muted-foreground">
                    {editBalance.remainingDays} remaining · {editBalance.usedDays} used
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Select start date to see balance.</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start date</label>
              <Input type="date" className="mt-1" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">End date</label>
              <Input type="date" className="mt-1" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
            </div>
          </div>
          {editDayCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{editDayCount}</strong> day(s)
              {leaveTypeDeductsBalance(selectedEditLeaveType) &&
              editBalance &&
              editDayCount > editBalance.remainingDays &&
              editModal?.status === 'APPROVED' ? (
                <span className="text-amber-700 dark:text-amber-300"> — may exceed remaining balance</span>
              ) : null}
            </p>
          ) : null}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason (optional)</label>
            <Input className="mt-1" value={editReason} onChange={(e) => setEditReason(e.target.value)} />
          </div>
          {editModal?.status === 'APPROVED' ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={editOverrideBalance}
                onChange={(e) => setEditOverrideBalance(e.target.checked)}
              />
              Allow save even if balance is insufficient
            </label>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={reviewModal !== null}
        onClose={() => setReviewModal(null)}
        title={reviewModal?.action === 'approve' ? 'Approve leave' : 'Reject leave'}
        description={
          reviewModal
            ? `${employeeName(reviewModal.row.employee)} · ${leaveTypeLabel(reviewModal.row)} · ${formatDateRange(reviewModal.row.startDate, reviewModal.row.endDate)}`
            : undefined
        }
        size="sm"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setReviewModal(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={reviewModal?.action === 'reject' ? 'destructive' : 'default'}
              onClick={() => void submitReview()}
            >
              {reviewModal?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        {reviewModal?.allowOverride ? (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">Balance override enabled — insufficient days will still be approved.</p>
        ) : null}
        <label className="block text-sm">
          <span className="text-muted-foreground">Message to employee (optional)</span>
          <Input className="mt-1" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Visible on their portal" />
        </label>
      </Modal>
    </HrPageChrome>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'amber' | 'emerald' | 'sky';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-500/20 bg-amber-500/5'
      : tone === 'emerald'
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : tone === 'sky'
          ? 'border-sky-500/20 bg-sky-500/5'
          : 'border-border';
  return (
    <div className={cn('rounded-xl border p-4', toneClass)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
