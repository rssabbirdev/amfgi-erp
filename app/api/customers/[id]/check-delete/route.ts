import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;

  // Check for linked jobs
  const jobs = await prisma.job.findMany({
    where: {
      customerId: id,
      companyId: session.user.activeCompanyId,
    },
    select: {
      id: true,
      jobNumber: true,
      description: true,
      status: true,
    },
    take: 10,
  });

  const jobCount = await prisma.job.count({
    where: {
      customerId: id,
      companyId: session.user.activeCompanyId,
    },
  });

  return successResponse({
    canDelete: jobCount === 0,
    linkedJobs: jobs,
    linkedJobsCount: jobCount,
  });
}
