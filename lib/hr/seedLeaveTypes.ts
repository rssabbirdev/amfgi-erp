import type { PrismaClient } from '@prisma/client';

import {
  DEFAULT_ANNUAL_LEAVE_RULES,
  DEFAULT_PAID_LEAVE_RULES,
  DEFAULT_UNPAID_LEAVE_RULES,
  UAE_SICK_LEAVE_RULES,
} from '@/lib/hr/leaveTypeRules';

export const DEFAULT_LEAVE_TYPE_TEMPLATES = [
  {
    name: 'Unpaid leave',
    code: 'UNPAID',
    description: 'Unpaid absence — deducts from salary where applicable.',
    sortOrder: 10,
    rules: DEFAULT_UNPAID_LEAVE_RULES,
  },
  {
    name: 'Paid leave',
    code: 'PAID',
    description: 'Generic paid leave day at full pay.',
    sortOrder: 20,
    rules: DEFAULT_PAID_LEAVE_RULES,
  },
  {
    name: 'Sick leave',
    code: 'SICK',
    description:
      'UAE-style sick leave: first 15 days full pay, next 30 half pay, remaining 45 unpaid (90-day entitlement, after probation).',
    sortOrder: 30,
    rules: UAE_SICK_LEAVE_RULES,
  },
  {
    name: 'Annual leave',
    code: 'ANNUAL',
    description: 'Annual leave — paid at full rate and deducted from leave balance.',
    sortOrder: 40,
    rules: DEFAULT_ANNUAL_LEAVE_RULES,
  },
] as const;

const LEGACY_ENUM_TO_CODE: Record<string, string> = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  EMERGENCY: 'PAID',
  ONE_DAY: 'PAID',
};

export async function ensureDefaultLeaveTypes(prisma: PrismaClient, companyId: string) {
  const existing = await prisma.leaveType.count({ where: { companyId } });
  if (existing > 0) return { created: 0 };

  for (const tpl of DEFAULT_LEAVE_TYPE_TEMPLATES) {
    await prisma.leaveType.create({
      data: {
        companyId,
        name: tpl.name,
        code: tpl.code,
        description: tpl.description,
        sortOrder: tpl.sortOrder,
        rules: tpl.rules,
      },
    });
  }
  return { created: DEFAULT_LEAVE_TYPE_TEMPLATES.length };
}

/** Backfill attendance leaveTypeId from legacy enum after defaults exist. */
export async function backfillAttendanceLeaveTypeIds(prisma: PrismaClient, companyId: string) {
  const types = await prisma.leaveType.findMany({ where: { companyId } });
  const byCode = new Map(types.map((t) => [t.code.toUpperCase(), t.id]));

  const rows = await prisma.attendanceEntry.findMany({
    where: {
      companyId,
      leaveTypeId: null,
      leaveType: { not: null },
    },
    select: { id: true, leaveType: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (!row.leaveType) continue;
    const code = LEGACY_ENUM_TO_CODE[row.leaveType] ?? 'PAID';
    const leaveTypeId = byCode.get(code);
    if (!leaveTypeId) continue;
    await prisma.attendanceEntry.update({
      where: { id: row.id },
      data: { leaveTypeId },
    });
    updated += 1;
  }
  return { updated };
}

export async function backfillLeaveRequestLeaveTypeIds(prisma: PrismaClient, companyId: string) {
  const types = await prisma.leaveType.findMany({ where: { companyId } });
  const byCode = new Map(types.map((t) => [t.code.toUpperCase(), t.id]));

  const rows = await prisma.leaveRequest.findMany({
    where: { companyId, leaveTypeId: null },
    select: { id: true, leaveType: true },
  });

  let updated = 0;
  for (const row of rows) {
    const code = LEGACY_ENUM_TO_CODE[row.leaveType] ?? 'PAID';
    const leaveTypeId = byCode.get(code);
    if (!leaveTypeId) continue;
    await prisma.leaveRequest.update({
      where: { id: row.id },
      data: { leaveTypeId },
    });
    updated += 1;
  }
  return { updated };
}

export async function ensureLeaveTypesReady(prisma: PrismaClient, companyId: string) {
  await ensureDefaultLeaveTypes(prisma, companyId);
  await backfillAttendanceLeaveTypeIds(prisma, companyId);
  await backfillLeaveRequestLeaveTypeIds(prisma, companyId);
}
