import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, source: true },
  });
  if (!supplier) return errorResponse('Supplier not found', 404);

  const batchCount = await prisma.stockBatch.count({
    where: {
      companyId,
      OR: [{ supplierId: id }, { supplier: supplier.name }],
    },
  });

  const isLocal = supplier.source === 'LOCAL';
  const canHardDelete = isLocal && batchCount === 0;
  const canDeactivate = isLocal && batchCount > 0;

  return successResponse({
    source: supplier.source,
    canDelete: isLocal,
    canHardDelete,
    canDeactivate,
    deleteBlockedReason:
      supplier.source === 'PARTY_API_SYNC' ? 'synced_from_party_api' : undefined,
    linkedBatchesCount: batchCount,
  });
}
