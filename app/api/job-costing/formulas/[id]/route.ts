import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { FormulaLibraryUpdateSchema, formulaChanged, formulaSnapshotData } from '../_lib';

async function loadFormula(id: string, companyId: string) {
  return prisma.formulaLibrary.findFirst({
    where: { id, companyId },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const { id } = await params;
  const row = await loadFormula(id, session.user.activeCompanyId);
  if (!row) return errorResponse('Formula library item not found', 404);
  return successResponse(row);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const existing = await loadFormula(id, session.user.activeCompanyId);
  if (!existing) return errorResponse('Formula library item not found', 404);

  const body = await req.json();
  const parsed = FormulaLibraryUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const shouldCreateVersion = (parsed.data.saveMode ?? 'manual') === 'manual' && formulaChanged(existing, parsed.data);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.formulaLibrary.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        fabricationType: parsed.data.fabricationType,
        description: parsed.data.description,
        isActive: parsed.data.isActive,
        specificationSchema:
          parsed.data.specificationSchema === undefined
            ? undefined
            : parsed.data.specificationSchema == null
              ? Prisma.JsonNull
              : (parsed.data.specificationSchema as Prisma.InputJsonValue),
        formulaConfig:
          parsed.data.formulaConfig === undefined
            ? undefined
            : (parsed.data.formulaConfig as Prisma.InputJsonValue),
      },
    });

    if (shouldCreateVersion) {
      const latest = await tx.formulaLibraryVersion.aggregate({
        where: { companyId: session.user.activeCompanyId!, formulaLibraryId: id },
        _max: { versionNumber: true },
      });
      await tx.formulaLibraryVersion.create({
        data: formulaSnapshotData(
          updated,
          (latest._max.versionNumber ?? 0) + 1,
          session.user.id,
          parsed.data.changeNote ?? 'Manual save'
        ),
      });
    }

    return updated;
  });

  return successResponse(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const existing = await loadFormula(id, session.user.activeCompanyId);
  if (!existing) return errorResponse('Formula library item not found', 404);

  const linkedItems = await prisma.jobItem.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      formulaLibraryId: id,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      job: {
        select: {
          id: true,
          jobNumber: true,
          description: true,
        },
      },
    },
    orderBy: [
      { job: { jobNumber: 'asc' } },
      { name: 'asc' },
    ],
    take: 25,
  });

  if (linkedItems.length > 0) {
    return errorResponse(
      'Formula is linked to active job items and cannot be deleted',
      409,
      {
        formulaId: id,
        formulaName: existing.name,
        linkedJobItemCount: linkedItems.length,
        linkedJobItems: linkedItems.map((item) => ({
          id: item.id,
          itemName: item.name,
          jobId: item.job.id,
          jobNumber: item.job.jobNumber,
          jobDescription: item.job.description,
        })),
      }
    );
  }

  await prisma.formulaLibrary.delete({ where: { id } });
  return successResponse({ deleted: true });
}
