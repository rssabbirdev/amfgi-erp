import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const conn = await getCompanyDB(dbName);
  const { Transaction } = getModels(conn);

  // Check for linked transactions
  const transactions = await Transaction.find({ materialId: new Types.ObjectId(id) })
    .lean()
    .limit(10);

  const txnCount = await Transaction.countDocuments({ materialId: new Types.ObjectId(id) });

  return successResponse({
    canDelete: txnCount === 0,
    linkedTransactions: transactions,
    linkedTransactionsCount: txnCount,
  });
}
