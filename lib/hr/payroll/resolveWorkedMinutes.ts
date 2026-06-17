import { basicHoursToMinutes } from '@/lib/hr/attendanceBasicHours';

const PAYABLE_WITHOUT_PUNCH = new Set(['PRESENT', 'HALF_DAY', 'MISSING_PUNCH']);

export type AttendanceWorkedMinutesInput = {
  status: string;
  basicHours: { toString(): string } | number;
  workedMinutes?: number;
  overtimeMinutes?: number;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  breakStartAt?: Date | null;
  breakEndAt?: Date | null;
};

function diffMinutes(start: Date | null | undefined, end: Date | null | undefined): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/** Resolves total worked minutes from punches, stored OT, or scheduled basic hours. */
export function resolveWorkedMinutesFromAttendance(row: AttendanceWorkedMinutesInput): number {
  if (row.workedMinutes != null && row.workedMinutes > 0) {
    return row.workedMinutes;
  }

  const fromPunch = (() => {
    if (!row.checkInAt || !row.checkOutAt) return 0;
    const duty = diffMinutes(row.checkInAt, row.checkOutAt);
    const breakMinutes = diffMinutes(row.breakStartAt, row.breakEndAt);
    return Math.max(0, duty - breakMinutes);
  })();
  if (fromPunch > 0) return fromPunch;

  if (row.status === 'ABSENT' || row.status === 'LEAVE') return 0;

  const basicMinutes = basicHoursToMinutes(row.basicHours);
  const overtimeMinutes = Math.max(0, row.overtimeMinutes ?? 0);

  if (overtimeMinutes > 0 && basicMinutes > 0) {
    return basicMinutes + overtimeMinutes;
  }

  if (PAYABLE_WITHOUT_PUNCH.has(row.status) && basicMinutes > 0) {
    return basicMinutes;
  }

  return overtimeMinutes;
}
