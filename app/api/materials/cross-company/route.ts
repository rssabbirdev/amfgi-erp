import { auth }   from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('companyId');
  if (!companyId) return errorResponse('companyId is required', 400);

  if (companyId === session.user.activeCompanyId) {
    return errorResponse('Use /api/materials for your own company', 400);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return errorResponse('Company not found', 404);
  if (!company.isActive) return errorResponse('Company is inactive', 400);

  const materials = await prisma.material.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, unit: true, currentStock: true, isActive: true },
    orderBy: { name: 'asc' },
  });

  return successResponse(materials);
}
