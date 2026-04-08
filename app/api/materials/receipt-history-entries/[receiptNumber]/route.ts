import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { receiptNumber } = await params;
  const conn = await getCompanyDB(dbName);
  const { StockBatch, Material } = getModels(conn);

  try {
    const batches = await StockBatch.find({ receiptNumber }).lean();
    if (batches.length === 0) {
      return errorResponse('Receipt not found', 404);
    }

    // Get first batch for receipt metadata
    const firstBatch = batches[0] as any;

    // Enrich with material names
    const materials = await Promise.all(
      batches.map(async (line: any) => {
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

    const totalValue = batches.reduce((sum: number, b: any) => sum + b.totalCost, 0);

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

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { receiptNumber } = await params;
  const conn = await getCompanyDB(dbName);
  const { StockBatch, Transaction, Material } = getModels(conn);

  const dbSession = await conn.startSession();
  dbSession.startTransaction();

  try {
    // Find all batches for this receipt
    const batches = await StockBatch.find(
      { receiptNumber },
      {},
      { session: dbSession }
    );

    if (batches.length === 0) {
      await dbSession.abortTransaction();
      return errorResponse('Receipt not found', 404);
    }

    const materialIds = batches.map((b: any) => b.materialId);
    const receivedDate = (batches[0] as any).receivedDate;
    const dayStart = new Date(receivedDate.getFullYear(), receivedDate.getMonth(), receivedDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(receivedDate.getFullYear(), receivedDate.getMonth(), receivedDate.getDate(), 23, 59, 59);

    // Reverse stock for each batch
    for (const batch of batches) {
      await Material.findByIdAndUpdate(
        batch.materialId,
        { $inc: { currentStock: -batch.quantityAvailable } },
        { session: dbSession }
      );
    }

    // Delete all StockBatch records
    await StockBatch.deleteMany({ receiptNumber }, { session: dbSession });

    // Delete corresponding Transaction records (STOCK_IN for these materials on the same day)
    await Transaction.deleteMany(
      {
        type: 'STOCK_IN',
        materialId: { $in: materialIds },
        date: { $gte: dayStart, $lte: dayEnd },
      },
      { session: dbSession }
    );

    await dbSession.commitTransaction();
    return successResponse({ deleted: true });
  } catch (err: unknown) {
    await dbSession.abortTransaction();
    return errorResponse(err instanceof Error ? err.message : 'Failed to delete receipt', 400);
  } finally {
    dbSession.endSession();
  }
}
