import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
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

  const rows = await prisma.jobItem.findMany({
    where: {
      companyId,
      jobId: id,
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
  if (!job.parentJobId) {
    return errorResponse('Job items can only be attached to variation jobs', 422);
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
        jobId: id,
        createdBy: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        formulaLibraryId: parsed.data.formulaLibraryId,
        specifications: parsed.data.specifications as Prisma.InputJsonValue,
        sortOrder: parsed.data.sortOrder ?? 0,
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
