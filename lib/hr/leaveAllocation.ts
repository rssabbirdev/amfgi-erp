import type { Prisma, PrismaClient } from '@prisma/client';

import {
  type LeaveAllocationBasis,
  parseLeaveTypeRules,
} from '@/lib/hr/leaveTypeRules';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type EmployeeAllocationInput = {
  hireDate: Date | null;
  profileExtension: unknown;
  visaPeriods: Array<{ startDate: Date }>;
};

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Resolve the anchor date used to prorate annual leave entitlement for a calendar year. */
export function resolveLeaveAllocationStartDate(
  employee: EmployeeAllocationInput,
  basis: LeaveAllocationBasis | undefined,
): Date | null {
  const effectiveBasis = basis ?? 'HIRE_DATE';
  const hireDate = employee.hireDate ? startOfUtcDay(employee.hireDate) : null;

  if (effectiveBasis === 'HIRE_DATE') {
    return hireDate;
  }

  const profile = parseWorkforceProfile(employee.profileExtension);
  if (profile.visaHolding === 'COMPANY_PROVIDED' && employee.visaPeriods.length > 0) {
    let oldest: Date | null = null;
    for (const visaPeriod of employee.visaPeriods) {
      const start = startOfUtcDay(visaPeriod.startDate);
      if (!oldest || start < oldest) oldest = start;
    }
    if (oldest) return oldest;
  }

  return hireDate;
}

/** Prorate full-year entitlement when the allocation anchor falls mid-calendar-year. */
export function prorateAnnualEntitlement(
  fullEntitlementDays: number,
  allocationStart: Date | null,
  year: number,
): number {
  if (fullEntitlementDays <= 0) return 0;
  if (!allocationStart) return fullEntitlementDays;

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const anchor = startOfUtcDay(allocationStart);

  if (anchor > yearEnd) return 0;
  if (anchor <= yearStart) return fullEntitlementDays;

  const monthsRemaining = 12 - anchor.getUTCMonth();
  const prorated = (fullEntitlementDays * monthsRemaining) / 12;
  return Math.round(prorated * 100) / 100;
}

export type LeaveEntitlementConfig = {
  fullEntitlementDays: number;
  allocationBasis: LeaveAllocationBasis;
};

export async function getLeaveEntitlementConfig(
  prisma: PrismaLike,
  companyId: string,
): Promise<LeaveEntitlementConfig> {
  const annual = await prisma.leaveType.findFirst({
    where: { companyId, code: 'ANNUAL', isActive: true },
    select: { rules: true },
  });
  if (annual) {
    const rules = parseLeaveTypeRules(annual.rules);
    const fullEntitlementDays =
      rules.entitlementDays && rules.entitlementDays > 0 ? rules.entitlementDays : 30;
    return {
      fullEntitlementDays,
      allocationBasis: rules.allocationBasis ?? 'HIRE_DATE',
    };
  }

  const fallback = await prisma.leaveType.findFirst({
    where: { companyId, isActive: true },
    select: { rules: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (fallback) {
    const rules = parseLeaveTypeRules(fallback.rules);
    if (rules.deductFromBalance && rules.entitlementDays && rules.entitlementDays > 0) {
      return {
        fullEntitlementDays: rules.entitlementDays,
        allocationBasis: rules.allocationBasis ?? 'HIRE_DATE',
      };
    }
  }

  return { fullEntitlementDays: 30, allocationBasis: 'HIRE_DATE' };
}

export async function computeEmployeeLeaveEntitlement(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  year: number,
): Promise<number> {
  const [employee, config] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: {
        hireDate: true,
        profileExtension: true,
        visaPeriods: { select: { startDate: true }, orderBy: { startDate: 'asc' } },
      },
    }),
    getLeaveEntitlementConfig(prisma, companyId),
  ]);

  if (!employee) return config.fullEntitlementDays;

  const allocationStart = resolveLeaveAllocationStartDate(employee, config.allocationBasis);
  return prorateAnnualEntitlement(config.fullEntitlementDays, allocationStart, year);
}
