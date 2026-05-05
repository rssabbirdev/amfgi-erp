import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function trackerLabelFromItems(trackingItems: unknown, trackerId: string | null | undefined): { label: string; unit: string | null } {
  if (!trackerId || !Array.isArray(trackingItems)) return { label: '—', unit: null };
  for (const raw of trackingItems) {
    if (!isRecord(raw)) continue;
    if (String(raw.id ?? '') !== trackerId) continue;
    return {
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : '—',
      unit: typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : null,
    };
  }
  return { label: '—', unit: null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_VIEW)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id: jobId } = await params;

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, jobId);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const rows = await prisma.jobItemProgressEntry.findMany({
    where: {
      companyId,
      jobItem: { jobId: budgetCtx.budgetJobId, companyId },
    },
    include: {
      jobItem: {
        select: { id: true, name: true, trackingItems: true },
      },
    },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
  });

  const data = rows.map((row) => {
    const meta = trackerLabelFromItems(row.jobItem.trackingItems, row.trackerId);
    return {
      id: row.id,
      companyId: row.companyId,
      jobItemId: row.jobItemId,
      jobItemName: row.jobItem.name,
      trackerId: row.trackerId,
      trackerLabel: meta.label,
      trackerUnit: meta.unit,
      entryDate: row.entryDate,
      quantity: decimalToNumberOrZero(row.quantity),
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  return successResponse(data);
}
