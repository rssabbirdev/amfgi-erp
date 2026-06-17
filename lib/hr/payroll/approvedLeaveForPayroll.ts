import type { PrismaClient } from '@prisma/client';

import { legacyLeaveRequestTypeFromCode } from '@/lib/hr/leaveTypeRules';
import { datesInRangeInclusive } from '@/lib/hr/leaveTypes';
import { isSundayYmd, monthBounds } from '@/lib/hr/payroll/calendar';

export type ApprovedLeaveDay = {
  employeeId: string;
  workDateYmd: string;
  leaveRequestId: string;
  leaveTypeId: string;
  leaveType: string | null;
  leaveTypeLabel: string;
  leaveTypeCode: string;
  rules: unknown;
};

function ymdFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inMonth(ymd: string, month: string): boolean {
  return ymd.startsWith(`${month}-`);
}

export async function fetchApprovedLeaveDaysForPayroll(
  prisma: PrismaClient,
  companyId: string,
  month: string,
  employeeIds?: string[]
): Promise<ApprovedLeaveDay[]> {
  const { start, end } = monthBounds(month);
  const monthEnd = new Date(end);
  monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);

  const requests = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      status: 'APPROVED',
      startDate: { lte: monthEnd },
      endDate: { gte: start },
      ...(employeeIds?.length ? { employeeId: { in: employeeIds } } : {}),
    },
    include: {
      leaveTypeRef: { select: { id: true, name: true, code: true, rules: true } },
    },
    orderBy: [{ startDate: 'asc' }, { submittedAt: 'asc' }],
  });

  const out: ApprovedLeaveDay[] = [];
  for (const req of requests) {
    const leaveTypeRef = req.leaveTypeRef;
    if (!leaveTypeRef) continue;
    const legacyLeaveType = legacyLeaveRequestTypeFromCode(leaveTypeRef.code);
    for (const workDate of datesInRangeInclusive(req.startDate, req.endDate)) {
      const workDateYmd = ymdFromDate(workDate);
      if (!inMonth(workDateYmd, month)) continue;
      out.push({
        employeeId: req.employeeId,
        workDateYmd,
        leaveRequestId: req.id,
        leaveTypeId: leaveTypeRef.id,
        leaveType: legacyLeaveType,
        leaveTypeLabel: leaveTypeRef.name,
        leaveTypeCode: leaveTypeRef.code,
        rules: leaveTypeRef.rules,
      });
    }
  }
  return out;
}

/** Approved leave for one calendar day (attendance sheet preview). */
export async function fetchApprovedLeavePreviewForWorkDate(
  prisma: PrismaClient,
  companyId: string,
  workDateYmd: string
): Promise<Map<string, { label: string; leaveRequestId: string }>> {
  const workDate = new Date(`${workDateYmd}T12:00:00.000Z`);
  const requests = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      status: 'APPROVED',
      startDate: { lte: workDate },
      endDate: { gte: workDate },
    },
    include: {
      leaveTypeRef: { select: { name: true } },
    },
  });

  const map = new Map<string, { label: string; leaveRequestId: string }>();
  for (const req of requests) {
    map.set(req.employeeId, {
      label: req.leaveTypeRef?.name ?? 'Leave',
      leaveRequestId: req.id,
    });
  }
  return map;
}

export function mergeApprovedLeaveIntoPayLines(
  lines: PayLineInput[],
  approvedLeaveDays: ApprovedLeaveDay[],
  defaultBasicHours = 8
): PayLineInput[] {
  const byDate = new Map(lines.map((line) => [line.workDate, { ...line }]));

  for (const leave of approvedLeaveDays) {
    const existing = byDate.get(leave.workDateYmd);
    if (existing) {
      byDate.set(leave.workDateYmd, {
        ...existing,
        leaveType: leave.leaveType,
        leaveTypeLabel: leave.leaveTypeLabel,
        leaveTypeId: leave.leaveTypeId,
        leaveTypeCode: leave.leaveTypeCode,
        leaveRequestId: leave.leaveRequestId,
      });
      continue;
    }

    byDate.set(leave.workDateYmd, {
      workDate: leave.workDateYmd,
      status: 'ABSENT',
      leaveType: leave.leaveType,
      leaveTypeLabel: leave.leaveTypeLabel,
      leaveTypeId: leave.leaveTypeId,
      leaveTypeCode: leave.leaveTypeCode,
      leaveRequestId: leave.leaveRequestId,
      basicHours: defaultBasicHours,
      workedMinutes: 0,
      isSunday: isSundayYmd(leave.workDateYmd),
    });
  }

  return [...byDate.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));
}

export async function fetchApprovedLeaveDayRowsForEntitlement(
  prisma: PrismaClient,
  params: {
    companyId: string;
    employeeId: string;
    leaveTypeId: string;
    workDateYmd: string;
    entitlementDays: number;
  }
): Promise<Array<{ workDate: Date; leaveTypeId: string | null }>> {
  const end = new Date(`${params.workDateYmd}T12:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (params.entitlementDays - 1));

  const requests = await prisma.leaveRequest.findMany({
    where: {
      companyId: params.companyId,
      employeeId: params.employeeId,
      leaveTypeId: params.leaveTypeId,
      status: 'APPROVED',
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { startDate: true, endDate: true, leaveTypeId: true },
    orderBy: { startDate: 'asc' },
  });

  const rows: Array<{ workDate: Date; leaveTypeId: string | null }> = [];
  for (const req of requests) {
    for (const workDate of datesInRangeInclusive(req.startDate, req.endDate)) {
      if (workDate < start || workDate > end) continue;
      rows.push({ workDate, leaveTypeId: req.leaveTypeId });
    }
  }
  return rows;
}
