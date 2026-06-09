import { dedupeAllowancesByType } from '@/lib/hr/payroll/allowanceTotals';
import { denomDaysExcludingWeekdays, roundMoney } from '@/lib/hr/payroll/calendar';
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
}): number {
  const totals = params.compensation.salaryComponents;
  if (!totals) return params.gross;

  const presentDays = countPresentDays(params.lines);
  const fixedNet = fixedSalaryComponentNet(totals);
  const attendanceNet = attendanceSalaryComponentNet(totals, presentDays);

  if (fixedNet !== 0) params.breakdown.salaryComponentsFixed = fixedNet;
  if (attendanceNet !== 0) params.breakdown.salaryComponentsAttendance = attendanceNet;

  return roundMoney(params.gross + fixedNet + attendanceNet);
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
