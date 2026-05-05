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

const JobItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  formulaLibraryId: z.string().min(1),
  specifications: z.unknown(),
  assignedEmployeeIds: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).optional(),
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

async function loadVariationJob(jobId: string, companyId: string) {
  return prisma.job.findFirst({
    where: {
      id: jobId,
      companyId,
    },
    select: {
      id: true,
      parentJobId: true,
      companyId: true,
      jobNumber: true,
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_VIEW)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const job = await loadVariationJob(id, companyId);
  if (!job) return errorResponse('Job not found', 404);

  const budgetCtx = await resolveJobBudgetContext(prisma, companyId, id);
  if (!budgetCtx) return errorResponse('Job not found', 404);

  const rows = await prisma.jobItem.findMany({
    where: {
      companyId,
      jobId: budgetCtx.budgetJobId,
      isActive: true,
    },
    include: {
      assignedEmployees: {
        orderBy: { sortOrder: 'asc' },
        select: {
          employeeId: true,
          sortOrder: true,
        },
      },
      formulaLibrary: {
        select: {
          id: true,
          name: true,
          slug: true,
          fabricationType: true,
          formulaConfig: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return successResponse({
    job,
    items: rows.map(serializeAssignedEmployeeIds),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const job = await loadVariationJob(id, companyId);
  if (!job) return errorResponse('Job not found', 404);
  if (job.parentJobId) {
    return errorResponse(
      'Material budget lines are stored on the parent contract job. Open the parent job to add or edit budget items.',
      422
    );
  }

  const body = await req.json();
  const parsed = JobItemSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const formula = await prisma.formulaLibrary.findFirst({
    where: {
      id: parsed.data.formulaLibraryId,
      companyId,
      isActive: true,
    },
  });
  if (!formula) return errorResponse('Formula library item not found for this company', 404);

  const assignedEmployeeIds = normalizeAssignedEmployeeIds(parsed.data.assignedEmployeeIds);
  const employeesExist = await assertCompanyEmployeesExist(companyId, assignedEmployeeIds);
  if (!employeesExist) return errorResponse('Assigned employee not found for this company', 422);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.jobItem.create({
      data: {
        companyId,
        jobId: job.id,
        createdBy: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        formulaLibraryId: parsed.data.formulaLibraryId,
        specifications: parsed.data.specifications as Prisma.InputJsonValue,
        sortOrder: parsed.data.sortOrder ?? 0,
        progressStatus: parsed.data.progressStatus ?? 'NOT_STARTED',
        progressPercent: parsed.data.progressPercent ?? 0,
        trackingItems: parsed.data.trackingItems as Prisma.InputJsonValue | undefined,
        trackingEnabled: parsed.data.trackingEnabled ?? false,
        trackingLabel: parsed.data.trackingLabel?.trim() || null,
        trackingUnit: parsed.data.trackingUnit?.trim() || null,
        trackingTargetValue: parsed.data.trackingTargetValue ?? null,
        trackingSourceKey: parsed.data.trackingSourceKey?.trim() || null,
        plannedStartDate: parsed.data.plannedStartDate ? new Date(parsed.data.plannedStartDate) : null,
        plannedEndDate: parsed.data.plannedEndDate ? new Date(parsed.data.plannedEndDate) : null,
        actualStartDate: parsed.data.actualStartDate ? new Date(parsed.data.actualStartDate) : null,
        actualEndDate: parsed.data.actualEndDate ? new Date(parsed.data.actualEndDate) : null,
        progressNote: parsed.data.progressNote ?? null,
        progressUpdatedAt: parsed.data.progressStatus !== undefined || parsed.data.progressPercent !== undefined || parsed.data.plannedStartDate !== undefined || parsed.data.plannedEndDate !== undefined || parsed.data.actualStartDate !== undefined || parsed.data.actualEndDate !== undefined || parsed.data.progressNote !== undefined ? new Date() : null,
      },
    });

    if (assignedEmployeeIds.length > 0) {
      await tx.jobItemAssignment.createMany({
        data: assignedEmployeeIds.map((employeeId, index) => ({
          companyId,
          jobItemId: created.id,
          employeeId,
          sortOrder: index,
        })),
      });
    }

    if (parsed.data.trackingEnabled) {
      await syncTrackedJobItemProgress(tx, companyId, created.id);
    }

    return tx.jobItem.findFirstOrThrow({
      where: {
        id: created.id,
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
        formulaLibrary: {
          select: {
            id: true,
            name: true,
            slug: true,
            fabricationType: true,
            formulaConfig: true,
          },
        },
      },
    });
  });

  return successResponse(serializeAssignedEmployeeIds(item), 201);
}
