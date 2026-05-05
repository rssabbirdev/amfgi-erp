import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { syncTrackedJobItemProgress } from '@/lib/job-costing/jobItemProgressTracking';
import {
  assertCompanyEmployeesExist,
  normalizeAssignedEmployeeIds,
  serializeAssignedEmployeeIds,
} from '@/lib/job-costing/jobItemAssignments';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const JobItemUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  formulaLibraryId: z.string().min(1).optional(),
  specifications: z.unknown().optional(),
  assignedEmployeeIds: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  progressStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  trackingItems: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(120),
    unit: z.string().max(40).optional().nullable(),
    targetValue: z.number().positive(),
    sourceKey: z.string().max(180).optional().nullable(),
  })).optional(),
  trackingEnabled: z.boolean().optional(),
  trackingLabel: z.string().max(120).optional().nullable(),
  trackingUnit: z.string().max(40).optional().nullable(),
  trackingTargetValue: z.number().min(0).optional().nullable(),
  trackingSourceKey: z.string().max(180).optional().nullable(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable(),
  actualStartDate: z.string().optional().nullable(),
  actualEndDate: z.string().optional().nullable(),
  progressNote: z.string().max(2000).optional().nullable(),
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
  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, id);
  if (!budgetCtx) return errorResponse('Job not found', 404);
  const row = await prisma.jobItem.findFirst({
    where: {
      id: itemId,
      jobId: budgetCtx.budgetJobId,
      companyId,
    },
    include: {
      assignedEmployees: {
        orderBy: { sortOrder: 'asc' },
        select: {
          employeeId: true,
          sortOrder: true,
        },
      },
      formulaLibrary: true,
    },
  });
  if (!row) return errorResponse('Job item not found', 404);
  return successResponse(serializeAssignedEmployeeIds(row));
}

export async function PUT(
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
  const existing = await loadJobItem(companyId, id, itemId);
  if (!existing) return errorResponse('Job item not found', 404);

  const body = await req.json();
  const parsed = JobItemUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const { assignedEmployeeIds: assignedEmployeeIdsInput, ...jobItemData } = parsed.data;

  if (jobItemData.formulaLibraryId) {
    const formula = await prisma.formulaLibrary.findFirst({
      where: {
        id: jobItemData.formulaLibraryId,
        companyId,
        isActive: true,
      },
    });
    if (!formula) return errorResponse('Formula library item not found for this company', 404);
  }

  const assignedEmployeeIds =
    assignedEmployeeIdsInput === undefined
      ? undefined
      : normalizeAssignedEmployeeIds(assignedEmployeeIdsInput);
  if (assignedEmployeeIds) {
    const employeesExist = await assertCompanyEmployeesExist(companyId, assignedEmployeeIds);
    if (!employeesExist) return errorResponse('Assigned employee not found for this company', 422);
  }

  const row = await prisma.$transaction(async (tx) => {
    await tx.jobItem.update({
      where: { id: itemId },
      data: {
        ...jobItemData,
        plannedStartDate:
          jobItemData.plannedStartDate === undefined
            ? undefined
            : (jobItemData.plannedStartDate ? new Date(jobItemData.plannedStartDate) : null),
        plannedEndDate:
          jobItemData.plannedEndDate === undefined
            ? undefined
            : (jobItemData.plannedEndDate ? new Date(jobItemData.plannedEndDate) : null),
        actualStartDate:
          jobItemData.actualStartDate === undefined
            ? undefined
            : (jobItemData.actualStartDate ? new Date(jobItemData.actualStartDate) : null),
        actualEndDate:
          jobItemData.actualEndDate === undefined
            ? undefined
            : (jobItemData.actualEndDate ? new Date(jobItemData.actualEndDate) : null),
        progressUpdatedAt:
          jobItemData.progressStatus !== undefined ||
          jobItemData.progressPercent !== undefined ||
          jobItemData.trackingItems !== undefined ||
          jobItemData.trackingEnabled !== undefined ||
          jobItemData.trackingLabel !== undefined ||
          jobItemData.trackingUnit !== undefined ||
          jobItemData.trackingTargetValue !== undefined ||
          jobItemData.trackingSourceKey !== undefined ||
          jobItemData.plannedStartDate !== undefined ||
          jobItemData.plannedEndDate !== undefined ||
          jobItemData.actualStartDate !== undefined ||
          jobItemData.actualEndDate !== undefined ||
          jobItemData.progressNote !== undefined
            ? new Date()
            : undefined,
        specifications:
          jobItemData.specifications === undefined
            ? undefined
            : (jobItemData.specifications as Prisma.InputJsonValue),
        trackingItems:
          jobItemData.trackingItems === undefined
            ? undefined
            : (jobItemData.trackingItems as Prisma.InputJsonValue),
      } satisfies Prisma.JobItemUncheckedUpdateInput,
    });

    if (assignedEmployeeIds !== undefined) {
      await tx.jobItemAssignment.deleteMany({
        where: {
          companyId,
          jobItemId: itemId,
        },
      });
      if (assignedEmployeeIds.length > 0) {
        await tx.jobItemAssignment.createMany({
          data: assignedEmployeeIds.map((employeeId, index) => ({
            companyId,
            jobItemId: itemId,
            employeeId,
            sortOrder: index,
          })),
        });
      }
    }

    if (jobItemData.trackingEnabled === true || existing.trackingEnabled) {
      await syncTrackedJobItemProgress(tx, companyId, itemId);
    }

    return tx.jobItem.findFirstOrThrow({
      where: {
        id: itemId,
        companyId,
      },
      include: {
        assignedEmployees: {
          orderBy: { sortOrder: 'asc' },
          select: {
            employeeId: true,
            sortOrder: true,
          },
        },
        formulaLibrary: true,
      },
    });
  });

  return successResponse(serializeAssignedEmployeeIds(row));
}

export async function DELETE(
  _req: Request,
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
  const existing = await loadJobItem(companyId, id, itemId);
  if (!existing) return errorResponse('Job item not found', 404);

  await prisma.jobItem.delete({ where: { id: itemId } });
  return successResponse({ deleted: true });
}
