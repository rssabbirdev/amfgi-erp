import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { syncTrackedJobItemProgress } from '@/lib/job-costing/jobItemProgressTracking';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';

const ProgressEntryUpdateSchema = z.object({
  trackerId: z.string().min(1).optional(),
  entryDate: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  note: z.string().max(2000).optional().nullable(),
});

async function loadProgressEntry(companyId: string, routeJobId: string, itemId: string, entryId: string) {
  const ctx = await resolveJobBudgetContext(prisma, companyId, routeJobId);
  if (!ctx) return null;
  return prisma.jobItemProgressEntry.findFirst({
    where: {
      id: entryId,
      companyId,
      jobItemId: itemId,
      jobItem: {
        jobId: ctx.budgetJobId,
      },
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId, entryId } = await params;
  const existing = await loadProgressEntry(companyId, id, itemId, entryId);
  if (!existing) return errorResponse('Progress entry not found', 404);

  const body = await req.json();
  const parsed = ProgressEntryUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.jobItemProgressEntry.update({
      where: { id: entryId },
      data: {
        trackerId: parsed.data.trackerId,
        entryDate: parsed.data.entryDate ? new Date(parsed.data.entryDate) : undefined,
        quantity: parsed.data.quantity,
        note: parsed.data.note === undefined ? undefined : (parsed.data.note?.trim() || null),
      },
    });
    await syncTrackedJobItemProgress(tx, companyId, itemId);
    return row;
  });

  return successResponse({
    ...updated,
    quantity: decimalToNumberOrZero(updated.quantity),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string; entryId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId, entryId } = await params;
  const existing = await loadProgressEntry(companyId, id, itemId, entryId);
  if (!existing) return errorResponse('Progress entry not found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.jobItemProgressEntry.delete({
      where: { id: entryId },
    });
    await syncTrackedJobItemProgress(tx, companyId, itemId);
  });

  return successResponse({ deleted: true });
}
