import type { Prisma, PrismaClient } from '@prisma/client';

import { assertSufficientLeaveBalance, getOrCreateLeaveBalance, leaveDaysForRequest } from '@/lib/hr/leaveBalance';
import { loadLeaveTypeForRequest, resolveLeaveRequestFields } from '@/lib/hr/resolveLeaveTypeSelection';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import {
  removeApprovedLeaveFromScheduleAbsences,
  removeSyncedLeaveAttendance,
  syncApprovedLeaveToAttendance,
} from '@/lib/hr/syncLeaveToAttendance';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export function parseLeaveDateRange(startDate: string, endDate: string) {
  const startYmd = ymdFromInput(startDate);
  const endYmd = ymdFromInput(endDate);
  const start = dateFromYmd(startYmd);
  const end = dateFromYmd(endYmd);
  if (end < start) {
    throw new Error('endDate must be on or after startDate');
  }
  return { start, end };
}

export async function createLeaveRequest(
  prisma: PrismaClient,
  params: {
    companyId: string;
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason?: string | null;
    status?: 'PENDING' | 'APPROVED';
    skipBalanceCheck?: boolean;
  }
) {
  const employee = await prisma.employee.findFirst({
    where: { id: params.employeeId, companyId: params.companyId },
    select: { id: true },
  });
  if (!employee) throw new Error('Employee not found');

  const { start, end } = parseLeaveDateRange(params.startDate, params.endDate);

  await ensureLeaveTypesReady(prisma, params.companyId);
  const leaveType = await loadLeaveTypeForRequest(prisma, params.companyId, params.leaveTypeId);
  if (!leaveType) throw new Error('Leave type not found');

  const resolved = resolveLeaveRequestFields(leaveType);
  const daysNeeded = leaveDaysForRequest(resolved.leaveType, start, end, resolved.deductFromBalance);

  if (daysNeeded > 0 && !params.skipBalanceCheck && params.status !== 'APPROVED') {
    const check = await assertSufficientLeaveBalance(prisma, {
      companyId: params.companyId,
      employeeId: params.employeeId,
      year: start.getUTCFullYear(),
      daysNeeded,
    });
    if (!check.ok) throw new Error(check.message);
  }

  return prisma.leaveRequest.create({
    data: {
      companyId: params.companyId,
      employeeId: params.employeeId,
      leaveType: resolved.leaveType,
      leaveTypeId: resolved.leaveTypeId,
      startDate: start,
      endDate: end,
      reason: params.reason?.trim() || null,
      deductFromBalance: resolved.deductFromBalance,
      status: params.status ?? 'PENDING',
    },
    include: {
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
      leaveTypeRef: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function approveLeaveRequest(
  prisma: PrismaClient,
  params: {
    companyId: string;
    requestId: string;
    reviewerId: string;
    reviewNote?: string | null;
    allowInsufficientBalance?: boolean;
  }
) {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id: params.requestId, companyId: params.companyId },
  });
  if (!existing) throw new Error('Not found');
  if (existing.status !== 'PENDING') throw new Error('Request is not pending');

  const daysNeeded = leaveDaysForRequest(
    existing.leaveType,
    existing.startDate,
    existing.endDate,
    existing.deductFromBalance
  );

  if (daysNeeded > 0) {
    const check = await assertSufficientLeaveBalance(prisma, {
      companyId: params.companyId,
      employeeId: existing.employeeId,
      year: existing.startDate.getUTCFullYear(),
      daysNeeded,
      allowOverride: params.allowInsufficientBalance,
    });
    if (!check.ok) throw new Error(check.message);
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: params.requestId },
      data: {
        status: 'APPROVED',
        reviewedById: params.reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.reviewNote?.trim() || null,
      },
    });

    if (daysNeeded > 0) {
      const year = existing.startDate.getUTCFullYear();
      const balance = await getOrCreateLeaveBalance(tx, params.companyId, existing.employeeId, year);
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: Number(balance.usedDays) + daysNeeded },
      });
    }

    return updated;
  });

  await syncApprovedLeaveToAttendance(prisma, params.requestId);
  return row;
}

export async function rejectLeaveRequest(
  prisma: PrismaClient,
  params: {
    companyId: string;
    requestId: string;
    reviewerId: string;
    reviewNote?: string | null;
  }
) {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id: params.requestId, companyId: params.companyId },
  });
  if (!existing) throw new Error('Not found');
  if (existing.status !== 'PENDING') throw new Error('Request is not pending');

  return prisma.leaveRequest.update({
    where: { id: params.requestId },
    data: {
      status: 'REJECTED',
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
      reviewNote: params.reviewNote?.trim() || null,
    },
  });
}

export async function cancelLeaveRequest(prisma: PrismaClient, companyId: string, requestId: string) {
  const existing = await prisma.leaveRequest.findFirst({ where: { id: requestId, companyId } });
  if (!existing) throw new Error('Not found');
  if (existing.status === 'CANCELLED') throw new Error('Already cancelled');

  if (existing.status === 'APPROVED') {
    await removeApprovedLeaveFromScheduleAbsences(prisma, {
      companyId,
      employeeId: existing.employeeId,
      startDate: existing.startDate,
      endDate: existing.endDate,
    });
    await removeSyncedLeaveAttendance(prisma, requestId);
    const daysUsed = leaveDaysForRequest(
      existing.leaveType,
      existing.startDate,
      existing.endDate,
      existing.deductFromBalance
    );
    if (daysUsed > 0) {
      const year = existing.startDate.getUTCFullYear();
      const balance = await getOrCreateLeaveBalance(prisma, companyId, existing.employeeId, year);
      await prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: Math.max(0, Number(balance.usedDays) - daysUsed) },
      });
    }
  }

  return prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  });
}

async function restoreApprovedLeaveSideEffects(
  prisma: PrismaClient,
  existing: {
    id: string;
    companyId: string;
    employeeId: string;
    leaveType: Parameters<typeof leaveDaysForRequest>[0];
    startDate: Date;
    endDate: Date;
    deductFromBalance: boolean;
  }
) {
  await removeApprovedLeaveFromScheduleAbsences(prisma, {
    companyId: existing.companyId,
    employeeId: existing.employeeId,
    startDate: existing.startDate,
    endDate: existing.endDate,
  });
  await removeSyncedLeaveAttendance(prisma, existing.id);

  const daysUsed = leaveDaysForRequest(
    existing.leaveType,
    existing.startDate,
    existing.endDate,
    existing.deductFromBalance
  );
  if (daysUsed > 0) {
    const year = existing.startDate.getUTCFullYear();
    const balance = await getOrCreateLeaveBalance(
      prisma,
      existing.companyId,
      existing.employeeId,
      year
    );
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { usedDays: Math.max(0, Number(balance.usedDays) - daysUsed) },
    });
  }
}

export async function updateLeaveRequest(
  prisma: PrismaClient,
  params: {
    companyId: string;
    requestId: string;
    editorId: string;
    leaveTypeId?: string;
    startDate?: string;
    endDate?: string;
    reason?: string | null;
    allowInsufficientBalance?: boolean;
  }
) {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id: params.requestId, companyId: params.companyId },
  });
  if (!existing) throw new Error('Not found');
  if (existing.status === 'CANCELLED' || existing.status === 'REJECTED') {
    throw new Error('Cannot edit cancelled or rejected leave');
  }

  const wasApproved = existing.status === 'APPROVED';
  if (wasApproved) {
    await restoreApprovedLeaveSideEffects(prisma, existing);
  }

  await ensureLeaveTypesReady(prisma, params.companyId);

  let leaveTypeFields = {
    leaveType: existing.leaveType,
    leaveTypeId: existing.leaveTypeId,
    deductFromBalance: existing.deductFromBalance,
  };

  if (params.leaveTypeId && params.leaveTypeId !== existing.leaveTypeId) {
    const leaveType = await loadLeaveTypeForRequest(prisma, params.companyId, params.leaveTypeId);
    if (!leaveType) throw new Error('Leave type not found');
    leaveTypeFields = resolveLeaveRequestFields(leaveType);
  }

  const startYmd = params.startDate ? ymdFromInput(params.startDate) : existing.startDate.toISOString().slice(0, 10);
  const endYmd = params.endDate
    ? ymdFromInput(params.endDate)
    : params.startDate
      ? startYmd
      : existing.endDate.toISOString().slice(0, 10);
  const { start, end } = parseLeaveDateRange(startYmd, endYmd);

  const nextReason =
    params.reason !== undefined ? params.reason?.trim() || null : existing.reason;

  const daysNeeded = leaveDaysForRequest(
    leaveTypeFields.leaveType,
    start,
    end,
    leaveTypeFields.deductFromBalance
  );

  if (daysNeeded > 0) {
    const check = await assertSufficientLeaveBalance(prisma, {
      companyId: params.companyId,
      employeeId: existing.employeeId,
      year: start.getUTCFullYear(),
      daysNeeded,
      allowOverride: params.allowInsufficientBalance,
    });
    if (!check.ok) throw new Error(check.message);
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id: params.requestId },
      data: {
        leaveType: leaveTypeFields.leaveType,
        leaveTypeId: leaveTypeFields.leaveTypeId,
        deductFromBalance: leaveTypeFields.deductFromBalance,
        startDate: start,
        endDate: end,
        reason: nextReason,
        ...(wasApproved
          ? {
              reviewedById: params.editorId,
              reviewedAt: new Date(),
            }
          : {}),
      },
      include: {
        employee: {
          select: { id: true, fullName: true, preferredName: true, employeeCode: true },
        },
        leaveTypeRef: { select: { id: true, name: true, code: true, rules: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    if (wasApproved && daysNeeded > 0) {
      const year = start.getUTCFullYear();
      const balance = await getOrCreateLeaveBalance(tx, params.companyId, existing.employeeId, year);
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: Number(balance.usedDays) + daysNeeded },
      });
    }

    return updated;
  });

  if (wasApproved) {
    await syncApprovedLeaveToAttendance(prisma, params.requestId);
  }

  return row;
}

export async function getLeaveManagementStats(prisma: PrismaClient, companyId: string) {
  const now = new Date();
  const today = dateFromYmd(
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  );
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [pendingCount, approvedThisMonth, onLeaveToday, employeesOnLeaveStatus] = await Promise.all([
    prisma.leaveRequest.count({ where: { companyId, status: 'PENDING' } }),
    prisma.leaveRequest.count({
      where: { companyId, status: 'APPROVED', reviewedAt: { gte: monthStart } },
    }),
    prisma.leaveRequest.count({
      where: {
        companyId,
        status: 'APPROVED',
        startDate: { lte: today },
        endDate: { gte: today },
      },
    }),
    prisma.employee.count({ where: { companyId, status: 'ON_LEAVE' } }),
  ]);

  return {
    pendingCount,
    approvedThisMonth,
    onLeaveToday,
    employeesOnLeaveStatus,
  };
}
