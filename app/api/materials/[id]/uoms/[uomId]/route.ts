import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function canEdit(user: AppSessionUser) {
  return user.isSuperAdmin || user.permissions.includes('material.edit');
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string; uomId: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canEdit(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id: materialId, uomId } = await ctx.params;

  const mat = await prisma.material.findFirst({
    where: { id: materialId, companyId: session.user.activeCompanyId },
    select: { id: true },
  });
  if (!mat) return errorResponse('Material not found', 404);

  const row = await prisma.materialUom.findFirst({
    where: { id: uomId, materialId },
  });
  if (!row) return errorResponse('UOM not found', 404);

  const childCount = await prisma.materialUom.count({
    where: { parentUomId: uomId },
  });
  if (childCount > 0) {
    return errorResponse('Remove derived units that reference this UOM as parent first.', 409);
  }

  await prisma.materialUom.delete({ where: { id: uomId } });

  return successResponse({ deleted: true });
}
