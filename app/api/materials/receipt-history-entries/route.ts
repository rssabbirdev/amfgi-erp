import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

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

  const conn = await getCompanyDB(dbName);
  const { StockBatch, Material } = getModels(conn);

  try {
    // Group StockBatch records by receiptNumber
    const entries = await StockBatch.aggregate([
      {
        $match: {
          receiptNumber: { $exists: true, $ne: null },
          receivedDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$receiptNumber',
          lines: { $push: '$$ROOT' },
          totalValue: { $sum: '$totalCost' },
          itemsCount: { $sum: 1 },
          receivedDate: { $min: '$receivedDate' },
          supplier: { $first: '$supplier' },
          notes: { $first: '$notes' },
        },
      },
      {
        $sort: { receivedDate: -1 },
      },
    ]);

    // Enrich with material names
    const enrichedEntries = await Promise.all(
      entries.map(async (entry) => {
        const materials = await Promise.all(
          entry.lines.map(async (line: any) => {
            const mat = await Material.findById(line.materialId).lean();
            return {
              materialId: line.materialId.toString(),
              materialName: mat?.name ?? 'Unknown',
              unit: mat?.unit ?? '—',
              quantityReceived: line.quantityReceived,
              quantityAvailable: line.quantityAvailable,
              unitCost: line.unitCost,
              totalCost: line.totalCost,
              batchNumber: line.batchNumber,
            };
          })
        );

        return {
          _id: entry._id,
          receiptNumber: entry._id,
          receivedDate: entry.receivedDate,
          supplier: entry.supplier || undefined,
          notes: entry.notes || undefined,
          itemsCount: entry.itemsCount,
          totalValue: entry.totalValue,
          materials,
        };
      })
    );

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
