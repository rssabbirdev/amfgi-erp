import type { Prisma, PrismaClient } from '@prisma/client';
import type { LeaveRequestType } from '@prisma/client';

import { computeEmployeeLeaveEntitlement, getLeaveEntitlementConfig } from '@/lib/hr/leaveAllocation';
import { countLeaveDaysInclusive, usesLeaveBalance } from '@/lib/hr/leaveTypes';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export function remainingLeaveDays(balance: {
  entitlementDays: { toNumber?: () => number } | number;
  usedDays: { toNumber?: () => number } | number;
  adjustedDays: { toNumber?: () => number } | number;
}): number {
  const entitlement = Number(balance.entitlementDays);
  const used = Number(balance.usedDays);
  const adjusted = Number(balance.adjustedDays);
  return Math.max(0, entitlement + adjusted - used);
}

/** Full-year entitlement days from leave type rules (no employee proration). */
export async function getAnnualEntitlementFromLeaveTypes(
  prisma: PrismaLike,
  companyId: string,
): Promise<number> {
  const config = await getLeaveEntitlementConfig(prisma, companyId);
  return config.fullEntitlementDays;
}

export async function getOrCreateLeaveBalance(
  prisma: PrismaLike,
  companyId: string,
  employeeId: string,
  year: number
) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { companyId_employeeId_year: { companyId, employeeId, year } },
  });
  if (existing) {
    if (Number(existing.entitlementDays) === 0) {
      const entitlementDays = await computeEmployeeLeaveEntitlement(
        prisma,
        companyId,
        employeeId,
        year,
      );
      return prisma.leaveBalance.update({
        where: { id: existing.id },
        data: { entitlementDays },
      });
    }
    return existing;
  }
  const entitlementDays = await computeEmployeeLeaveEntitlement(
    prisma,
    companyId,
    employeeId,
    year,
  );
  return prisma.leaveBalance.create({
    data: { companyId, employeeId, year, entitlementDays, usedDays: 0, adjustedDays: 0 },
  });
}

export function leaveDaysForRequest(
  leaveType: LeaveRequestType,
  startDate: Date,
  endDate: Date,
  deductFromBalance: boolean
): number {
  if (!deductFromBalance || !usesLeaveBalance(leaveType)) return 0;
  return countLeaveDaysInclusive(startDate, endDate);
}

export async function assertSufficientLeaveBalance(
  prisma: PrismaLike,
  params: {
    companyId: string;
    employeeId: string;
    year: number;
    daysNeeded: number;
    allowOverride?: boolean;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (params.allowOverride) return { ok: true };
  const balance = await getOrCreateLeaveBalance(
    prisma,
    params.companyId,
    params.employeeId,
    params.year
  );
  const remaining = remainingLeaveDays(balance);
  if (params.daysNeeded > remaining) {
    return {
      ok: false,
      message: `Insufficient annual leave balance (${remaining} day(s) remaining, ${params.daysNeeded} requested)`,
    };
  }
  return { ok: true };
}
