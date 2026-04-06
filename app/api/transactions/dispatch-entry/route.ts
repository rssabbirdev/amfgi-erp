import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const dateStr = searchParams.get('date');

  if (!jobId || !dateStr) {
    return errorResponse('jobId and date are required', 400);
  }

  const conn = await getCompanyDB(dbName);
  const { Transaction, Material } = getModels(conn);

  // Parse date to day boundaries
  const date = new Date(dateStr);
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

  // Find all STOCK_OUT transactions for this job on this date
  const transactions = await Transaction.find({
    type: 'STOCK_OUT',
    jobId: new Types.ObjectId(jobId),
    date: { $gte: startOfDay, $lte: endOfDay },
  }).lean();

  if (transactions.length === 0) {
    return successResponse({
      exists: false,
      lines: [],
      transactionIds: [],
      notes: '',
    });
  }

  // Enrich with material details
  const lines = await Promise.all(
    transactions.map(async (txn: any) => {
      const material = await Material.findById(txn.materialId).lean();
      return {
        materialId: txn.materialId.toString(),
        materialName: material?.name ?? 'Unknown',
        unit: material?.unit ?? '',
        quantity: txn.quantity,
        transactionId: txn._id.toString(),
      };
    })
  );

  // Extract notes from the first transaction
  const notes = transactions[0]?.notes ?? '';

  return successResponse({
    exists: true,
    lines,
    transactionIds: transactions.map((t: any) => t._id.toString()),
    notes,
  });
}
