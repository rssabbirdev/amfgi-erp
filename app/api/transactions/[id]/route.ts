import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;

  try {
    const conn = await getCompanyDB(dbName);
    const { Transaction } = getModels(conn);

    const txn = await Transaction.findById(id);
    if (!txn) return errorResponse('Transaction not found', 404);

    await Transaction.findByIdAndDelete(id);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse('Failed to delete transaction', 500);
  }
}
