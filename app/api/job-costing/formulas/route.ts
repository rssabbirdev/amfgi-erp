import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { FormulaLibrarySchema, formulaSnapshotData } from './_lib';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const rows = await prisma.formulaLibrary.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      isActive: true,
    },
    orderBy: [{ fabricationType: 'asc' }, { name: 'asc' }],
  });

  return successResponse(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  const companyId = session.user.activeCompanyId;
  if (!companyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = FormulaLibrarySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.formulaLibrary.create({
      data: {
        companyId,
        createdBy: session.user.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
        fabricationType: parsed.data.fabricationType,
        description: parsed.data.description,
        specificationSchema:
          parsed.data.specificationSchema == null
            ? Prisma.JsonNull
            : (parsed.data.specificationSchema as Prisma.InputJsonValue),
        formulaConfig: parsed.data.formulaConfig as Prisma.InputJsonValue,
      },
    });

    await tx.formulaLibraryVersion.create({
      data: formulaSnapshotData(created, 1, session.user.id, parsed.data.changeNote ?? 'Initial version'),
    });

    return created;
  });

  return successResponse(row, 201);
}
