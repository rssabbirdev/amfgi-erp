import type { AttendanceGridDraftRow } from '@/components/hr/AttendanceEntryGrid';
import { isStoredLeaveStatus } from '@/lib/hr/attendanceLeavePay';
import { isPaidLeaveFromRules, parseLeaveTypeRules } from '@/lib/hr/leaveTypeRules';

export type LeaveTypeOption = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  rules?: unknown;
};

type ApiAttendanceStatus = AttendanceGridDraftRow['status'] | 'LEAVE' | 'HALF_DAY' | 'MISSING_PUNCH';

export function findUnpaidLeaveTypeId(leaveTypes: LeaveTypeOption[]): string | null {
  return leaveTypes.find((t) => t.code.toUpperCase() === 'UNPAID')?.id ?? null;
}

export function defaultUnpaidLeaveTypeId(leaveTypes: LeaveTypeOption[]): string | null {
  return findUnpaidLeaveTypeId(leaveTypes) ?? leaveTypes.find((t) => t.isActive !== false)?.id ?? null;
}

/** Prefer annual / balance-deducting leave type for employees on leave. */
export function defaultAnnualLeaveTypeId(leaveTypes: LeaveTypeOption[]): string | null {
  const annual = leaveTypes.find((t) => t.code.toUpperCase() === 'ANNUAL' && t.isActive !== false);
  if (annual) return annual.id;
  const balanceType = leaveTypes.find((t) => parseLeaveTypeRules(t.rules).deductFromBalance === true);
  if (balanceType) return balanceType.id;
  const paid = leaveTypes.find((t) => isPaidLeaveTypeOption(t));
  return paid?.id ?? null;
}

export function isPaidLeaveTypeOption(leaveType: LeaveTypeOption): boolean {
  if (leaveType.code.toUpperCase() === 'UNPAID') return false;
  return isPaidLeaveFromRules(parseLeaveTypeRules(leaveType.rules));
}

/** Attendance sheet status only — leave is previewed separately from leave management. */
export function normalizeDraftStatusFromApi(
  status: ApiAttendanceStatus,
  leaveTypes: LeaveTypeOption[]
): Pick<AttendanceGridDraftRow, 'status' | 'leaveTypeId'> {
  if (status === 'HALF_DAY' || status === 'MISSING_PUNCH' || status === 'PRESENT') {
    return { status: 'PRESENT', leaveTypeId: null };
  }

  return {
    status: 'ABSENT',
    leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
  };
}

export function isDraftNonWorking(draft: Pick<AttendanceGridDraftRow, 'status'>): boolean {
  return draft.status === 'ABSENT';
}

/** @deprecated Leave is no longer stored on attendance drafts. */
export function isLeaveManagedDraft(
  _draft: Pick<AttendanceGridDraftRow, 'leaveRequestId' | 'attendanceSource'>
): boolean {
  return false;
}

export function isLegacyStoredLeaveStatus(status: ApiAttendanceStatus): boolean {
  return isStoredLeaveStatus(status);
}
