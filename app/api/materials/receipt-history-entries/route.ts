import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const filterType = searchParams.get('filterType') ?? 'all';
  const dateStr = searchParams.get('date');

  let startDate = new Date(0);
  let endDate = new Date();

  if (filterType === 'day' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  } else if (filterType === 'month' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  }

  try {
    // Get all StockBatches with receipt numbers in the date range
    const batches = await prisma.stockBatch.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        receiptNumber: { not: null },
        receivedDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        material: true,
        warehouse: {
          select: { id: true, name: true },
        },
      },
      orderBy: { receivedDate: 'desc' },
    });

    // Group by receiptNumber
    const grouped = new Map<string, typeof batches>();
    batches.forEach((batch) => {
      if (batch.receiptNumber) {
        if (!grouped.has(batch.receiptNumber)) {
          grouped.set(batch.receiptNumber, []);
        }
        grouped.get(batch.receiptNumber)!.push(batch);
      }
    });

    // Format entries
    const enrichedEntries = Array.from(grouped.entries()).map(([receiptNumber, lines]) => {
      const materials = lines.map((line) => ({
        materialId: line.materialId,
        materialName: line.material?.name ?? 'Unknown',
        unit: line.material?.unit ?? '—',
        warehouseId: line.warehouse?.id ?? null,
        warehouseName: line.warehouse?.name ?? null,
        quantityReceived: line.quantityReceived,
        quantityAvailable: line.quantityAvailable,
        unitCost: line.unitCost,
        totalCost: line.totalCost,
        batchNumber: line.batchNumber,
      }));

      const totalValue = lines.reduce((sum, line) => sum + decimalToNumberOrZero(line.totalCost), 0);
      const firstLine = lines[0];

      return {
        id: receiptNumber,
        receiptNumber,
        receivedDate: firstLine!.receivedDate,
        supplier: firstLine!.supplier || undefined,
        notes: firstLine!.notes || undefined,
        itemsCount: lines.length,
        totalValue,
        materials,
      };
    });

    return successResponse({
      entries: enrichedEntries,
      dateRange: {
        startDate,
        endDate,
        filterType,
      },
    });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch receipt entries', 500);
  }
}
