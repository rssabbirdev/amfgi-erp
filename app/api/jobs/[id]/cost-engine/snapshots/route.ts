import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { calculateJobCostEngine } from '@/lib/job-costing/costEngine';
import type { JobCostEngineResultPayload, PricingMode } from '@/lib/job-costing/types';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { CostEngineSchema } from '../route';
import { z } from 'zod';

const SaveSnapshotSchema = CostEngineSchema.extend({
  note: z.string().max(500).optional(),
});

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id: jobId } = await params;

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, jobId);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const rows = await prisma.jobCostingSnapshot.findMany({
    where: { companyId, jobId: budgetCtx.budgetJobId },
    orderBy: [{ versionNumber: 'desc' }],
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

  return successResponse(rows.map(serializeSnapshotMeta));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = SaveSnapshotSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const postingDate = parsed.data.postingDate ? new Date(parsed.data.postingDate) : new Date();
  if (Number.isNaN(postingDate.getTime())) return errorResponse('Invalid posting date', 422);

  const companyId = session.user.activeCompanyId;
  const { id: jobId } = await params;

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, jobId);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  try {
    const result = await calculateJobCostEngine({
      companyId,
      jobId,
      postingDate,
      pricingMode: parsed.data.pricingMode as PricingMode,
      jobItemIds: parsed.data.jobItemIds,
      customUnitCosts: parsed.data.customUnitCosts,
    });

    const row = await prisma.$transaction(async (tx) => {
      const latest = await tx.jobCostingSnapshot.aggregate({
        where: { companyId, jobId: budgetCtx.budgetJobId },
        _max: { versionNumber: true },
      });

      const created = await tx.jobCostingSnapshot.create({
        data: {
          companyId,
          jobId: budgetCtx.budgetJobId,
          versionNumber: (latest._max.versionNumber ?? 0) + 1,
          status: 'SAVED',
          pricingMode: parsed.data.pricingMode,
          postingDate,
          jobItemIds: parsed.data.jobItemIds ? (parsed.data.jobItemIds as Prisma.InputJsonValue) : Prisma.JsonNull,
          customUnitCosts: parsed.data.customUnitCosts ? (parsed.data.customUnitCosts as Prisma.InputJsonValue) : Prisma.JsonNull,
          pricingSnapshots: result.pricingSnapshots as Prisma.InputJsonValue,
          result: result as Prisma.InputJsonValue,
          totalQuotedMaterialCost: result.summary.totalQuotedMaterialCost,
          totalActualMaterialCost: result.summary.totalActualMaterialCost,
          totalEstimatedCompletionDays: result.summary.totalEstimatedCompletionDays,
          note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
          createdBy: session.user.id,
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

      return created;
    });

    return successResponse({
      snapshot: serializeSnapshotMeta(row),
      result,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save cost version';
    if (message === 'Job not found') return errorResponse(message, 404);
    if (message === 'No active job items found for this contract') return errorResponse(message, 404);
    return errorResponse(message, 500);
  }
}
