import { prisma } from '@/lib/db/prisma';
import { attendanceLinesForPayroll } from '@/lib/hr/payroll/calculatePayLine';
import { monthBounds, monthEndDate } from '@/lib/hr/payroll/calendar';
import { getFormulaPreviewScenario } from '@/lib/hr/payroll/formulaPreviewSamples';
import { buildCompensationInputFromAllowances } from '@/lib/hr/payroll/salaryComponent';
import {
  fetchAllowancesForCompensationPackage,
} from '@/lib/hr/payroll/resolveEmployeeAllowances';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import type { CompensationInput, PayLineInput } from '@/lib/hr/payroll/types';

export type FormulaPreviewContext = {
  label: string;
  month: string;
  compensation: CompensationInput;
  lines: PayLineInput[];
  employeeId: string | null;
  employeeName: string | null;
  attendanceNote: string | null;
};

const attendanceSelect = {
  workDate: true,
  status: true,
  leaveType: true,
  basicHours: true,
  workflowStatus: true,
  checkInAt: true,
  checkOutAt: true,
  breakStartAt: true,
  breakEndAt: true,
  overtimeMinutes: true,
} as const;

function toCompensationInput(
  row: {
    monthlyBasic: { toString(): string } | number | null;
    monthlyAllowance: { toString(): string } | number | null;
    dailyRate: { toString(): string } | number | null;
    payTypeId?: string;
  },
  allowanceItems: Awaited<ReturnType<typeof fetchAllowancesForCompensationPackage>>,
  month: string,
  excludedWeekdays: number[]
): CompensationInput {
  return buildCompensationInputFromAllowances(row, allowanceItems, month, excludedWeekdays);
}

export function dummyFormulaPreviewContext(
  scenarioId: string,
  compensationOverride?: Partial<CompensationInput>
): FormulaPreviewContext {
  const scenario = getFormulaPreviewScenario(scenarioId) ?? getFormulaPreviewScenario('office')!;
  return {
    label: scenario.label,
    month: scenario.month,
    compensation: { ...scenario.compensation, ...compensationOverride },
    lines: scenario.lines,
    employeeId: null,
    employeeName: null,
    attendanceNote: `${scenario.lines.length} sample attendance rows`,
  };
}

export async function employeeFormulaPreviewContext(
  companyId: string,
  employeeId: string,
  month: string,
  compensationOverride?: Partial<CompensationInput>
): Promise<FormulaPreviewContext | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true, fullName: true, preferredName: true, employeeCode: true },
  });
  if (!employee) return null;

  const { start, end } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const [compensation, attendance, payTypes] = await Promise.all([
    prisma.employeeCompensation.findMany({
      where: { companyId, employeeId },
      orderBy: { effectiveFrom: 'desc' },
      take: 20,
    }),
    prisma.attendanceEntry.findMany({
      where: { companyId, employeeId, workDate: { gte: start, lt: end } },
      select: attendanceSelect,
    }),
    prisma.payType.findMany({
      where: { companyId },
      select: { id: true, config: true },
    }),
  ]);

  const match = compensation.find(
    (row) =>
      row.effectiveFrom <= monthEnd && (!row.effectiveTo || row.effectiveTo >= start)
  );

  const allowanceItems = match
    ? await fetchAllowancesForCompensationPackage(companyId, employeeId, match, month)
    : [];
  const payTypeConfig = match
    ? payTypes.find((pt) => pt.id === match.payTypeId)?.config
    : null;
  let excludedWeekdays = [0];
  if (payTypeConfig) {
    try {
      excludedWeekdays = resolveExcludedWeekdays(parsePayTypeConfig(payTypeConfig));
    } catch {
      excludedWeekdays = [0];
    }
  }
  const baseComp = match
    ? toCompensationInput(match, allowanceItems, month, excludedWeekdays)
    : { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 0 };

  const approved = attendance.filter((r) => r.workflowStatus === 'APPROVED');
  const draftCount = attendance.length - approved.length;
  const lines = attendanceLinesForPayroll(approved, month);
  const name = employee.preferredName || employee.fullName;

  return {
    label: `${name} (${employee.employeeCode})`,
    month,
    compensation: { ...baseComp, ...compensationOverride },
    lines,
    employeeId: employee.id,
    employeeName: name,
    attendanceNote: match
      ? `${approved.length} approved rows${draftCount > 0 ? `, ${draftCount} draft excluded` : ''}`
      : 'No compensation on file — using zeros unless overridden',
  };
}
