import { isPayrollLeaveLine } from '@/lib/hr/attendanceLeavePay';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { isPaidLeaveType } from '@/lib/hr/leaveTypes';
import { roundMoney } from '@/lib/hr/payroll/calendar';
import { lineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import { formatPayDayStatus } from '@/lib/hr/payroll/payDayStatus';
import type { PayDayBreakdown, PayLineInput } from '@/lib/hr/payroll/types';

export { formatPayDayStatus, isAttendancePresentLine, isExcludedWeekdayLine } from '@/lib/hr/payroll/payDayStatus';

export function workedHoursFromMinutes(minutes: number): number {
  return Math.round((Math.max(0, minutes) / 60) * 100) / 100;
}

export function resolveDayHoursForBreakdown(line: PayLineInput): {
  totalHours: number;
  basicHours: number;
  otHours: number;
  lineBasic: number;
} {
  const lineBasic = lineBasicHours(line);
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  if (workedHours <= 0) {
    return { totalHours: 0, basicHours: 0, otHours: 0, lineBasic };
  }
  if (lineBasic <= 0) {
    return { totalHours: workedHours, basicHours: workedHours, otHours: 0, lineBasic };
  }
  const basicHours = Math.min(workedHours, lineBasic);
  const otHours = Math.max(0, workedHours - lineBasic);
  return { totalHours: workedHours, basicHours, otHours, lineBasic };
}

/** Avoids penny drift when OT hours are zero (e.g. daily wage at exactly basic hours). */
export function splitBasicOtSalary(params: {
  totalSalary: number;
  basicHours: number;
  otHours: number;
  basicHourRate: number;
  otHourRate: number;
}): { basicHourSalary: number; otHourSalary: number } {
  const { totalSalary, otHours, basicHourRate, otHourRate } = params;
  if (otHours <= 0) {
    return { basicHourSalary: roundMoney(totalSalary), otHourSalary: 0 };
  }
  const otHourSalary = roundMoney(otHours * otHourRate);
  const basicHourSalary = roundMoney(totalSalary - otHourSalary);
  return { basicHourSalary, otHourSalary };
}

export function emptyPayDayBreakdown(line: PayLineInput): PayDayBreakdown {
  return {
    date: line.workDate,
    status: formatPayDayStatus(line),
    totalHours: 0,
    basicHours: 0,
    otHours: 0,
    basicHourRate: 0,
    basicHourSalary: 0,
    otHourRate: 0,
    otHourSalary: 0,
    allowance: 0,
    totalSalary: 0,
    amount: 0,
  };
}

export function finishPayDayBreakdown(row: Omit<PayDayBreakdown, 'amount'>): PayDayBreakdown {
  const totalHours =
    row.totalHours != null && row.totalHours > 0
      ? row.totalHours
      : roundHours(row.basicHours + row.otHours);
  return {
    ...row,
    totalHours,
    amount: row.totalSalary,
  };
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isLeavePaidForPay(line: PayLineInput): boolean {
  if (!isPayrollLeaveLine(line)) return false;
  if (line.leavePayPercent != null) return line.leavePayPercent > 0;
  return isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY');
}

export function sortPayDayBreakdowns(rows: PayDayBreakdown[]): PayDayBreakdown[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeCustomDayTrace(
  lines: PayLineInput[],
  trace: Array<{ date: string; amount: number; detail?: string }>,
): PayDayBreakdown[] {
  const byDate = new Map(trace.map((row) => [row.date, row]));
  return sortPayDayBreakdowns(
    lines.map((line) => {
      const hit = byDate.get(line.workDate);
      const totalSalary = roundMoney(hit?.amount ?? 0);
      const { totalHours, basicHours, otHours } = resolveDayHoursForBreakdown(line);
      return finishPayDayBreakdown({
        date: line.workDate,
        status: formatPayDayStatus(line),
        totalHours,
        basicHours,
        otHours,
        basicHourRate: 0,
        basicHourSalary: totalSalary,
        otHourRate: 0,
        otHourSalary: 0,
        allowance: 0,
        totalSalary,
        detail: hit?.detail,
      });
    }),
  );
}
