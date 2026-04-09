import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;

  // Verify material exists and belongs to this company
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material || material.companyId !== session.user.activeCompanyId) {
    return errorResponse('Material not found', 404);
  }

  // Check for linked transactions with job info
  const transactions = await prisma.transaction.findMany({
    where: {
      materialId: id,
      companyId: session.user.activeCompanyId,
    },
    include: { job: { select: { jobNumber: true } } },
    take: 10,
  });

  const txnCount = await prisma.transaction.count({
    where: {
      materialId: id,
      companyId: session.user.activeCompanyId,
    },
  });

  // Format transactions for frontend
  const formattedTransactions = transactions.map((tx) => ({
    type: tx.type,
    quantity: tx.quantity,
    jobNumber: tx.job?.jobNumber || 'N/A',
    date: tx.date,
  }));

  return successResponse({
    canDelete: txnCount === 0,
    linkedTransactions: formattedTransactions,
    linkedTransactionsCount: txnCount,
  });
}
