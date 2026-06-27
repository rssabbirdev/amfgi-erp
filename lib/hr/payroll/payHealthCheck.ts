import { roundMoney } from '@/lib/hr/payroll/calendar';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import {
  compensationWithProratedFixedMonthly,
  resolveMonthlyAllowanceCap,
  resolveSalaryComponentCaps,
  resolveSalaryComponentDisplayTotals,
} from '@/lib/hr/payroll/salaryComponent';
import type {
  CompensationInput,
  PayLineInput,
  PayLineResult,
  PayTypeConfig,
} from '@/lib/hr/payroll/types';

const MONEY_TOLERANCE = 0.05;
const OT_ZERO_TOLERANCE = 0.01;

export type PayHealthCheck = {
  ok: boolean;
  issues: string[];
  basicPaid: number;
  basicCap: number;
  allowancePaid: number;
  allowanceCap: number;
  componentEarningsPaid: number;
  componentEarningsCap: number;
  componentDeductionsPaid: number;
  componentDeductionsCap: number;
};

function resolveComponentCaps(
  compensation: CompensationInput,
  month: string,
  excludedWeekdays: number[],
  lines: PayLineInput[]
): { earningsCap: number; deductionsCap: number } {
  return resolveSalaryComponentCaps({ compensation, lines, month, excludedWeekdays });
}

function resolveDayAllowanceNetTotal(result: PayLineResult): number {
  return roundMoney(
    result.days.reduce((sum, day) => {
      const dayComponentNet =
        day.componentEarning != null || day.componentDeduction != null
          ? roundMoney((day.componentEarning ?? 0) - (day.componentDeduction ?? 0))
          : day.allowance;
      return sum + dayComponentNet;
    }, 0)
  );
}

function resolveOutsideCapPayTotal(breakdown: Record<string, number>): number {
  return roundMoney(
    (breakdown.outsideCapOt ?? 0) +
      (breakdown.holidayWorkedOt ?? 0) +
      (breakdown.excludedWeekdayOt ?? 0)
  );
}

function resolveBasicPaid(
  config: PayTypeConfig,
  compensation: CompensationInput,
  result: PayLineResult
): number {
  void compensation;

  if (config.mode === 'MONTHLY_CALENDAR_DEDUCT' || config.mode === 'MONTHLY_FIXED') {
    const outsideCapPay = resolveOutsideCapPayTotal(result.breakdown);
    const componentFixed = result.breakdown.salaryComponentsFixed ?? 0;
    const componentAttendance = result.breakdown.salaryComponentsAttendance ?? 0;
    const dayAllowanceNet = resolveDayAllowanceNetTotal(result);
    const allowanceInGross = roundMoney(
      dayAllowanceNet > 0 ? dayAllowanceNet + componentFixed : componentFixed + componentAttendance
    );
    return roundMoney(result.gross - outsideCapPay - allowanceInGross);
  }

  if (config.mode === 'HOURLY_SPLIT') {
    return roundMoney(result.days.reduce((sum, day) => sum + day.basicHourSalary, 0));
  }

  return roundMoney(result.days.reduce((sum, day) => sum + day.basicHourSalary, 0));
}

export function evaluatePayHealthCheck(params: {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  result: PayLineResult;
  lines: PayLineInput[];
}): PayHealthCheck {
  const { month, config, compensation, result, lines } = params;
  const issues: string[] = [];
  const excludedWeekdays = resolveExcludedWeekdays(config);

  const basicPaid = resolveBasicPaid(config, compensation, result);
  const { earningsCap, deductionsCap } = resolveComponentCaps(
    compensation,
    month,
    excludedWeekdays,
    lines
  );
  const componentTotals = resolveSalaryComponentDisplayTotals({
    compensation,
    lines,
    month,
    excludedWeekdays,
    dayRows: result.days,
  });
  const componentEarningsPaid = componentTotals.earnings;
  const componentDeductionsPaid = componentTotals.deductions;
  const allowancePaid = roundMoney(componentEarningsPaid - componentDeductionsPaid);
  const allowanceCap = resolveMonthlyAllowanceCap(compensation, month, excludedWeekdays);

  if (compensation.monthlyBasic > 0 && basicPaid > compensation.monthlyBasic + MONEY_TOLERANCE) {
    issues.push(
      `Basic pay ${basicPaid.toFixed(2)} exceeds assigned monthly basic ${compensation.monthlyBasic.toFixed(2)}`
    );
  }

  if (earningsCap > 0 && componentEarningsPaid > earningsCap + MONEY_TOLERANCE) {
    issues.push(
      `Earnings ${componentEarningsPaid.toFixed(2)} exceed assigned earnings cap ${earningsCap.toFixed(2)}`
    );
  }

  if (deductionsCap > 0 && componentDeductionsPaid > deductionsCap + MONEY_TOLERANCE) {
    issues.push(
      `Deductions ${componentDeductionsPaid.toFixed(2)} exceed assigned deduction cap ${deductionsCap.toFixed(2)}`
    );
  }

  for (const day of result.days) {
    if (day.otHours <= 0 && Math.abs(day.otHourSalary) >= OT_ZERO_TOLERANCE) {
      issues.push(
        `${day.date}: OT salary ${day.otHourSalary.toFixed(2)} with ${day.otHours} OT hours`
      );
    }
    const dayComponentNet =
      day.componentEarning != null || day.componentDeduction != null
        ? roundMoney((day.componentEarning ?? 0) - (day.componentDeduction ?? 0))
        : day.allowance;
    const parts = roundMoney(day.basicHourSalary + day.otHourSalary + dayComponentNet);
    if (Math.abs(parts - day.totalSalary) > MONEY_TOLERANCE) {
      issues.push(
        `${day.date}: components (${parts.toFixed(2)}) do not match day total ${day.totalSalary.toFixed(2)}`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    basicPaid,
    basicCap: compensation.monthlyBasic,
    allowancePaid,
    allowanceCap,
    componentEarningsPaid,
    componentEarningsCap: earningsCap,
    componentDeductionsPaid,
    componentDeductionsCap: deductionsCap,
  };
}

export type TimelinePackageHealthInput = {
  packageId: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  fixedMonthlyProrationFactor: number;
};

/** Health check when multiple compensation packages apply in the same month. */
export function evaluateTimelinePayHealthCheck(params: {
  month: string;
  primaryConfig: PayTypeConfig;
  packages: TimelinePackageHealthInput[];
  result: PayLineResult;
  lines: PayLineInput[];
  resolvePackageId: (line: PayLineInput) => string;
}): PayHealthCheck {
  const { month, primaryConfig, packages, result, lines, resolvePackageId } = params;
  const issues: string[] = [];

  let earningsCap = 0;
  let deductionsCap = 0;
  let componentEarningsPaid = 0;
  let componentDeductionsPaid = 0;
  let basicCap = 0;
  let allowanceCap = 0;

  for (const pkg of packages) {
    const pkgLines = lines.filter((line) => resolvePackageId(line) === pkg.packageId);
    const excludedWeekdays = resolveExcludedWeekdays(pkg.config);
    const proratedCompensation = compensationWithProratedFixedMonthly(
      pkg.compensation,
      pkg.fixedMonthlyProrationFactor
    );
    const caps = resolveComponentCaps(proratedCompensation, month, excludedWeekdays, pkgLines);
    earningsCap = roundMoney(earningsCap + caps.earningsCap);
    deductionsCap = roundMoney(deductionsCap + caps.deductionsCap);
    basicCap = roundMoney(
      basicCap + pkg.compensation.monthlyBasic * pkg.fixedMonthlyProrationFactor
    );
    allowanceCap = roundMoney(
      allowanceCap + resolveMonthlyAllowanceCap(proratedCompensation, month, excludedWeekdays)
    );

    const pkgDayRows = result.days.filter((day) =>
      pkgLines.some((line) => line.workDate === day.date)
    );
    const totals = resolveSalaryComponentDisplayTotals({
      compensation: proratedCompensation,
      lines: pkgLines,
      month,
      excludedWeekdays,
      dayRows: pkgDayRows,
    });
    componentEarningsPaid = roundMoney(componentEarningsPaid + totals.earnings);
    componentDeductionsPaid = roundMoney(componentDeductionsPaid + totals.deductions);
  }

  const basicPaid = resolveBasicPaid(primaryConfig, packages[packages.length - 1]?.compensation ?? {
    monthlyBasic: 0,
    monthlyAllowance: 0,
    dailyRate: 0,
  }, result);
  const allowancePaid = roundMoney(componentEarningsPaid - componentDeductionsPaid);

  if (basicCap > 0 && basicPaid > basicCap + MONEY_TOLERANCE) {
    issues.push(
      `Basic pay ${basicPaid.toFixed(2)} exceeds assigned monthly basic ${basicCap.toFixed(2)}`
    );
  }

  if (earningsCap > 0 && componentEarningsPaid > earningsCap + MONEY_TOLERANCE) {
    issues.push(
      `Earnings ${componentEarningsPaid.toFixed(2)} exceed assigned earnings cap ${earningsCap.toFixed(2)}`
    );
  }

  if (deductionsCap > 0 && componentDeductionsPaid > deductionsCap + MONEY_TOLERANCE) {
    issues.push(
      `Deductions ${componentDeductionsPaid.toFixed(2)} exceed assigned deduction cap ${deductionsCap.toFixed(2)}`
    );
  }

  for (const day of result.days) {
    if (day.otHours <= 0 && Math.abs(day.otHourSalary) >= OT_ZERO_TOLERANCE) {
      issues.push(
        `${day.date}: OT salary ${day.otHourSalary.toFixed(2)} with ${day.otHours} OT hours`
      );
    }
    const dayComponentNet =
      day.componentEarning != null || day.componentDeduction != null
        ? roundMoney((day.componentEarning ?? 0) - (day.componentDeduction ?? 0))
        : day.allowance;
    const parts = roundMoney(day.basicHourSalary + day.otHourSalary + dayComponentNet);
    if (Math.abs(parts - day.totalSalary) > MONEY_TOLERANCE) {
      issues.push(
        `${day.date}: components (${parts.toFixed(2)}) do not match day total ${day.totalSalary.toFixed(2)}`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    basicPaid,
    basicCap,
    allowancePaid,
    allowanceCap,
    componentEarningsPaid,
    componentEarningsCap: earningsCap,
    componentDeductionsPaid,
    componentDeductionsCap: deductionsCap,
  };
}
