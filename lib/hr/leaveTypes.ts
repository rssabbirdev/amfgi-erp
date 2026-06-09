import type { AttendanceLeaveType, LeaveRequestType } from '@prisma/client';

export const LEAVE_TYPE_OPTIONS: Array<{ value: LeaveRequestType; label: string }> = [
  { value: 'ANNUAL', label: 'Annual leave' },
  { value: 'SICK', label: 'Sick leave' },
  { value: 'EMERGENCY', label: 'Emergency leave' },
  { value: 'ONE_DAY', label: 'One day leave' },
];

/** Leave types that do not trigger office salary deduction (payroll). */
export const PAID_LEAVE_TYPES: AttendanceLeaveType[] = ['ANNUAL', 'SICK', 'EMERGENCY', 'ONE_DAY'];

export function isPaidLeaveType(leaveType: AttendanceLeaveType | null | undefined): boolean {
  if (!leaveType) return false;
  return PAID_LEAVE_TYPES.includes(leaveType);
}

export function leaveRequestTypeToAttendance(type: LeaveRequestType): AttendanceLeaveType {
  return type;
}

export function countLeaveDaysInclusive(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

export function datesInRangeInclusive(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const endUtc = new Date(end);
  endUtc.setUTCHours(0, 0, 0, 0);
  while (cur.getTime() <= endUtc.getTime()) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function usesLeaveBalance(type: LeaveRequestType): boolean {
  return type === 'ANNUAL' || type === 'ONE_DAY';
}
