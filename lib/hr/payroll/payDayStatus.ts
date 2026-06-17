import { isPayrollLeaveLine } from '@/lib/hr/attendanceLeavePay';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { isExcludedWeekdayYmd, weekdayIndexYmd } from '@/lib/hr/payroll/calendar';
import { workedHoursFromMinutes } from '@/lib/hr/payroll/payDayBreakdown';
import {
  resolveExcludedWeekdays,
  WEEKDAY_OPTIONS,
} from '@/lib/hr/payroll/payTypeConfigHelpers';
import type { PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';

export function isAttendancePresentLine(line: PayLineInput): boolean {
  if (workedHoursFromMinutes(line.workedMinutes) > 0) return true;
  return line.status === 'PRESENT' || line.status === 'HALF_DAY';
}

export function isExcludedWeekdayLine(line: PayLineInput, config?: PayTypeConfig): boolean {
  if (!config) return line.isSunday === true;
  const excluded = resolveExcludedWeekdays(config);
  if (excluded.length === 0) return false;
  return isExcludedWeekdayYmd(line.workDate, excluded);
}

export function excludedWeekdayStatusLabel(line: PayLineInput, config?: PayTypeConfig): string {
  if (line.isSunday) return 'Sunday';
  const idx = weekdayIndexYmd(line.workDate);
  return WEEKDAY_OPTIONS.find((day) => day.value === idx)?.label ?? 'Weekly off';
}

export function formatPayDayStatus(line: PayLineInput, config?: PayTypeConfig): string {
  if (isPayrollHolidayLine(line)) {
    const name = line.holidayName?.trim();
    const base = name ? `Holiday (${name})` : 'Holiday';
    if (isAttendancePresentLine(line)) {
      return `Present - ${base}`;
    }
    return base;
  }

  if (isExcludedWeekdayLine(line, config)) {
    const label = excludedWeekdayStatusLabel(line, config);
    if (isAttendancePresentLine(line)) {
      return `Present - ${label}`;
    }
    return label;
  }

  if (isPayrollLeaveLine(line)) {
    const label =
      line.leaveTypeLabel?.trim() ||
      (line.leaveType ? line.leaveType.replace(/_/g, ' ') : 'Leave');
    return `Leave (${label})`;
  }
  if (line.status === 'ABSENT') return 'Absent';
  if (line.status === 'HALF_DAY') return 'Half day';
  if (line.status === 'MISSING_PUNCH') return 'Missing punch';
  if (line.status === 'PRESENT') return 'Present';
  return line.status.replace(/_/g, ' ');
}
