import { dedupeAllowancesByType } from '@/lib/hr/payroll/allowanceTotals';
import { denomDaysExcludingWeekdays, roundMoney } from '@/lib/hr/payroll/calendar';
import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import type { CompensationInput, PayLineInput } from '@/lib/hr/payroll/types';
import type { EmployeeAllowanceItem } from '@/lib/hr/payroll/resolveEmployeeAllowances';

export type SalaryComponentKind = 'EARNING' | 'DEDUCTION';
export type SalaryComponentApplication = 'FIXED_MONTHLY' | 'ATTENDANCE_PRESENT';

export type SalaryComponentItem = {
  amount: number;
  componentKind: SalaryComponentKind;
  applicationMode: SalaryComponentApplication;
};

export type SalaryComponentTotals = {
  fixedEarnings: number;
  fixedDeductions: number;
  attendanceEarningPerDay: number;
  attendanceDeductionPerDay: number;
};

export function prorateSalaryComponentTotals(
  totals: SalaryComponentTotals,
  factor: number
): SalaryComponentTotals {
  if (factor >= 1) return totals;
  if (factor <= 0) {
    return {
      fixedEarnings: 0,
      fixedDeductions: 0,
      attendanceEarningPerDay: totals.attendanceEarningPerDay,
      attendanceDeductionPerDay: totals.attendanceDeductionPerDay,
    };
  }
  return {
    fixedEarnings: roundMoney(totals.fixedEarnings * factor),
    fixedDeductions: roundMoney(totals.fixedDeductions * factor),
    attendanceEarningPerDay: totals.attendanceEarningPerDay,
    attendanceDeductionPerDay: totals.attendanceDeductionPerDay,
  };
}

export function compensationWithProratedFixedMonthly(
  compensation: CompensationInput,
  factor: number | undefined
): CompensationInput {
  if (factor == null || factor >= 1 || !compensation.salaryComponents) return compensation;
  return {
    ...compensation,
    salaryComponents: prorateSalaryComponentTotals(compensation.salaryComponents, factor),
  };
}

export function buildSalaryComponentTotals(
  items: SalaryComponentItem[],
  month: string,
  excludedWeekdays: number[]
): SalaryComponentTotals {
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  let fixedEarnings = 0;
  let fixedDeductions = 0;
  let attendanceEarningPerDay = 0;
  let attendanceDeductionPerDay = 0;

  for (const item of items) {
    if (item.componentKind === 'DEDUCTION') {
      if (item.applicationMode === 'FIXED_MONTHLY') {
        fixedDeductions += item.amount;
      } else {
        attendanceDeductionPerDay += item.amount / denom;
      }
    } else if (item.applicationMode === 'FIXED_MONTHLY') {
      fixedEarnings += item.amount;
    } else {
      attendanceEarningPerDay += item.amount / denom;
    }
  }

  return {
    fixedEarnings: roundMoney(fixedEarnings),
    fixedDeductions: roundMoney(fixedDeductions),
    attendanceEarningPerDay,
    attendanceDeductionPerDay,
  };
}

export function countPresentDays(lines: PayLineInput[]): number {
  return lines.filter((line) => line.status === 'PRESENT').length;
}

/** Days that earn per-day attendance allowance (present, half day, paid holiday). */
export function countAllowanceDays(lines: PayLineInput[]): number {
  return lines.filter(
    (line) =>
      line.status === 'PRESENT' ||
      line.status === 'HALF_DAY' ||
      isPayrollHolidayLine(line)
  ).length;
}

export function resolvePerDayComponentSplit(params: {
  line: PayLineInput;
  compensation: CompensationInput;
  month: string;
  excludedWeekdays: number[];
}): { earning: number; deduction: number } {
  const { line, compensation, month, excludedWeekdays } = params;
  const earnsAllowance =
    line.status === 'PRESENT' ||
    line.status === 'HALF_DAY' ||
    isPayrollHolidayLine(line);
  if (!earnsAllowance) return { earning: 0, deduction: 0 };

  const comps = compensation.salaryComponents;
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  let earning = 0;
  let deduction = 0;

  if (!comps && compensation.monthlyAllowance > 0 && denom > 0) {
    earning += compensation.monthlyAllowance / denom;
  }
  if (comps) {
    earning += comps.attendanceEarningPerDay;
    deduction += comps.attendanceDeductionPerDay;
  }

  return {
    earning: roundMoney(earning),
    deduction: roundMoney(deduction),
  };
}

export function resolvePerDayAllowance(params: {
  line: PayLineInput;
  compensation: CompensationInput;
  month: string;
  excludedWeekdays: number[];
}): number {
  const { earning, deduction } = resolvePerDayComponentSplit(params);
  return roundMoney(earning - deduction);
}

export function resolveSalaryComponentCaps(params: {
  compensation: CompensationInput;
  lines: PayLineInput[];
  month: string;
  excludedWeekdays: number[];
}): { earningsCap: number; deductionsCap: number } {
  const { compensation, lines, month, excludedWeekdays } = params;
  const comps = compensation.salaryComponents;

  if (!comps) {
    const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
    let earnings = 0;
    for (const line of lines) {
      if (
        line.status !== 'PRESENT' &&
        line.status !== 'HALF_DAY' &&
        !isPayrollHolidayLine(line)
      ) {
        continue;
      }
      if (compensation.monthlyAllowance > 0 && denom > 0) {
        earnings += roundMoney(compensation.monthlyAllowance / denom);
      }
    }
    return { earningsCap: roundMoney(earnings), deductionsCap: 0 };
  }

  let attendanceEarnings = 0;
  let attendanceDeductions = 0;
  for (const line of lines) {
    const split = resolvePerDayComponentSplit({
      line,
      compensation,
      month,
      excludedWeekdays,
    });
    attendanceEarnings += split.earning;
    attendanceDeductions += split.deduction;
  }

  return {
    earningsCap: roundMoney(comps.fixedEarnings + attendanceEarnings),
    deductionsCap: roundMoney(comps.fixedDeductions + attendanceDeductions),
  };
}

/** Full-month assigned allowance (net of fixed + attendance components), for health-check display caps. */
export function resolveMonthlyAllowanceCap(
  compensation: CompensationInput,
  month: string,
  excludedWeekdays: number[]
): number {
  const comps = compensation.salaryComponents;
  if (!comps) {
    return roundMoney(Math.max(0, compensation.monthlyAllowance));
  }
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  const attendanceNet = roundMoney(
    (comps.attendanceEarningPerDay - comps.attendanceDeductionPerDay) * denom
  );
  return roundMoney(Math.max(0, comps.fixedEarnings - comps.fixedDeductions + attendanceNet));
}

export function resolveSalaryComponentDisplayTotals(params: {
  compensation: CompensationInput;
  lines: PayLineInput[];
  month: string;
  excludedWeekdays: number[];
  dayRows: Array<{ componentEarning?: number; componentDeduction?: number; allowance: number }>;
}): { earnings: number; deductions: number } {
  const { compensation, lines, month, excludedWeekdays, dayRows } = params;
  const comps = compensation.salaryComponents;

  if (!comps) {
    const earnings = roundMoney(
      dayRows.reduce((sum, day) => sum + (day.componentEarning ?? Math.max(0, day.allowance)), 0)
    );
    return { earnings, deductions: 0 };
  }

  const hasSplitOnDays = dayRows.some(
    (day) => (day.componentEarning ?? 0) > 0 || (day.componentDeduction ?? 0) > 0
  );

  if (hasSplitOnDays) {
    return {
      earnings: roundMoney(
        comps.fixedEarnings + dayRows.reduce((sum, day) => sum + (day.componentEarning ?? 0), 0)
      ),
      deductions: roundMoney(
        comps.fixedDeductions + dayRows.reduce((sum, day) => sum + (day.componentDeduction ?? 0), 0)
      ),
    };
  }

  const caps = resolveSalaryComponentCaps({ compensation, lines, month, excludedWeekdays });
  return { earnings: caps.earningsCap, deductions: caps.deductionsCap };
}

export function netSignedComponentAmount(
  amount: number,
  componentKind: SalaryComponentKind
): number {
  return componentKind === 'DEDUCTION' ? -amount : amount;
}

export function netSalaryComponentTotal(
  items: Array<{ amount: number; componentKind: SalaryComponentKind }>
): number {
  return roundMoney(
    items.reduce((sum, item) => sum + netSignedComponentAmount(item.amount, item.componentKind), 0)
  );
}

export function fixedSalaryComponentNet(totals: SalaryComponentTotals): number {
  return roundMoney(totals.fixedEarnings - totals.fixedDeductions);
}

export function attendanceSalaryComponentNet(
  totals: SalaryComponentTotals,
  presentDays: number
): number {
  return roundMoney(
    presentDays * (totals.attendanceEarningPerDay - totals.attendanceDeductionPerDay)
  );
}

/** Applies fixed + attendance-based components after base pay calculation (non–hourly-split modes). */
export function applySalaryComponentsToGross(params: {
  gross: number;
  compensation: CompensationInput;
  lines: PayLineInput[];
  breakdown: Record<string, number>;
  /** When true, per-day attendance allowance is already on day rows — only fixed monthly components are added here. */
  attendanceOnDayRows?: boolean;
}): number {
  const totals = params.compensation.salaryComponents;
  if (!totals) return params.gross;

  const presentDays = countAllowanceDays(params.lines);
  const fixedNet = fixedSalaryComponentNet(totals);
  const attendanceNet = attendanceSalaryComponentNet(totals, presentDays);

  if (fixedNet !== 0) params.breakdown.salaryComponentsFixed = fixedNet;
  if (!params.attendanceOnDayRows && attendanceNet !== 0) {
    params.breakdown.salaryComponentsAttendance = attendanceNet;
  }

  return roundMoney(params.gross + fixedNet + (params.attendanceOnDayRows ? 0 : attendanceNet));
}

export function buildCompensationInputFromAllowances(
  row: {
    monthlyBasic: { toString(): string } | number | null;
    monthlyAllowance: { toString(): string } | number | null;
    dailyRate: { toString(): string } | number | null;
  },
  allowanceItems: EmployeeAllowanceItem[],
  month: string,
  excludedWeekdays: number[]
): CompensationInput {
  const legacyAllowance = Number(row.monthlyAllowance ?? 0);
  const deduped = dedupeAllowancesByType(allowanceItems);

  if (deduped.length > 0) {
    return {
      monthlyBasic: Number(row.monthlyBasic ?? 0),
      monthlyAllowance: 0,
      dailyRate: Number(row.dailyRate ?? 0),
      salaryComponents: buildSalaryComponentTotals(
        deduped.map((item) => ({
          amount: item.amount,
          componentKind: item.componentKind,
          applicationMode: item.applicationMode,
        })),
        month,
        excludedWeekdays
      ),
    };
  }

  return {
    monthlyBasic: Number(row.monthlyBasic ?? 0),
    monthlyAllowance: legacyAllowance,
    dailyRate: Number(row.dailyRate ?? 0),
  };
}
