import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { roundMoney } from '@/lib/hr/payroll/calendar';
import { holidayDayPayAmount } from '@/lib/hr/payroll/resolveHolidayPayStructure';
import { lineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import {
  finishPayDayBreakdown,
  formatPayDayStatus,
  workedHoursFromMinutes,
} from '@/lib/hr/payroll/payDayBreakdown';
import { resolveExcludedWeekdays, resolveOtPercent } from '@/lib/hr/payroll/payTypeConfigHelpers';
import { resolvePerDayComponentSplit } from '@/lib/hr/payroll/salaryComponent';
import type { CompensationInput, PayDayBreakdown, PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';

export function resolveHolidayOtPercent(line: PayLineInput, employeeConfig: PayTypeConfig): number {
  if (line.holidayOtPercent != null && Number.isFinite(line.holidayOtPercent) && line.holidayOtPercent > 0) {
    return line.holidayOtPercent;
  }
  return resolveOtPercent(employeeConfig);
}

export function shouldPayHolidayWorkedOt(line: PayLineInput): boolean {
  if (!isPayrollHolidayLine(line)) return false;
  if (line.holidayPayWorkedHoursAtOt === false) return false;
  if (line.status === 'ABSENT') return false;
  return workedHoursFromMinutes(line.workedMinutes) > 0;
}

export function holidayWorkedOtPay(
  line: PayLineInput,
  basicHourRate: number,
  employeeConfig: PayTypeConfig
): { otHours: number; otHourRate: number; otPay: number } {
  if (!shouldPayHolidayWorkedOt(line) || basicHourRate <= 0) {
    return { otHours: 0, otHourRate: 0, otPay: 0 };
  }

  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const lineBasic = lineBasicHours(line);
  const otHours =
    employeeConfig.mode === 'DAILY_WAGE' && lineBasic > 0
      ? Math.max(0, workedHours - lineBasic)
      : workedHours;
  if (otHours <= 0) {
    return { otHours: 0, otHourRate: 0, otPay: 0 };
  }

  const otPercent = resolveHolidayOtPercent(line, employeeConfig);
  const otHourRateRaw = basicHourRate * (otPercent / 100);
  const otPay = roundMoney(otHours * otHourRateRaw);
  return { otHours, otHourRate: roundMoney(otHourRateRaw), otPay };
}

export function buildPaidHolidayDayRow(params: {
  line: PayLineInput;
  month: string;
  employeeDailyRate: number;
  basicHourRate: number;
  compensation: CompensationInput;
  employeeConfig: PayTypeConfig;
}): PayDayBreakdown {
  const { line, month, employeeDailyRate, basicHourRate, compensation, employeeConfig } = params;
  const lineBasic = lineBasicHours(line);
  const holidayPay = holidayDayPayAmount({
    line,
    month,
    employeeDailyRate,
    compensation,
  });
  const { otHours, otHourRate, otPay } = holidayWorkedOtPay(line, basicHourRate, employeeConfig);
  const excludedWeekdays = resolveExcludedWeekdays(employeeConfig);
  const { earning: componentEarning, deduction: componentDeduction } = resolvePerDayComponentSplit({
    line,
    compensation,
    month,
    excludedWeekdays,
  });
  const allowance = roundMoney(componentEarning - componentDeduction);
  const totalSalary = roundMoney(holidayPay + otPay + allowance);
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const totalHours = workedHours > 0 ? workedHours : lineBasic;

  let detail = line.holidayPayTypeConfig ? 'Paid public holiday (custom structure)' : 'Paid public holiday';
  if (otPay > 0) {
    const otPercent = resolveHolidayOtPercent(line, employeeConfig);
    detail = `${detail} + ${otHours}h at ${otPercent}% OT`;
  }

  return finishPayDayBreakdown({
    date: line.workDate,
    status: formatPayDayStatus(line, employeeConfig),
    totalHours,
    basicHours: lineBasic,
    otHours,
    basicHourRate: lineBasic ? roundMoney(holidayPay / lineBasic) : holidayPay,
    basicHourSalary: holidayPay,
    otHourRate,
    otHourSalary: otPay,
    allowance,
    componentEarning,
    componentDeduction,
    totalSalary,
    detail,
  });
}

/** Split holiday OT from accrual gross before applying monthly basic cap. */
export function applyCalendarDeductCap(
  accrualGross: number,
  holidayWorkedOtTotal: number,
  monthlyBasic: number
): number {
  return roundMoney(Math.min(accrualGross, monthlyBasic) + holidayWorkedOtTotal);
}
