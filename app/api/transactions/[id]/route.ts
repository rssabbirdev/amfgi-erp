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

  const conn = await getCompanyDB(dbName);
  const dbSession = await conn.startSession();
  dbSession.startTransaction();

  try {
    const { Transaction, Material, StockBatch } = getModels(conn);

    const txn = await Transaction.findById(id).session(dbSession);
    if (!txn) {
      await dbSession.abortTransaction();
      return errorResponse('Transaction not found', 404);
    }

    // Create reversal transaction for audit trail instead of just deleting
    if (txn.type === 'STOCK_OUT' || txn.type === 'RETURN') {
      // Reverse the stock impact
      await Material.findByIdAndUpdate(
        txn.materialId,
        { $inc: { currentStock: txn.quantity } },
        { session: dbSession }
      );

      // Restore batch quantities for STOCK_OUT
      if (txn.type === 'STOCK_OUT' && txn.batchesUsed && txn.batchesUsed.length > 0) {
        for (const batchUsed of txn.batchesUsed) {
          await StockBatch.findByIdAndUpdate(
            batchUsed.batchId,
            { $inc: { quantityAvailable: batchUsed.quantityFromBatch } },
            { session: dbSession }
          );
        }
      }

      // Create reversal transaction for ledger
      await Transaction.create(
        [
          {
            type: 'REVERSAL',
            materialId: new Types.ObjectId(txn.materialId),
            quantity: txn.quantity,
            jobId: txn.jobId,
            parentTransactionId: txn._id,
            notes: `Reversal of ${txn.type} - ${txn.notes || ''}`,
            date: new Date(),
            performedBy: session.user.id,
          },
        ],
        { session: dbSession }
      );
    }

    // Delete the original transaction
    await Transaction.findByIdAndDelete(id, { session: dbSession });

    // If this was a STOCK_OUT, also delete any linked RETURN transactions
    if (txn.type === 'STOCK_OUT') {
      const returnTxns = await Transaction.find(
        { parentTransactionId: txn._id },
        {},
        { session: dbSession }
      );

      for (const returnTxn of returnTxns) {
        // Reverse RETURN stock impact
        await Material.findByIdAndUpdate(
          returnTxn.materialId,
          { $inc: { currentStock: -returnTxn.quantity } },
          { session: dbSession }
        );

        // Create reversal for RETURN transaction
        await Transaction.create(
          [
            {
              type: 'REVERSAL',
              materialId: new Types.ObjectId(returnTxn.materialId),
              quantity: returnTxn.quantity,
              jobId: returnTxn.jobId,
              parentTransactionId: returnTxn._id,
              notes: `Reversal of RETURN - ${returnTxn.notes || ''}`,
              date: new Date(),
              performedBy: session.user.id,
            },
          ],
          { session: dbSession }
        );

        // Delete the RETURN transaction
        await Transaction.findByIdAndDelete(returnTxn._id, { session: dbSession });
      }
    }

    await dbSession.commitTransaction();
    return successResponse({ deleted: true });
  } catch (err) {
    await dbSession.abortTransaction();
    return errorResponse('Failed to delete transaction', 500);
  } finally {
    dbSession.endSession();
  }
}
