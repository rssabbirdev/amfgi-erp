import { prisma } from '@/lib/db/prisma';
import {
  attendanceLinesForPayroll,
  calculatePayLine,
} from '@/lib/hr/payroll/calculatePayLine';
import { resolveLeavePayPercentForDay } from '@/lib/hr/payroll/resolveLeavePayForDay';
import { monthBounds, monthEndDate } from '@/lib/hr/payroll/calendar';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import { buildCompensationInputFromAllowances } from '@/lib/hr/payroll/salaryComponent';
import {
  fetchAllowancesByCompensationIdsForMonth,
  fetchAllowancesForCompensationPackage,
  type EmployeeAllowanceItem,
} from '@/lib/hr/payroll/resolveEmployeeAllowances';
import type { CompensationInput, PayLineResult, PayTypeConfig } from '@/lib/hr/payroll/types';

export type EmployeePayPreviewRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payTypeId: string | null;
  payTypeName: string | null;
  payTypeCode: string | null;
  compensationEffectiveFrom: string | null;
  gross: number;
  breakdown: Record<string, number>;
  dayDetails: PayLineResult['days'];
  approvedAttendanceRows: number;
  draftAttendanceRows: number;
  skipped: boolean;
  skipReason: string | null;
};

const attendanceSelect = {
  workDate: true,
  status: true,
  leaveType: true,
  leaveTypeId: true,
  leaveTypeRef: { select: { id: true, rules: true } },
  basicHours: true,
  workflowStatus: true,
  checkInAt: true,
  checkOutAt: true,
  breakStartAt: true,
  breakEndAt: true,
  overtimeMinutes: true,
} as const;

type AttendanceRow = {
  workDate: Date;
  status: string;
  leaveType: string | null;
  leaveTypeId?: string | null;
  leaveTypeRef?: { id: string; rules: unknown } | null;
  leavePayPercent?: number;
  basicHours: { toString(): string } | number;
  workflowStatus: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
  overtimeMinutes: number;
};

async function enrichAttendanceWithLeavePay(
  companyId: string,
  employeeId: string,
  rows: AttendanceRow[]
): Promise<AttendanceRow[]> {
  const out: AttendanceRow[] = [];
  for (const row of rows) {
    if (row.status !== 'LEAVE' || !row.leaveTypeId || !row.leaveTypeRef) {
      out.push(row);
      continue;
    }
    const leavePayPercent = await resolveLeavePayPercentForDay(prisma, {
      companyId,
      employeeId,
      workDateYmd: row.workDate.toISOString().slice(0, 10),
      leaveTypeId: row.leaveTypeId,
      rules: row.leaveTypeRef.rules,
    });
    out.push({ ...row, leavePayPercent });
  }
  return out;
}

type CompensationWithPayType = {
  payTypeId: string;
  effectiveFrom: Date;
  monthlyBasic: { toString(): string } | number | null;
  monthlyAllowance: { toString(): string } | number | null;
  dailyRate: { toString(): string } | number | null;
  payType: {
    id: string;
    name: string;
    code: string;
    config: unknown;
    isActive: boolean;
  };
};

function compensationOverlapsMonth(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  monthStart: Date,
  monthEnd: Date
) {
  if (effectiveFrom > monthEnd) return false;
  if (effectiveTo && effectiveTo < monthStart) return false;
  return true;
}

function computeEmployeePayPreviewRow(
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    preferredName: string | null;
  },
  month: string,
  compensation: CompensationWithPayType | null,
  attendance: AttendanceRow[],
  allowanceItems: EmployeeAllowanceItem[] = []
): EmployeePayPreviewRow {
  const name = employee.preferredName || employee.fullName;
  const approved = attendance.filter((r) => r.workflowStatus === 'APPROVED');
  const draftCount = attendance.filter((r) => r.workflowStatus !== 'APPROVED').length;

  if (!compensation) {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: name,
      payTypeId: null,
      payTypeName: null,
      payTypeCode: null,
      compensationEffectiveFrom: null,
      gross: 0,
      breakdown: {},
      dayDetails: [],
      approvedAttendanceRows: approved.length,
      draftAttendanceRows: draftCount,
      skipped: true,
      skipReason: 'No active compensation for this month',
    };
  }

  let config: PayTypeConfig;
  try {
    config = parsePayTypeConfig(compensation.payType.config);
  } catch {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: name,
      payTypeId: compensation.payTypeId,
      payTypeName: compensation.payType.name,
      payTypeCode: compensation.payType.code,
      compensationEffectiveFrom: compensation.effectiveFrom.toISOString().slice(0, 10),
      gross: 0,
      breakdown: {},
      dayDetails: [],
      approvedAttendanceRows: approved.length,
      draftAttendanceRows: draftCount,
      skipped: true,
      skipReason: 'Invalid pay type configuration',
    };
  }

  const lines = attendanceLinesForPayroll(approved, month);
  const result = calculatePayLine({
    month,
    config,
    compensation: buildCompensationInputFromAllowances(
      compensation,
      allowanceItems,
      month,
      resolveExcludedWeekdays(config)
    ),
    lines,
  });

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: name,
    payTypeId: compensation.payTypeId,
    payTypeName: compensation.payType.name,
    payTypeCode: compensation.payType.code,
    compensationEffectiveFrom: compensation.effectiveFrom.toISOString().slice(0, 10),
    gross: result.gross,
    breakdown: result.breakdown,
    dayDetails: result.days,
    approvedAttendanceRows: approved.length,
    draftAttendanceRows: draftCount,
    skipped: false,
    skipReason: null,
  };
}

async function resolveCompensationForMonth(
  companyId: string,
  employeeId: string,
  month: string
) {
  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const rows = await prisma.employeeCompensation.findMany({
    where: { companyId, employeeId },
    include: { payType: { select: { id: true, name: true, code: true, config: true, isActive: true } } },
    orderBy: { effectiveFrom: 'desc' },
  });

  const match = rows.find((row) =>
    compensationOverlapsMonth(row.effectiveFrom, row.effectiveTo, monthStart, monthEnd)
  );
  if (!match || !match.payType.isActive) return null;
  return match;
}

export async function buildEmployeePayPreview(
  companyId: string,
  employeeId: string,
  month: string
): Promise<EmployeePayPreviewRow | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true, employeeCode: true, fullName: true, preferredName: true },
  });
  if (!employee) return null;

  const { start, end } = monthBounds(month);

  const compensation = await resolveCompensationForMonth(companyId, employeeId, month);
  const [attendance, allowanceItems] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where: { companyId, employeeId, workDate: { gte: start, lt: end } },
      select: attendanceSelect,
    }),
    compensation
      ? fetchAllowancesForCompensationPackage(companyId, employeeId, compensation, month)
      : Promise.resolve([] as EmployeeAllowanceItem[]),
  ]);

  const enrichedAttendance = await enrichAttendanceWithLeavePay(companyId, employeeId, attendance);

  return computeEmployeePayPreviewRow(employee, month, compensation, enrichedAttendance, allowanceItems);
}

export async function buildPayrollPreview(
  companyId: string,
  month: string,
  employeeId?: string | null
) {
  if (employeeId) {
    const row = await buildEmployeePayPreview(companyId, employeeId, month);
    if (!row) throw new Error('Employee not found');
    return { month, employees: [row] };
  }

  const { start, end } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const compensationRows = await prisma.employeeCompensation.findMany({
    where: {
      companyId,
      effectiveFrom: { lte: monthEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
    },
    include: {
      payType: { select: { id: true, name: true, code: true, config: true, isActive: true } },
      employee: {
        select: { id: true, employeeCode: true, fullName: true, preferredName: true },
      },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  const compensationByEmployee = new Map<string, (typeof compensationRows)[number]>();
  for (const row of compensationRows) {
    if (!compensationByEmployee.has(row.employeeId)) {
      compensationByEmployee.set(row.employeeId, row);
    }
  }

  const employeeIds = [...compensationByEmployee.keys()];
  if (employeeIds.length === 0) {
    return { month, employees: [] };
  }

  const attendanceRows = await prisma.attendanceEntry.findMany({
    where: {
      companyId,
      employeeId: { in: employeeIds },
      workDate: { gte: start, lt: end },
    },
    select: { ...attendanceSelect, employeeId: true },
  });

  const attendanceByEmployee = new Map<string, AttendanceRow[]>();
  for (const row of attendanceRows) {
    const list = attendanceByEmployee.get(row.employeeId) ?? [];
    list.push(row);
    attendanceByEmployee.set(row.employeeId, list);
  }

  const allowancesByEmployee = await fetchAllowancesByCompensationIdsForMonth(
    companyId,
    [...compensationByEmployee.values()].map((comp) => ({
      id: comp.id,
      employeeId: comp.employeeId,
      effectiveFrom: comp.effectiveFrom,
      effectiveTo: comp.effectiveTo,
    })),
    month
  );

  const rows: EmployeePayPreviewRow[] = [];
  for (const comp of compensationByEmployee.values()) {
    const activeComp = comp.payType.isActive ? comp : null;
    const rawAttendance = attendanceByEmployee.get(comp.employeeId) ?? [];
    const enrichedAttendance = await enrichAttendanceWithLeavePay(
      companyId,
      comp.employeeId,
      rawAttendance
    );
    rows.push(
      computeEmployeePayPreviewRow(
        comp.employee,
        month,
        activeComp,
        enrichedAttendance,
        allowancesByEmployee.get(comp.employeeId) ?? []
      )
    );
  }

  rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return { month, employees: rows };
}
