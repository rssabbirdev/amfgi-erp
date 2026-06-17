import { prisma } from '@/lib/db/prisma';
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  rejectLeaveRequest,
  updateLeaveRequest,
} from '@/lib/hr/leaveRequestService';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().max(2000).optional(),
  allowInsufficientBalance: z.boolean().optional(),
});

const PutSchema = z.object({
  leaveTypeId: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  reason: z.string().max(2000).optional().nullable(),
  allowInsufficientBalance: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_LEAVE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body = await req.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  if (
    !parsed.data.leaveTypeId &&
    !parsed.data.startDate &&
    !parsed.data.endDate &&
    parsed.data.reason === undefined
  ) {
    return errorResponse('No changes provided', 422);
  }

  try {
    const row = await updateLeaveRequest(prisma, {
      companyId,
      requestId: id,
      editorId: session.user.id,
      leaveTypeId: parsed.data.leaveTypeId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      reason: parsed.data.reason,
      allowInsufficientBalance: parsed.data.allowInsufficientBalance,
    });
    return successResponse(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    const status =
      message === 'Not found'
        ? 404
        : message === 'Cannot edit cancelled or rejected leave'
          ? 400
          : 422;
    return errorResponse(message, status);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_LEAVE_APPROVE)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const row =
      parsed.data.action === 'reject'
        ? await rejectLeaveRequest(prisma, {
            companyId,
            requestId: id,
            reviewerId: session.user.id,
            reviewNote: parsed.data.reviewNote,
          })
        : await approveLeaveRequest(prisma, {
            companyId,
            requestId: id,
            reviewerId: session.user.id,
            reviewNote: parsed.data.reviewNote,
            allowInsufficientBalance: parsed.data.allowInsufficientBalance,
          });
    return successResponse(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    const status = message === 'Not found' ? 404 : message === 'Request is not pending' ? 400 : 422;
    return errorResponse(message, status);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_LEAVE_DELETE)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  try {
    const row = await cancelLeaveRequest(prisma, companyId, id);
    return successResponse(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    const status = message === 'Not found' ? 404 : 400;
    return errorResponse(message, status);
  }
}
