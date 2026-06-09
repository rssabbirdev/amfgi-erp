import type { AttendanceGridDraftRow } from '@/components/hr/AttendanceEntryGrid';
import { isPaidLeaveFromRules, parseLeaveTypeRules } from '@/lib/hr/leaveTypeRules';

export type LeaveTypeOption = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  rules?: unknown;
};

type ApiAttendanceStatus = AttendanceGridDraftRow['status'] | 'LEAVE' | 'HALF_DAY' | 'MISSING_PUNCH';

const LEGACY_ENUM_TO_CODE: Record<string, string> = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  EMERGENCY: 'PAID',
  ONE_DAY: 'PAID',
};

export function findUnpaidLeaveTypeId(leaveTypes: LeaveTypeOption[]): string | null {
  return leaveTypes.find((t) => t.code.toUpperCase() === 'UNPAID')?.id ?? null;
}

export function defaultUnpaidLeaveTypeId(leaveTypes: LeaveTypeOption[]): string | null {
  return findUnpaidLeaveTypeId(leaveTypes) ?? leaveTypes.find((t) => t.isActive !== false)?.id ?? null;
}

export function isPaidLeaveTypeOption(leaveType: LeaveTypeOption): boolean {
  if (leaveType.code.toUpperCase() === 'UNPAID') return false;
  return isPaidLeaveFromRules(parseLeaveTypeRules(leaveType.rules));
}

export function resolveLeaveTypeIdFromStored(
  leaveTypeId: string | null | undefined,
  legacyLeaveType: string | null | undefined,
  leaveTypes: LeaveTypeOption[]
): string | null {
  if (leaveTypeId) return leaveTypeId;
  if (legacyLeaveType) {
    const code = LEGACY_ENUM_TO_CODE[legacyLeaveType] ?? 'PAID';
    return leaveTypes.find((t) => t.code.toUpperCase() === code)?.id ?? defaultUnpaidLeaveTypeId(leaveTypes);
  }
  return defaultUnpaidLeaveTypeId(leaveTypes);
}

/** Map stored attendance to day-sheet UI (Present / Absent unpaid / On leave from leave management). */
export function normalizeDraftStatusFromApi(
  status: ApiAttendanceStatus,
  leaveTypeId: string | null | undefined,
  legacyLeaveType: string | null | undefined,
  leaveTypes: LeaveTypeOption[]
): Pick<AttendanceGridDraftRow, 'status' | 'leaveTypeId'> {
  if (status === 'LEAVE') {
    return {
      status: 'LEAVE',
      leaveTypeId: resolveLeaveTypeIdFromStored(leaveTypeId, legacyLeaveType, leaveTypes),
    };
  }
  if (status === 'ABSENT') {
    return {
      status: 'ABSENT',
      leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
    };
  }
  return { status: 'PRESENT', leaveTypeId: null };
}

export function isDraftNonWorking(draft: Pick<AttendanceGridDraftRow, 'status'>): boolean {
  return draft.status === 'ABSENT' || draft.status === 'LEAVE';
}

export function isLeaveManagedDraft(
  draft: Pick<AttendanceGridDraftRow, 'status' | 'leaveRequestId' | 'attendanceSource'>
): boolean {
  return draft.status === 'LEAVE' || Boolean(draft.leaveRequestId) || draft.attendanceSource === 'LEAVE_REQUEST';
}
