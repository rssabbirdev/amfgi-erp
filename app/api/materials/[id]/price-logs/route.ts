import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;

  try {
    // Verify material exists and belongs to this company
    const material = await prisma.material.findUnique({ where: { id } });
    if (!material || material.companyId !== session.user.activeCompanyId) {
      return errorResponse('Material not found', 404);
    }

    const logs = await prisma.priceLog.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        materialId: id,
      },
      orderBy: { timestamp: 'desc' },
    });

    return successResponse(logs || []);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch price logs', 400);
  }
}
