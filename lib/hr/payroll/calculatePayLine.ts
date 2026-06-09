import { isPaidLeaveType } from '@/lib/hr/leaveTypes';
import {
  daysInMonth,
  denomDaysExcludingWeekdays,
  isSundayYmd,
  roundMoney,
} from '@/lib/hr/payroll/calendar';
import { evaluateCustomFormula } from '@/lib/hr/payroll/evaluateCustomFormula';
import { lineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import { resolveExcludedWeekdays, resolveOtPercent } from '@/lib/hr/payroll/payTypeConfigHelpers';
import {
  applySalaryComponentsToGross,
  fixedSalaryComponentNet,
} from '@/lib/hr/payroll/salaryComponent';
import type { CompensationInput, PayLineInput, PayLineResult, PayTypeConfig } from '@/lib/hr/payroll/types';

function workedHoursFromMinutes(minutes: number): number {
  return Math.max(0, minutes) / 60;
}

function dailyWagePay(
  dailyRate: number,
  basicHours: number,
  workedHours: number,
  otPercent: number
): number {
  if (workedHours <= 0 || basicHours <= 0) return 0;
  const basicRate = dailyRate / basicHours;
  const otRate = basicRate * (otPercent / 100);
  if (workedHours >= basicHours) {
    return roundMoney(dailyRate + (workedHours - basicHours) * otRate);
  }
  return roundMoney(workedHours * basicRate);
}

export function calculatePayLine(params: {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  lines: PayLineInput[];
}): PayLineResult {
  const { month, config, compensation, lines } = params;
  const calendarDays = daysInMonth(month);
  const breakdown: Record<string, number> = {};
  const dayRows: PayLineResult['days'] = [];

  if (config.mode === 'MONTHLY_FIXED') {
    let gross = roundMoney(compensation.monthlyBasic);
    breakdown.monthlyBasic = gross;
    gross = applySalaryComponentsToGross({ gross, compensation, lines, breakdown });
    return { gross, breakdown, days: dayRows };
  }

  if (config.mode === 'MONTHLY_CALENDAR_DEDUCT') {
    const dailyRate = compensation.monthlyBasic / calendarDays;
    let deductDays = 0;
    let partialDeductions = 0;
    for (const line of lines) {
      if (line.status === 'ABSENT') {
        deductDays += 1;
        continue;
      }
      if (line.status === 'LEAVE') {
        const paid =
          line.leavePayPercent != null
            ? line.leavePayPercent > 0
            : isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY');
        if (!paid) {
          deductDays += 1;
          continue;
        }
        const pct = line.leavePayPercent ?? 100;
        if (pct < 100) {
          partialDeductions += roundMoney(dailyRate * ((100 - pct) / 100));
        }
      }
    }
    const deductions = roundMoney(deductDays * dailyRate + partialDeductions);
    let gross = roundMoney(compensation.monthlyBasic - deductions);
    breakdown.monthlyBasic = compensation.monthlyBasic;
    breakdown.deductions = deductions;
    breakdown.deductDays = deductDays;
    if (partialDeductions > 0) breakdown.partialLeaveDeductions = partialDeductions;
    gross = applySalaryComponentsToGross({ gross, compensation, lines, breakdown });
    return { gross, breakdown, days: dayRows };
  }

  if (config.mode === 'DAILY_WAGE') {
    const otPercent = resolveOtPercent(config);
    let gross = 0;
    for (const line of lines) {
      if (line.status === 'ABSENT' || line.status === 'LEAVE') continue;
      const lineBasic = lineBasicHours(line);
      if (!lineBasic) continue;
      const workedHours = workedHoursFromMinutes(line.workedMinutes);
      const amount = dailyWagePay(compensation.dailyRate, lineBasic, workedHours, otPercent);
      gross += amount;
      dayRows.push({ date: line.workDate, amount, detail: `${workedHours}h` });
    }
    breakdown.dailyWageTotal = roundMoney(gross);
    gross = applySalaryComponentsToGross({ gross, compensation, lines, breakdown });
    return { gross: roundMoney(gross), breakdown, days: dayRows };
  }

  if (config.mode === 'CUSTOM') {
    const custom = evaluateCustomFormula({ month, config, compensation, lines });
    custom.gross = applySalaryComponentsToGross({
      gross: custom.gross,
      compensation,
      lines,
      breakdown: custom.breakdown,
    });
    return custom;
  }

  if (config.mode === 'HOURLY_SPLIT') {
    const excludedWeekdays = resolveExcludedWeekdays(config);
    const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
    const basic = compensation.monthlyBasic;
    const comps = compensation.salaryComponents;
    const legacyAllowancePerDay =
      !comps && compensation.monthlyAllowance > 0 ? compensation.monthlyAllowance / denom : 0;
    const attendanceDayNet = comps
      ? comps.attendanceEarningPerDay - comps.attendanceDeductionPerDay
      : 0;
    let gross = 0;

    for (const line of lines) {
      if (line.status === 'ABSENT') continue;
      if (line.status === 'LEAVE') {
        const paid =
          line.leavePayPercent != null
            ? line.leavePayPercent > 0
            : isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY');
        if (paid) continue;
      }
      const lineBasic = lineBasicHours(line);
      if (!lineBasic) continue;
      const workedHours = workedHoursFromMinutes(line.workedMinutes);
      if (workedHours <= 0 && line.status !== 'LEAVE') continue;

      const lineBasicRate = basic / denom / lineBasic;
      const otHourRate = (basic * 12) / 365 / lineBasic;
      const basicHoursWorked = Math.min(workedHours, lineBasic);
      const otHours = Math.max(0, workedHours - lineBasic);
      let amount = basicHoursWorked * lineBasicRate + otHours * otHourRate;
      if (legacyAllowancePerDay && (workedHours > 0 || line.status === 'PRESENT')) {
        amount += legacyAllowancePerDay;
      }
      if (comps && line.status === 'PRESENT') {
        amount += attendanceDayNet;
      }
      amount = roundMoney(amount);
      gross += amount;
      dayRows.push({ date: line.workDate, amount });
    }

    if (comps) {
      const fixedNet = fixedSalaryComponentNet(comps);
      if (fixedNet !== 0) breakdown.salaryComponentsFixed = fixedNet;
      gross = roundMoney(gross + fixedNet);
    }

    breakdown.hourlyTotal = roundMoney(gross);
    return { gross: roundMoney(gross), breakdown, days: dayRows };
  }

  return { gross: 0, breakdown, days: dayRows };
}

export function attendanceLinesForPayroll(
  rows: Array<{
    workDate: Date;
    status: string;
    leaveType: string | null;
    leaveTypeId?: string | null;
    leavePayPercent?: number;
    basicHours: { toString(): string } | number;
    workedMinutes?: number;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakStartAt: Date | null;
    breakEndAt: Date | null;
    overtimeMinutes?: number;
  }>,
  month: string
): PayLineInput[] {
  const monthStart = `${month}-01`;
  const monthEndDay = daysInMonth(month);
  const monthEnd = `${month}-${String(monthEndDay).padStart(2, '0')}`;

  return rows
    .filter((r) => {
      const ymd = r.workDate.toISOString().slice(0, 10);
      return ymd >= monthStart && ymd <= monthEnd;
    })
    .map((r) => {
      const ymd = r.workDate.toISOString().slice(0, 10);
      let workedMinutes = r.workedMinutes ?? 0;
      if (!workedMinutes && r.checkInAt && r.checkOutAt) {
        const duty = Math.max(0, Math.round((r.checkOutAt.getTime() - r.checkInAt.getTime()) / 60000));
        const brk =
          r.breakStartAt && r.breakEndAt
            ? Math.max(0, Math.round((r.breakEndAt.getTime() - r.breakStartAt.getTime()) / 60000))
            : 0;
        workedMinutes = Math.max(0, duty - brk);
      }
      return {
        workDate: ymd,
        status: r.status,
        leaveType: r.leaveType,
        leavePayPercent: r.leavePayPercent,
        basicHours: Number(r.basicHours),
        workedMinutes,
        isSunday: isSundayYmd(ymd),
      };
    });
}
