import type { PrismaClient } from '@prisma/client';

import { parseLeaveTypeRules, payPercentForLeaveDay } from '@/lib/hr/leaveTypeRules';

type LeaveDayRow = {
  workDate: Date;
  leaveTypeId: string | null;
};

/** Count leave days of a given type in the entitlement window ending on workDate (inclusive). */
export function countLeaveDaysInEntitlementWindow(
  rows: LeaveDayRow[],
  leaveTypeId: string,
  workDateYmd: string,
  entitlementDays: number
): number {
  const end = new Date(`${workDateYmd}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (entitlementDays - 1));

  return rows.filter((row) => {
    if (row.leaveTypeId !== leaveTypeId) return false;
    const ymd = row.workDate.toISOString().slice(0, 10);
    const d = new Date(`${ymd}T12:00:00Z`);
    return d >= start && d <= end;
  }).length;
}

export async function fetchLeaveDayRowsForEntitlement(
  prisma: PrismaClient,
  companyId: string,
  employeeId: string,
  workDateYmd: string,
  entitlementDays: number
): Promise<LeaveDayRow[]> {
  const end = new Date(`${workDateYmd}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (entitlementDays - 1));

  return prisma.attendanceEntry.findMany({
    where: {
      companyId,
      employeeId,
      workDate: { gte: start, lte: end },
      leaveTypeId: { not: null },
    },
    select: { workDate: true, leaveTypeId: true },
    orderBy: { workDate: 'asc' },
  });
}

export async function resolveLeavePayPercentForDay(
  prisma: PrismaClient,
  params: {
    companyId: string;
    employeeId: string;
    workDateYmd: string;
    leaveTypeId: string;
    rules: unknown;
  }
): Promise<number> {
  const rules = parseLeaveTypeRules(params.rules);
  if (!rules.payTiers?.length) {
    return rules.countsAsPaidLeave ? 100 : 0;
  }
  const entitlementDays = rules.entitlementDays ?? 365;
  const priorRows = await fetchLeaveDayRowsForEntitlement(
    prisma,
    params.companyId,
    params.employeeId,
    params.workDateYmd,
    entitlementDays
  );
  const dayIndex = countLeaveDaysInEntitlementWindow(
    priorRows,
    params.leaveTypeId,
    params.workDateYmd,
    entitlementDays
  );
  return payPercentForLeaveDay(rules, dayIndex);
}
