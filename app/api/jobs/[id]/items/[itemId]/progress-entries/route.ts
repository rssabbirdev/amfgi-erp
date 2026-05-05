import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { syncTrackedJobItemProgress } from '@/lib/job-costing/jobItemProgressTracking';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';

const ProgressEntrySchema = z.object({
  trackerId: z.string().min(1),
  entryDate: z.string().min(1),
  quantity: z.number().positive(),
  note: z.string().max(2000).optional().nullable(),
});

async function loadJobItem(companyId: string, routeJobId: string, itemId: string) {
  const ctx = await resolveJobBudgetContext(prisma, companyId, routeJobId);
  if (!ctx) return null;
  return prisma.jobItem.findFirst({
    where: {
      id: itemId,
      jobId: ctx.budgetJobId,
      companyId,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_VIEW)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId } = await params;
  const item = await loadJobItem(companyId, id, itemId);
  if (!item) return errorResponse('Job item not found', 404);

  const rows = await prisma.jobItemProgressEntry.findMany({
    where: {
      companyId,
      jobItemId: itemId,
    },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
  });

  return successResponse(
    rows.map((row) => ({
      ...row,
      quantity: decimalToNumberOrZero(row.quantity),
    }))
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id, itemId } = await params;
  const item = await loadJobItem(companyId, id, itemId);
  if (!item) return errorResponse('Job item not found', 404);
  if (!item.trackingEnabled || !Array.isArray(item.trackingItems) || item.trackingItems.length === 0) {
    return errorResponse('This budget item is not configured for tracked quantity progress', 422);
  }

  const body = await req.json();
  const parsed = ProgressEntrySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const hasTracker = item.trackingItems.some((entry) => typeof entry === 'object' && entry !== null && (entry as { id?: unknown }).id === parsed.data.trackerId);
  if (!hasTracker) return errorResponse('Tracked item not found on this budget item', 422);

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.jobItemProgressEntry.create({
      data: {
        companyId,
        jobItemId: itemId,
        trackerId: parsed.data.trackerId,
        entryDate: new Date(parsed.data.entryDate),
        quantity: parsed.data.quantity,
        note: parsed.data.note?.trim() || null,
        createdBy: session.user.id,
      },
    });
    await syncTrackedJobItemProgress(tx, companyId, itemId);
    return created;
  });

  return successResponse(
    {
      ...entry,
      quantity: decimalToNumberOrZero(entry.quantity),
    },
    201
  );
}
