import { isPaidLeaveType } from '@/lib/hr/leaveTypes';
import {
  daysInMonth,
  denomDaysExcludingWeekdays,
  isExcludedWeekdayYmd,
  roundMoney,
  sundaysInMonth,
} from '@/lib/hr/payroll/calendar';
import {
  evaluateFormulaScript,
  evaluateExpression,
  type FormulaScope,
  type SumDaysTrace,
} from '@/lib/hr/payroll/formulaEngine';
import { averageLineBasicHours, lineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import { resolveExcludedWeekdays, resolveOtPercent } from '@/lib/hr/payroll/payTypeConfigHelpers';
import type { CompensationInput, PayLineInput, PayLineResult, PayTypeConfig } from '@/lib/hr/payroll/types';

function workedHoursFromMinutes(minutes: number): number {
  return Math.max(0, minutes) / 60;
}

function buildMonthScope(params: {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  lines: PayLineInput[];
}): FormulaScope {
  const { month, config, compensation, lines } = params;
  let absentDays = 0;
  let leaveDays = 0;
  let paidLeaveDays = 0;
  let presentDays = 0;
  let workedHoursTotal = 0;

  for (const line of lines) {
    const workedHours = workedHoursFromMinutes(line.workedMinutes);
    workedHoursTotal += workedHours;
    if (line.status === 'ABSENT') absentDays += 1;
    if (line.status === 'LEAVE') {
      leaveDays += 1;
      if (isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY')) {
        paidLeaveDays += 1;
      }
    }
    if (line.status === 'PRESENT') presentDays += 1;
  }

  const excludedWeekdays = resolveExcludedWeekdays(config);
  const scope: FormulaScope = {
    monthly_basic: compensation.monthlyBasic,
    monthly_allowance: compensation.monthlyAllowance,
    daily_rate: compensation.dailyRate,
    days_in_month: daysInMonth(month),
    sundays_in_month: sundaysInMonth(month),
    denom_days: denomDaysExcludingWeekdays(month, excludedWeekdays),
    absent_days: absentDays,
    leave_days: leaveDays,
    paid_leave_days: paidLeaveDays,
    present_days: presentDays,
    worked_hours_total: workedHoursTotal,
    ot_percent: resolveOtPercent(config),
    ot_divisor: config.otDivisor ?? 10,
    basic_hours: averageLineBasicHours(lines),
  };

  if (config.customParams) {
    for (const [key, value] of Object.entries(config.customParams)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        scope[key] = value;
      }
    }
  }

  return scope;
}

function buildDayScope(
  monthScope: FormulaScope,
  line: PayLineInput,
  index: number,
  excludedWeekdays: number[]
): FormulaScope {
  const workedHours = workedHoursFromMinutes(line.workedMinutes);
  const isAbsent = line.status === 'ABSENT' ? 1 : 0;
  const isLeave = line.status === 'LEAVE' ? 1 : 0;
  const isPaidLeave =
    line.status === 'LEAVE' &&
    isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY')
      ? 1
      : 0;
  const isPresent = line.status === 'PRESENT' ? 1 : 0;

  return {
    ...monthScope,
    worked_hours: workedHours,
    worked_minutes: line.workedMinutes,
    basic_hours: lineBasicHours(line) ?? monthScope.basic_hours,
    is_absent: isAbsent,
    is_leave: isLeave,
    is_paid_leave: isPaidLeave,
    is_present: isPresent,
    is_sunday: line.isSunday ? 1 : 0,
    is_excluded_day: isExcludedWeekdayYmd(line.workDate, excludedWeekdays) ? 1 : 0,
    work_date_index: index,
  };
}

function sumDaysEvaluator(
  lines: PayLineInput[],
  monthScope: FormulaScope,
  excludedWeekdays: number[]
) {
  return (expr: string, baseScope: FormulaScope): SumDaysTrace => {
    const trace: SumDaysTrace = [];
    lines.forEach((line, index) => {
      const dayScope = buildDayScope(baseScope, line, index, excludedWeekdays);
      try {
        const amount = roundMoney(evaluateExpression(expr, dayScope));
        if (amount !== 0) {
          trace.push({
            date: line.workDate,
            amount,
            detail: `${workedHoursFromMinutes(line.workedMinutes)}h · ${line.status}`,
          });
        }
      } catch {
        trace.push({ date: line.workDate, amount: 0, detail: 'error' });
      }
    });
    return trace;
  };
}

export function evaluateCustomFormula(params: {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  lines: PayLineInput[];
}): PayLineResult {
  const script = params.config.formulaScript?.trim();
  if (!script) throw new Error('Custom pay type requires formulaScript');

  const monthScope = buildMonthScope(params);
  const excludedWeekdays = resolveExcludedWeekdays(params.config);
  const sumDays = sumDaysEvaluator(params.lines, monthScope, excludedWeekdays);
  const result = evaluateFormulaScript(script, monthScope, sumDays);

  const breakdown: Record<string, number> = {};
  for (const [key, value] of Object.entries(result.variables)) {
    if (key !== 'gross' && Number.isFinite(value)) breakdown[key] = value;
  }

  return {
    gross: roundMoney(result.gross),
    breakdown,
    days: result.dayTrace,
  };
}
