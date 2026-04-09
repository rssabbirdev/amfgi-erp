import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;

  // Check for linked transactions
  const transactions = await prisma.transaction.findMany({
    where: {
      jobId: id,
      companyId: session.user.activeCompanyId,
    },
    select: {
      id: true,
      type: true,
      quantity: true,
      materialId: true,
    },
    take: 10,
  });

  const txnCount = await prisma.transaction.count({
    where: {
      jobId: id,
      companyId: session.user.activeCompanyId,
    },
  });

  return successResponse({
    canDelete: txnCount === 0,
    linkedTransactions: transactions,
    linkedTransactionsCount: txnCount,
  });
}
