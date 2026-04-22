import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView =
    session.user.isSuperAdmin ||
    session.user.permissions.includes('material.view') ||
    session.user.permissions.includes('transaction.stock_in') ||
    session.user.permissions.includes('transaction.stock_out');

  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const rows = await prisma.stockBatch.findMany({
      where: { companyId: session.user.activeCompanyId },
      include: {
        material: {
          select: {
            id: true,
            name: true,
            unit: true,
            warehouse: true,
            stockType: true,
          },
        },
        supplierRef: {
          select: {
            id: true,
            name: true,
          },
        },
        transactionLinks: {
          include: {
            transaction: {
              select: {
                id: true,
                type: true,
                date: true,
                jobId: true,
              },
            },
          },
          orderBy: {
            transaction: {
              date: 'desc',
            },
          },
        },
      },
      orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
    });

    const data = rows.map((row) => {
      const consumedQty = row.quantityReceived - row.quantityAvailable;
      const latestUsage = row.transactionLinks[0]?.transaction;
      const issueLinkCount = row.transactionLinks.filter(
        (link) => link.transaction.type === 'STOCK_OUT'
      ).length;

      return {
        id: row.id,
        batchNumber: row.batchNumber,
        receiptNumber: row.receiptNumber,
        materialId: row.materialId,
        materialName: row.material?.name ?? 'Unknown',
        materialUnit: row.material?.unit ?? '-',
        warehouse: row.material?.warehouse ?? null,
        stockType: row.material?.stockType ?? null,
        supplierId: row.supplierRef?.id ?? null,
        supplierName: row.supplierRef?.name ?? row.supplier ?? null,
        quantityReceived: row.quantityReceived,
        quantityAvailable: row.quantityAvailable,
        quantityConsumed: consumedQty,
        unitCost: row.unitCost,
        totalCost: row.totalCost,
        receivedDate: row.receivedDate,
        expiryDate: row.expiryDate,
        notes: row.notes,
        issueLinkCount,
        latestUsageDate: latestUsage?.date ?? null,
      };
    });

    return successResponse(data);
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load stock batches', 500);
  }
}
