import { isPayrollLeaveLine } from '@/lib/hr/attendanceLeavePay';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { isExcludedWeekdayYmd, roundMoney } from '@/lib/hr/payroll/calendar';
import {
  finishPayDayBreakdown,
  formatPayDayStatus,
  isAttendancePresentLine,
  isExcludedWeekdayLine,
  workedHoursFromMinutes,
} from '@/lib/hr/payroll/payDayBreakdown';
import { excludedWeekdayStatusLabel } from '@/lib/hr/payroll/payDayStatus';
import { resolveExcludedWeekdays, resolveOtPercent } from '@/lib/hr/payroll/payTypeConfigHelpers';
import type { PayDayBreakdown, PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';

function isFixedMonthlyMode(config: PayTypeConfig): boolean {
  return config.mode === 'MONTHLY_CALENDAR_DEDUCT' || config.mode === 'MONTHLY_FIXED';
}

export function shouldPayExcludedWeekdayWorkAtOtOnly(
  line: PayLineInput,
  config: PayTypeConfig
): boolean {
  if (isPayrollHolidayLine(line) || isPayrollLeaveLine(line)) return false;
  if (line.status === 'ABSENT') return false;
  const excluded = resolveExcludedWeekdays(config);
  if (excluded.length === 0) return false;
  if (!isExcludedWeekdayYmd(line.workDate, excluded)) return false;
  if (workedHoursFromMinutes(line.workedMinutes) <= 0) return false;
  if (isFixedMonthlyMode(config) && !config.payExcludedWeekdayWorkAtOt) return false;
  return true;
}

export function buildExcludedWeekdayInfoDayRow(
  line: PayLineInput,
  config: PayTypeConfig
): PayDayBreakdown {
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const label = excludedWeekdayStatusLabel(line, config);
  const detail = isAttendancePresentLine(line)
    ? `${label} — work not paid unless enabled on salary structure`
    : `${label} — no pay`;

  return finishPayDayBreakdown({
    date: line.workDate,
    status: formatPayDayStatus(line, config),
    totalHours: workedHours,
    basicHours: 0,
    otHours: 0,
    basicHourRate: 0,
    basicHourSalary: 0,
    otHourRate: 0,
    otHourSalary: 0,
    allowance: 0,
    totalSalary: 0,
    detail,
  });
}

export function excludedWeekdayOtPay(
  workedHours: number,
  basicHourRate: number,
  otPercent: number
): { otHours: number; otHourRate: number; otPay: number } {
  if (workedHours <= 0 || basicHourRate <= 0) {
    return { otHours: 0, otHourRate: 0, otPay: 0 };
  }
  const otHourRateRaw = basicHourRate * (otPercent / 100);
  const otPay = roundMoney(workedHours * otHourRateRaw);
  return { otHours: workedHours, otHourRate: roundMoney(otHourRateRaw), otPay };
}

export function buildExcludedWeekdayWorkDayRow(
  line: PayLineInput,
  basicHourRate: number,
  otPercent: number,
  config?: PayTypeConfig,
  detailPrefix = 'Weekly off'
): PayDayBreakdown {
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const { otHours, otHourRate, otPay } = excludedWeekdayOtPay(workedHours, basicHourRate, otPercent);
  return finishPayDayBreakdown({
    date: line.workDate,
    status: formatPayDayStatus(line, config),
    totalHours: workedHours,
    basicHours: 0,
    otHours,
    basicHourRate: 0,
    basicHourSalary: 0,
    otHourRate,
    otHourSalary: otPay,
    allowance: 0,
    totalSalary: otPay,
    detail: otPay > 0 ? `${detailPrefix} — ${workedHours}h at OT only` : `${detailPrefix} — no hours`,
  });
}

export function buildExcludedWeekdayWorkDayRowWithOtRate(
  line: PayLineInput,
  otHourRate: number,
  config?: PayTypeConfig,
  detailPrefix = 'Weekly off'
): PayDayBreakdown {
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const otPay = workedHours > 0 && otHourRate > 0 ? roundMoney(workedHours * otHourRate) : 0;
  return finishPayDayBreakdown({
    date: line.workDate,
    status: formatPayDayStatus(line, config),
    totalHours: workedHours,
    basicHours: 0,
    otHours: workedHours,
    basicHourRate: 0,
    basicHourSalary: 0,
    otHourRate: roundMoney(otHourRate),
    otHourSalary: otPay,
    allowance: 0,
    totalSalary: otPay,
    detail: otPay > 0 ? `${detailPrefix} — ${workedHours}h at OT only` : `${detailPrefix} — no hours`,
  });
}

export function resolveExcludedWeekdayOtPercent(config: PayTypeConfig): number {
  return resolveOtPercent(config);
}
