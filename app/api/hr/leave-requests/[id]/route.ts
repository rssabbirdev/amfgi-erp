import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { assertSufficientLeaveBalance, getOrCreateLeaveBalance, leaveDaysForRequest } from '@/lib/hr/leaveBalance';
import { syncApprovedLeaveToAttendance, removeSyncedLeaveAttendance } from '@/lib/hr/syncLeaveToAttendance';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().max(2000).optional(),
  allowInsufficientBalance: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_LEAVE_APPROVE)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.leaveRequest.findFirst({
    where: { id, companyId },
  });
  if (!existing) return errorResponse('Not found', 404);
  if (existing.status !== 'PENDING') return errorResponse('Request is not pending', 400);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  if (parsed.data.action === 'reject') {
    const row = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote?.trim() || null,
      },
    });
    return successResponse(row);
  }

  const daysNeeded = leaveDaysForRequest(
    existing.leaveType,
    existing.startDate,
    existing.endDate,
    existing.deductFromBalance
  );
  if (daysNeeded > 0) {
    const year = existing.startDate.getUTCFullYear();
    const check = await assertSufficientLeaveBalance(prisma, {
      companyId,
      employeeId: existing.employeeId,
      year,
      daysNeeded,
      allowOverride: parsed.data.allowInsufficientBalance,
    });
    if (!check.ok) return errorResponse(check.message, 422);
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote?.trim() || null,
      },
    });

    if (daysNeeded > 0) {
      const year = existing.startDate.getUTCFullYear();
      const balance = await getOrCreateLeaveBalance(tx, companyId, existing.employeeId, year);
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: Number(balance.usedDays) + daysNeeded },
      });
    }

    return updated;
  });

  await syncApprovedLeaveToAttendance(prisma, id);
  return successResponse(row);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_LEAVE_APPROVE)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.leaveRequest.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);
  if (existing.status === 'APPROVED') {
    await removeSyncedLeaveAttendance(prisma, id);
  }

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
  return successResponse(row);
}
