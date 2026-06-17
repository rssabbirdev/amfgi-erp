import { prisma } from '@/lib/db/prisma';
import { getOrCreateLeaveBalance, remainingLeaveDays } from '@/lib/hr/leaveBalance';
import { createLeaveRequest } from '@/lib/hr/leaveRequestService';
import { countLeaveDaysInclusive } from '@/lib/hr/leaveTypes';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm, hasPerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(2000).optional(),
  autoApprove: z.boolean().optional(),
  reviewNote: z.string().max(2000).optional(),
  allowInsufficientBalance: z.boolean().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (
    !hasPerm(session.user, P.HR_LEAVE_VIEW) &&
    !hasPerm(session.user, P.HR_LEAVE_APPROVE) &&
    !hasPerm(session.user, P.HR_LEAVE_EDIT) &&
    !hasPerm(session.user, P.HR_LEAVE_DELETE)
  ) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const employeeId = searchParams.get('employeeId');
  const workDateRaw = searchParams.get('workDate');

  let workDateFilter: { startDate?: { lte: Date }; endDate?: { gte: Date } } = {};
  if (workDateRaw) {
    try {
      const d = dateFromYmd(ymdFromInput(workDateRaw));
      workDateFilter = { startDate: { lte: d }, endDate: { gte: d } };
    } catch {
      return errorResponse('Invalid workDate', 400);
    }
  }

  const rows = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      ...workDateFilter,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
      reviewedBy: { select: { id: true, name: true } },
      leaveTypeRef: { select: { id: true, name: true, code: true, rules: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
  });

  await ensureLeaveTypesReady(prisma, companyId);

  const balanceCache = new Map<string, Awaited<ReturnType<typeof getOrCreateLeaveBalance>>>();
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const year = row.startDate.getUTCFullYear();
      const cacheKey = `${row.employeeId}:${year}`;
      let balance = balanceCache.get(cacheKey);
      if (!balance) {
        balance = await getOrCreateLeaveBalance(prisma, companyId, row.employeeId, year);
        balanceCache.set(cacheKey, balance);
      }
      return {
        ...row,
        dayCount: countLeaveDaysInclusive(row.startDate, row.endDate),
        balance: {
          year,
          entitlementDays: Number(balance.entitlementDays),
          usedDays: Number(balance.usedDays),
          adjustedDays: Number(balance.adjustedDays),
          remainingDays: remainingLeaveDays(balance),
        },
      };
    })
  );

  return successResponse(enriched);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_LEAVE_APPROVE)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const row = await createLeaveRequest(prisma, {
      companyId,
      employeeId: parsed.data.employeeId,
      leaveTypeId: parsed.data.leaveTypeId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      reason: parsed.data.reason,
      status: 'PENDING',
    });

    if (parsed.data.autoApprove) {
      const { approveLeaveRequest } = await import('@/lib/hr/leaveRequestService');
      await approveLeaveRequest(prisma, {
        companyId,
        requestId: row.id,
        reviewerId: session.user.id,
        reviewNote: parsed.data.reviewNote,
        allowInsufficientBalance: parsed.data.allowInsufficientBalance,
      });
    }

    const created = await prisma.leaveRequest.findFirst({
      where: { id: row.id, companyId },
      include: {
        employee: {
          select: { id: true, fullName: true, preferredName: true, employeeCode: true },
        },
        reviewedBy: { select: { id: true, name: true } },
        leaveTypeRef: { select: { id: true, name: true, code: true } },
      },
    });
    return successResponse(created, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to create leave request', 422);
  }
}
