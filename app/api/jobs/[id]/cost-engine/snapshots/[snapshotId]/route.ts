import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import type { JobCostEngineResultPayload, PricingMode } from '@/lib/job-costing/types';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

function serializeSnapshotMeta(row: {
  id: string;
  versionNumber: number;
  status: 'SAVED' | 'APPROVED' | 'SUPERSEDED';
  pricingMode: string;
  postingDate: Date;
  totalQuotedMaterialCost: unknown;
  totalActualMaterialCost: unknown;
  totalEstimatedCompletionDays: unknown;
  createdAt: Date;
  createdBy: string;
  approvedAt: Date | null;
  approvedBy: string | null;
  note: string | null;
}) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status,
    pricingMode: row.pricingMode as PricingMode,
    postingDate: row.postingDate.toISOString(),
    totalQuotedMaterialCost: decimalToNumberOrZero(row.totalQuotedMaterialCost),
    totalActualMaterialCost: decimalToNumberOrZero(row.totalActualMaterialCost),
    totalEstimatedCompletionDays: decimalToNumberOrZero(row.totalEstimatedCompletionDays),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    note: row.note,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; snapshotId: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id: jobId, snapshotId } = await params;

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, jobId);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const row = await prisma.jobCostingSnapshot.findFirst({
    where: { companyId, jobId: budgetCtx.budgetJobId, id: snapshotId },
    select: {
      id: true,
      versionNumber: true,
      status: true,
      pricingMode: true,
      postingDate: true,
      totalQuotedMaterialCost: true,
      totalActualMaterialCost: true,
      totalEstimatedCompletionDays: true,
      createdAt: true,
      createdBy: true,
      approvedAt: true,
      approvedBy: true,
      note: true,
      pricingSnapshots: true,
      result: true,
      customUnitCosts: true,
      jobItemIds: true,
    },
  });
  if (!row) return errorResponse('Cost version not found', 404);

  return successResponse({
    snapshot: {
      ...serializeSnapshotMeta(row),
      pricingSnapshots: row.pricingSnapshots,
      customUnitCosts: row.customUnitCosts,
      jobItemIds: row.jobItemIds,
    },
    result: row.result as JobCostEngineResultPayload,
  });
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string; snapshotId: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id: jobId, snapshotId } = await params;

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, jobId);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const existing = await prisma.jobCostingSnapshot.findFirst({
    where: { companyId, jobId: budgetCtx.budgetJobId, id: snapshotId },
    select: { id: true, status: true },
  });
  if (!existing) return errorResponse('Cost version not found', 404);

  const row = await prisma.$transaction(async (tx) => {
    await tx.jobCostingSnapshot.updateMany({
      where: {
        companyId,
        jobId: budgetCtx.budgetJobId,
        status: 'APPROVED',
        NOT: { id: snapshotId },
      },
      data: {
        status: 'SUPERSEDED',
      },
    });

    return tx.jobCostingSnapshot.update({
      where: { id: snapshotId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: session.user.id,
      },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        pricingMode: true,
        postingDate: true,
        totalQuotedMaterialCost: true,
        totalActualMaterialCost: true,
        totalEstimatedCompletionDays: true,
        createdAt: true,
        createdBy: true,
        approvedAt: true,
        approvedBy: true,
        note: true,
      },
    });
  });

  return successResponse({
    snapshot: serializeSnapshotMeta(row),
  });
}
