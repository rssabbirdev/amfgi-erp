import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

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
  const formula = await prisma.formulaLibrary.findFirst({
    where: {
      id,
      companyId: session.user.activeCompanyId,
    },
    select: { id: true },
  });

  if (!formula) return errorResponse('Formula library item not found', 404);

  const rows = await prisma.formulaLibraryVersion.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      formulaLibraryId: id,
    },
    orderBy: [{ versionNumber: 'desc' }],
  });

  return successResponse(rows);
}
