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

  const customer = await prisma.customer.findFirst({
    where: { id, companyId: session.user.activeCompanyId },
    select: { id: true, source: true },
  });
  if (!customer) return errorResponse('Customer not found', 404);

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

  const isLocal = customer.source === 'LOCAL';
  const canHardDelete = isLocal && jobCount === 0;
  const canDeactivate = isLocal && jobCount > 0;

  return successResponse({
    source: customer.source,
    canDelete: isLocal,
    canHardDelete,
    canDeactivate,
    deleteBlockedReason:
      customer.source === 'PARTY_API_SYNC'
        ? 'synced_from_party_api'
        : undefined,
    linkedJobs: jobs,
    linkedJobsCount: jobCount,
  });
}
