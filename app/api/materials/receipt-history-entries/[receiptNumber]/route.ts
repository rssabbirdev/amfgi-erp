import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    const batches = await prisma.stockBatch.findMany({
      where: {
        companyId,
        receiptNumber,
      },
      include: {
        material: { select: { id: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    if (batches.length === 0) {
      return errorResponse('Receipt not found', 404);
    }

    // Get first batch for receipt metadata
    const firstBatch = batches[0];

    // Enrich with material names
    const materials = batches.map((batch) => ({
      materialId: batch.materialId,
      materialName: batch.material?.name ?? 'Unknown',
      unit: batch.material?.unit ?? '—',
      warehouseId: batch.warehouse?.id ?? null,
      warehouseName: batch.warehouse?.name ?? null,
      quantityReceived: batch.quantityReceived,
      quantityAvailable: batch.quantityAvailable,
      unitCost: batch.unitCost,
      totalCost: batch.totalCost,
      batchNumber: batch.batchNumber,
    }));

    const totalValue = batches.reduce((sum, b) => sum + decimalToNumberOrZero(b.totalCost), 0);

    return successResponse({
      _id: receiptNumber,
      receiptNumber,
      receivedDate: firstBatch.receivedDate,
      supplier: firstBatch.supplier || undefined,
      notes: firstBatch.notes || undefined,
      itemsCount: batches.length,
      totalValue,
      materials,
    });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch receipt', 500);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    // Find all batches for this receipt
    const batches = await prisma.stockBatch.findMany({
      where: {
        companyId,
        receiptNumber,
      },
    });

    if (batches.length === 0) {
      return errorResponse('Receipt not found', 404);
    }

    const materialIds = batches.map((b) => b.materialId);
    const receivedDate = batches[0].receivedDate;
    const dayStart = new Date(receivedDate.getFullYear(), receivedDate.getMonth(), receivedDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(receivedDate.getFullYear(), receivedDate.getMonth(), receivedDate.getDate(), 23, 59, 59);

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Reverse stock for each batch
      for (const batch of batches) {
        await tx.material.update({
          where: { id: batch.materialId },
          data: {
            currentStock: {
              decrement: batch.quantityAvailable,
            },
          },
        });
      }

      // Delete all StockBatch records
      await tx.stockBatch.deleteMany({
        where: {
          companyId,
          receiptNumber: receiptNumber!,
        },
      });

      // Delete corresponding Transaction records (STOCK_IN for these materials on the same day)
      await tx.transaction.deleteMany({
        where: {
          companyId,
          type: 'STOCK_IN',
          materialId: { in: materialIds },
          date: { gte: dayStart, lte: dayEnd },
        },
      });
    });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to delete receipt', 400);
  }
}
