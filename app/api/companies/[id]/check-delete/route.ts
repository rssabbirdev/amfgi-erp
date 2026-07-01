import { auth } from '@/auth';
import { checkCompanyDeleteEligibility } from '@/lib/companies/checkCompanyDeleteEligibility';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin) return errorResponse('Forbidden', 403);

  const { id } = await params;

  try {
    const result = await checkCompanyDeleteEligibility(prisma, id);
    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check company';
    if (message.includes('not found')) return errorResponse('Company not found', 404);
    return errorResponse(message, 500);
  }
}
