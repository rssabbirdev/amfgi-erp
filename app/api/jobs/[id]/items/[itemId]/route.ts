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

const JobItemUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  formulaLibraryId: z.string().min(1).optional(),
  specifications: z.unknown().optional(),
  assignedEmployeeIds: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

async function loadJobItem(companyId: string, jobId: string, itemId: string) {
  return prisma.jobItem.findFirst({
    where: {
      id: itemId,
      jobId,
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
  const row = await prisma.jobItem.findFirst({
    where: {
      id: itemId,
      jobId: id,
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
        specifications:
          jobItemData.specifications === undefined
            ? undefined
            : (jobItemData.specifications as Prisma.InputJsonValue),
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
