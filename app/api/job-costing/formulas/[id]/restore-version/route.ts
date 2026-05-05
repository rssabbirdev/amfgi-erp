import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { RestoreFormulaVersionSchema, formulaSnapshotData } from '../../_lib';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const formula = await prisma.formulaLibrary.findFirst({
    where: {
      id,
      companyId: session.user.activeCompanyId,
    },
  });
  if (!formula) return errorResponse('Formula library item not found', 404);

  const body = await req.json();
  const parsed = RestoreFormulaVersionSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const version = await prisma.formulaLibraryVersion.findFirst({
    where: {
      id: parsed.data.versionId,
      companyId: session.user.activeCompanyId,
      formulaLibraryId: id,
    },
  });
  if (!version) return errorResponse('Formula version not found', 404);

  const restored = await prisma.$transaction(async (tx) => {
    const updated = await tx.formulaLibrary.update({
      where: { id },
      data: {
        name: version.name,
        slug: version.slug,
        fabricationType: version.fabricationType,
        description: version.description,
        specificationSchema:
          version.specificationSchema == null
            ? Prisma.JsonNull
            : (version.specificationSchema as Prisma.InputJsonValue),
        formulaConfig: version.formulaConfig as Prisma.InputJsonValue,
      },
    });

    const latest = await tx.formulaLibraryVersion.aggregate({
      where: { companyId: session.user.activeCompanyId!, formulaLibraryId: id },
      _max: { versionNumber: true },
    });

    await tx.formulaLibraryVersion.create({
      data: formulaSnapshotData(
        updated,
        (latest._max.versionNumber ?? 0) + 1,
        session.user.id,
        parsed.data.changeNote ?? `Restored from v${version.versionNumber}`
      ),
    });

    return updated;
  });

  return successResponse(restored);
}
