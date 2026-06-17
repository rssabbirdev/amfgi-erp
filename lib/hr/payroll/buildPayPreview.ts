import { prisma } from '@/lib/db/prisma';
import {
  attendanceLinesForPayroll,
  calculatePayLine,
} from '@/lib/hr/payroll/calculatePayLine';
import {
  fetchApprovedLeaveDaysForPayroll,
  mergeApprovedLeaveIntoPayLines,
} from '@/lib/hr/payroll/approvedLeaveForPayroll';
import {
  fetchCompanyHolidaysForPayroll,
  mergeCompanyHolidaysIntoPayLines,
} from '@/lib/hr/payroll/companyHolidaysForPayroll';
import {
  employeeHolidayProfileFromEmployee,
  filterCompanyHolidaysForEmployee,
  type EmployeeHolidayProfile,
} from '@/lib/hr/payroll/holidayEmployeeEligibility';
import { resolveHolidayOtSettingsForEmployee } from '@/lib/hr/payroll/holidayPayTypeLinks';
import { resolveHolidayPayTypeConfigForEmployee } from '@/lib/hr/payroll/resolveHolidayPayStructure';
import { resolveLeavePayPercentForDay } from '@/lib/hr/payroll/resolveLeavePayForDay';
import { monthBounds, monthEndDate, roundMoney } from '@/lib/hr/payroll/calendar';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import {
  compensationOverlapsMonth,
  fixedMonthlyProrationFactor,
  hasMultipleCompensationPackagesInMonth,
  listCompensationPackagesOverlappingMonth,
  resolveCompensationPackageForDate,
} from '@/lib/hr/payroll/resolveCompensationForPayroll';
import {
  buildCompensationInputFromAllowances,
  compensationWithProratedFixedMonthly,
  resolveSalaryComponentDisplayTotals,
} from '@/lib/hr/payroll/salaryComponent';
import { evaluatePayHealthCheck, evaluateTimelinePayHealthCheck, type PayHealthCheck } from '@/lib/hr/payroll/payHealthCheck';
import {
  fetchAllowancesForCompensationPackageIds,
  type EmployeeAllowanceItem,
} from '@/lib/hr/payroll/resolveEmployeeAllowances';
import type { CompensationInput, LinePayContext, PayLineInput, PayLineResult, PayTypeConfig } from '@/lib/hr/payroll/types';
import { workforceEmployeeTypeShortNameFromProfile, workforceVisaHoldingLabelFromProfile } from '@/lib/hr/workforceProfile';

export type EmployeePayPreviewRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeFullName: string;
  employeePreferredName: string | null;
  payTypeId: string | null;
  payTypeName: string | null;
  payTypeCode: string | null;
  compensationEffectiveFrom: string | null;
  workforceRoleTypeShort: string;
  visaHoldingLabel: string;
  wpsTransferAmount: number | null;
  visaSponsorName: string | null;
  gross: number;
  breakdown: Record<string, number>;
  salaryComponentEarnings: number;
  salaryComponentDeductions: number;
  dayDetails: PayLineResult['days'];
  healthCheck: PayHealthCheck | null;
  approvedAttendanceRows: number;
  draftAttendanceRows: number;
  skipped: boolean;
  skipReason: string | null;
};

const attendanceSelect = {
  workDate: true,
  status: true,
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
  basicHours: { toString(): string } | number;
  workflowStatus: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
  overtimeMinutes: number;
};

type CompensationWithPayType = {
  id: string;
  payTypeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  monthlyBasic: { toString(): string } | number | null;
  monthlyAllowance: { toString(): string } | number | null;
  dailyRate: { toString(): string } | number | null;
  wpsTransferAmount: { toString(): string } | number | null;
  visaPeriod: { sponsorType: string | null } | null;
  payType: {
    id: string;
    name: string;
    code: string;
    config: unknown;
    isActive: boolean;
  };
};

const compensationInclude = {
  payType: { select: { id: true, name: true, code: true, config: true, isActive: true } },
  visaPeriod: { select: { sponsorType: true } },
} as const;

type PayPreviewEmployeeSource = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  profileExtension: unknown;
};

function resolvePayPreviewCompensationMeta(
  employee: PayPreviewEmployeeSource,
  primaryPackage: CompensationWithPayType | null
): Pick<EmployeePayPreviewRow, 'workforceRoleTypeShort' | 'visaHoldingLabel' | 'wpsTransferAmount' | 'visaSponsorName'> {
  return {
    workforceRoleTypeShort: workforceEmployeeTypeShortNameFromProfile(employee.profileExtension),
    visaHoldingLabel: workforceVisaHoldingLabelFromProfile(employee.profileExtension),
    wpsTransferAmount:
      primaryPackage?.wpsTransferAmount != null ? Number(primaryPackage.wpsTransferAmount) : null,
    visaSponsorName: primaryPackage?.visaPeriod?.sponsorType?.trim() || null,
  };
}

function ymdFromMonthEnd(month: string): string {
  const end = monthEndDate(month);
  return end.toISOString().slice(0, 10);
}

function buildLinePayContextResolver(params: {
  packages: CompensationWithPayType[];
  allowancesByPackageId: Map<string, EmployeeAllowanceItem[]>;
  month: string;
}): (line: PayLineInput) => LinePayContext {
  const configByPackageId = new Map<string, PayTypeConfig>();
  const compensationByPackageId = new Map<string, CompensationInput>();
  const prorationByPackageId = new Map<string, number>();
  const usesProration = params.packages.length > 1;

  for (const pkg of params.packages) {
    const config = parsePayTypeConfig(pkg.payType.config);
    const excludedWeekdays = resolveExcludedWeekdays(config);
    configByPackageId.set(pkg.id, config);
    compensationByPackageId.set(
      pkg.id,
      buildCompensationInputFromAllowances(
        pkg,
        params.allowancesByPackageId.get(pkg.id) ?? [],
        params.month,
        excludedWeekdays
      )
    );
    if (usesProration) {
      prorationByPackageId.set(
        pkg.id,
        fixedMonthlyProrationFactor(params.packages, pkg.id, params.month, excludedWeekdays)
      );
    }
  }

  return (line: PayLineInput) => {
    const pkg = resolveCompensationPackageForDate(params.packages, line.workDate);
    if (!pkg) {
      throw new Error(`No compensation package applies on ${line.workDate}`);
    }
    return {
      packageId: pkg.id,
      config: configByPackageId.get(pkg.id)!,
      compensation: compensationByPackageId.get(pkg.id)!,
      fixedMonthlyProrationFactor: prorationByPackageId.get(pkg.id),
    };
  };
}

function formatCompensationEffectiveLabel(packages: CompensationWithPayType[], month: string): string {
  const active = listCompensationPackagesOverlappingMonth(packages, month);
  if (active.length === 0) return '—';
  if (active.length === 1) return active[0].effectiveFrom.toISOString().slice(0, 10);
  const dates = active.map((pkg) => pkg.effectiveFrom.toISOString().slice(0, 10));
  return `Multiple (${dates.join(', ')})`;
}

function stripLeaveFromAttendanceRows(rows: AttendanceRow[]): AttendanceRow[] {
  return rows.map((row) => ({
    ...row,
    status: row.status === 'LEAVE' ? 'ABSENT' : row.status,
  }));
}

async function buildMergedPayLinesForEmployee(
  companyId: string,
  employeeId: string,
  month: string,
  attendanceRows: AttendanceRow[],
  employeePayTypeId: string | null,
  employeeHolidayProfile: EmployeeHolidayProfile,
  employeePayMode?: string | null
): Promise<PayLineInput[]> {
  const attendanceOnly = stripLeaveFromAttendanceRows(attendanceRows);
  const defaultBasicHours =
    attendanceOnly.length > 0 ? Number(attendanceOnly[0].basicHours) || 8 : 8;

  let lines = attendanceLinesForPayroll(attendanceOnly, month);
  const approvedLeaveDays = await fetchApprovedLeaveDaysForPayroll(prisma, companyId, month, [
    employeeId,
  ]);
  lines = mergeApprovedLeaveIntoPayLines(lines, approvedLeaveDays, defaultBasicHours);

  const companyHolidays = await fetchCompanyHolidaysForPayroll(prisma, companyId, month);
  const eligibleHolidays = filterCompanyHolidaysForEmployee(companyHolidays, employeeHolidayProfile);
  lines = mergeCompanyHolidaysIntoPayLines(lines, eligibleHolidays, defaultBasicHours);

  const holidayPayTypeIds = [
    ...new Set(eligibleHolidays.flatMap((holiday) => holiday.payTypeIds).filter(Boolean)),
  ];
  const holidayPayConfigById = new Map<string, PayTypeConfig>();
  if (holidayPayTypeIds.length > 0) {
    const payTypes = await prisma.payType.findMany({
      where: { companyId, id: { in: holidayPayTypeIds }, isActive: true },
      select: { id: true, config: true },
    });
    for (const payType of payTypes) {
      try {
        holidayPayConfigById.set(payType.id, parsePayTypeConfig(payType.config));
      } catch {
        // skip invalid configs
      }
    }
  }

  const leaveByDate = new Map(approvedLeaveDays.map((day) => [day.workDateYmd, day]));
  const holidayByDate = new Map(eligibleHolidays.map((holiday) => [holiday.workDateYmd, holiday]));
  const enriched: PayLineInput[] = [];

  for (const line of lines) {
    let next = line;
    if (line.isHoliday && line.holidayPaid !== false) {
      const holiday = holidayByDate.get(line.workDate);
      const configuredIds = holiday?.payTypeIds ?? line.holidayPayTypeIds ?? [];
      const resolved = resolveHolidayPayTypeConfigForEmployee({
        holidayPayTypeIds: configuredIds,
        employeePayTypeId,
        configById: holidayPayConfigById,
      });
      const otSettings = resolveHolidayOtSettingsForEmployee({
        payTypeLinks: holiday?.payTypeLinks ?? line.holidayPayTypeLinks ?? [],
        resolvedPayTypeId: resolved.payTypeId,
        employeePayTypeId,
        employeePayMode,
      });
      next = {
        ...line,
        holidayPayTypeIds: configuredIds,
        holidayPayTypeId: resolved.payTypeId,
        holidayPayTypeConfig: resolved.config,
        holidayPayWorkedHoursAtOt: holiday?.isPaid ? otSettings.payWorkedHoursAtOt : false,
        holidayOtPercent: otSettings.holidayOtPercent,
      };
    }
    if (!next.leaveRequestId || !next.leaveTypeId) {
      enriched.push(next);
      continue;
    }
    const leaveDay = leaveByDate.get(line.workDate);
    const leavePayPercent = leaveDay
      ? await resolveLeavePayPercentForDay(prisma, {
          companyId,
          employeeId,
          workDateYmd: line.workDate,
          leaveTypeId: line.leaveTypeId,
          rules: leaveDay.rules,
        })
      : 100;
    enriched.push({ ...next, leavePayPercent });
  }

  return enriched;
}

function computeEmployeePayPreviewRow(
  employee: PayPreviewEmployeeSource,
  month: string,
  packages: CompensationWithPayType[],
  attendanceRowCount: number,
  lines: PayLineInput[],
  allowancesByPackageId: Map<string, EmployeeAllowanceItem[]>
): EmployeePayPreviewRow {
  const name = employee.preferredName || employee.fullName;
  const draftCount = 0;
  const activePackages = packages.filter((pkg) => pkg.payType.isActive);
  const monthPackages = listCompensationPackagesOverlappingMonth(activePackages, month);
  const primaryPackage =
    resolveCompensationPackageForDate(monthPackages, ymdFromMonthEnd(month)) ??
    monthPackages[monthPackages.length - 1] ??
    null;
  const compensationMeta = resolvePayPreviewCompensationMeta(employee, primaryPackage);

  if (activePackages.length === 0) {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: name,
      employeeFullName: employee.fullName,
      employeePreferredName: employee.preferredName,
      payTypeId: null,
      payTypeName: null,
      payTypeCode: null,
      compensationEffectiveFrom: null,
      ...compensationMeta,
      gross: 0,
      breakdown: {},
      salaryComponentEarnings: 0,
      salaryComponentDeductions: 0,
      dayDetails: [],
      healthCheck: null,
      approvedAttendanceRows: attendanceRowCount,
      draftAttendanceRows: draftCount,
      skipped: true,
      skipReason: 'No active compensation for this month',
    };
  }

  if (monthPackages.length === 0) {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: name,
      employeeFullName: employee.fullName,
      employeePreferredName: employee.preferredName,
      payTypeId: null,
      payTypeName: null,
      payTypeCode: null,
      compensationEffectiveFrom: null,
      ...compensationMeta,
      gross: 0,
      breakdown: {},
      salaryComponentEarnings: 0,
      salaryComponentDeductions: 0,
      dayDetails: [],
      healthCheck: null,
      approvedAttendanceRows: attendanceRowCount,
      draftAttendanceRows: draftCount,
      skipped: true,
      skipReason: 'No active compensation for this month',
    };
  }

  let config: PayTypeConfig;
  try {
    config = parsePayTypeConfig(primaryPackage.payType.config);
  } catch {
    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: name,
      employeeFullName: employee.fullName,
      employeePreferredName: employee.preferredName,
      payTypeId: primaryPackage.payTypeId,
      payTypeName: primaryPackage.payType.name,
      payTypeCode: primaryPackage.payType.code,
      compensationEffectiveFrom: formatCompensationEffectiveLabel(monthPackages, month),
      ...compensationMeta,
      gross: 0,
      breakdown: {},
      salaryComponentEarnings: 0,
      salaryComponentDeductions: 0,
      dayDetails: [],
      healthCheck: null,
      approvedAttendanceRows: attendanceRowCount,
      draftAttendanceRows: draftCount,
      skipped: true,
      skipReason: 'Invalid pay type configuration',
    };
  }

  const usesDateWiseCompensation = hasMultipleCompensationPackagesInMonth(monthPackages, month);
  const resolveLineContext = usesDateWiseCompensation
    ? buildLinePayContextResolver({
        packages: monthPackages,
        allowancesByPackageId,
        month,
      })
    : undefined;

  const primaryAllowances = allowancesByPackageId.get(primaryPackage.id) ?? [];
  const compensationInput = buildCompensationInputFromAllowances(
    primaryPackage,
    primaryAllowances,
    month,
    resolveExcludedWeekdays(config)
  );

  const result = calculatePayLine({
    month,
    config,
    compensation: compensationInput,
    lines,
    resolveLineContext,
  });

  const healthCheck = usesDateWiseCompensation
    ? evaluateTimelinePayHealthCheck({
        month,
        primaryConfig: config,
        packages: monthPackages.map((pkg) => {
          const pkgConfig = parsePayTypeConfig(pkg.payType.config);
          return {
            packageId: pkg.id,
            config: pkgConfig,
            compensation: buildCompensationInputFromAllowances(
              pkg,
              allowancesByPackageId.get(pkg.id) ?? [],
              month,
              resolveExcludedWeekdays(pkgConfig)
            ),
            fixedMonthlyProrationFactor: fixedMonthlyProrationFactor(
              monthPackages,
              pkg.id,
              month,
              resolveExcludedWeekdays(pkgConfig)
            ),
          };
        }),
        result,
        lines,
        resolvePackageId: (line) =>
          resolveCompensationPackageForDate(monthPackages, line.workDate)?.id ?? '',
      })
    : evaluatePayHealthCheck({
        month,
        config,
        compensation: compensationInput,
        result,
        lines,
      });

  let salaryComponentEarnings = 0;
  let salaryComponentDeductions = 0;
  if (usesDateWiseCompensation) {
    for (const pkg of monthPackages) {
      const pkgConfig = parsePayTypeConfig(pkg.payType.config);
      const excludedWeekdays = resolveExcludedWeekdays(pkgConfig);
      const prorationFactor = fixedMonthlyProrationFactor(
        monthPackages,
        pkg.id,
        month,
        excludedWeekdays
      );
      const pkgCompensation = compensationWithProratedFixedMonthly(
        buildCompensationInputFromAllowances(
          pkg,
          allowancesByPackageId.get(pkg.id) ?? [],
          month,
          excludedWeekdays
        ),
        prorationFactor
      );
      const pkgLines = lines.filter(
        (line) => resolveCompensationPackageForDate(monthPackages, line.workDate)?.id === pkg.id
      );
      const pkgDayRows = result.days.filter((day) =>
        pkgLines.some((line) => line.workDate === day.date)
      );
      const totals = resolveSalaryComponentDisplayTotals({
        compensation: pkgCompensation,
        lines: pkgLines,
        month,
        excludedWeekdays,
        dayRows: pkgDayRows,
      });
      salaryComponentEarnings += totals.earnings;
      salaryComponentDeductions += totals.deductions;
    }
    salaryComponentEarnings = roundMoney(salaryComponentEarnings);
    salaryComponentDeductions = roundMoney(salaryComponentDeductions);
  } else {
    const totals = resolveSalaryComponentDisplayTotals({
      compensation: compensationInput,
      lines,
      month,
      excludedWeekdays: resolveExcludedWeekdays(config),
      dayRows: result.days,
    });
    salaryComponentEarnings = totals.earnings;
    salaryComponentDeductions = totals.deductions;
  }

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: name,
    employeeFullName: employee.fullName,
    employeePreferredName: employee.preferredName,
    payTypeId: primaryPackage.payTypeId,
    payTypeName: primaryPackage.payType.name,
    payTypeCode: primaryPackage.payType.code,
    compensationEffectiveFrom: formatCompensationEffectiveLabel(monthPackages, month),
    ...compensationMeta,
    gross: result.gross,
    breakdown: result.breakdown,
    salaryComponentEarnings,
    salaryComponentDeductions,
    dayDetails: result.days,
    healthCheck,
    approvedAttendanceRows: attendanceRowCount,
    draftAttendanceRows: draftCount,
    skipped: false,
    skipReason: null,
  };
}

async function fetchCompensationPackagesForEmployee(
  companyId: string,
  employeeId: string,
  month: string
): Promise<CompensationWithPayType[]> {
  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const rows = await prisma.employeeCompensation.findMany({
    where: { companyId, employeeId },
    include: compensationInclude,
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.filter((row) =>
    compensationOverlapsMonth(row.effectiveFrom, row.effectiveTo, monthStart, monthEnd)
  );
}

export async function buildEmployeePayPreview(
  companyId: string,
  employeeId: string,
  month: string
): Promise<EmployeePayPreviewRow | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      preferredName: true,
      employmentType: true,
      profileExtension: true,
    },
  });
  if (!employee) return null;

  const { start, end } = monthBounds(month);

  const packages = await fetchCompensationPackagesForEmployee(companyId, employeeId, month);
  const packageIds = packages.map((pkg) => pkg.id);
  const [attendance, allowancesByPackageId] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where: { companyId, employeeId, workDate: { gte: start, lt: end } },
      select: attendanceSelect,
    }),
    fetchAllowancesForCompensationPackageIds(companyId, packageIds, month),
  ]);

  const monthPackages = listCompensationPackagesOverlappingMonth(
    packages.filter((pkg) => pkg.payType.isActive),
    month
  );
  const primaryPackage =
    resolveCompensationPackageForDate(monthPackages, ymdFromMonthEnd(month)) ??
    monthPackages[monthPackages.length - 1];

  const lines = await buildMergedPayLinesForEmployee(
    companyId,
    employeeId,
    month,
    attendance,
    primaryPackage?.payTypeId ?? null,
    employeeHolidayProfileFromEmployee(employee),
    primaryPackage ? parsePayTypeConfig(primaryPackage.payType.config).mode : null
  );

  return computeEmployeePayPreviewRow(
    employee,
    month,
    packages,
    attendance.length,
    lines,
    allowancesByPackageId
  );
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
      visaPeriod: { select: { sponsorType: true } },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          preferredName: true,
          employmentType: true,
          profileExtension: true,
        },
      },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });

  const compensationByEmployee = new Map<string, (typeof compensationRows)[number][]>();
  for (const row of compensationRows) {
    const list = compensationByEmployee.get(row.employeeId) ?? [];
    list.push(row);
    compensationByEmployee.set(row.employeeId, list);
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

  const allPackageIds = compensationRows.map((row) => row.id);
  const allowancesByPackageId = await fetchAllowancesForCompensationPackageIds(
    companyId,
    allPackageIds,
    month
  );

  const rows: EmployeePayPreviewRow[] = [];
  for (const [employeeId, employeePackages] of compensationByEmployee) {
    const employee = employeePackages[0].employee;
    const monthPackages = listCompensationPackagesOverlappingMonth(
      employeePackages.filter((pkg) => pkg.payType.isActive),
      month
    );
    const primaryPackage =
      resolveCompensationPackageForDate(monthPackages, ymdFromMonthEnd(month)) ??
      monthPackages[monthPackages.length - 1];
    const rawAttendance = attendanceByEmployee.get(employeeId) ?? [];
    const lines = await buildMergedPayLinesForEmployee(
      companyId,
      employeeId,
      month,
      rawAttendance,
      primaryPackage?.payTypeId ?? null,
      employeeHolidayProfileFromEmployee(employee),
      primaryPackage ? parsePayTypeConfig(primaryPackage.payType.config).mode : null
    );
    rows.push(
      computeEmployeePayPreviewRow(
        employee,
        month,
        employeePackages,
        rawAttendance.length,
        lines,
        allowancesByPackageId
      )
    );
  }

  rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return { month, employees: rows };
}
