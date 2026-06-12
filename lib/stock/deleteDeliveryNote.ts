import type { Prisma } from '@prisma/client';
import type { AuditActorUser } from '@/lib/utils/auditActor';
import {
  reverseAndDeleteStockTransaction,
  sortTransactionsForDeletion,
} from '@/lib/stock/reverseAndDeleteTransaction';

type Tx = Prisma.TransactionClient;

export async function deleteDeliveryNoteWithStockTransactions(
  tx: Tx,
  params: {
    companyId: string;
    deliveryNoteId: string;
    sessionUser: AuditActorUser;
  }
) {
  const { companyId, deliveryNoteId, sessionUser } = params;

  const row = await tx.deliveryNote.findFirst({
    where: { id: deliveryNoteId, companyId },
    select: { id: true },
  });
  if (!row) throw new Error('Delivery note not found');

  const linkedTxns = await tx.transaction.findMany({
    where: { companyId, deliveryNoteId: row.id },
    select: { id: true, type: true, createdAt: true, referenceType: true },
  });

  const txnIds = linkedTxns.map((t) => t.id);
  if (txnIds.length > 0) {
    await tx.stockExceptionApproval.deleteMany({
      where: {
        companyId,
        exceptionType: 'DISPATCH_OVERRIDE',
        referenceId: { in: txnIds },
      },
    });
  }

  for (const txn of sortTransactionsForDeletion(linkedTxns)) {
    await reverseAndDeleteStockTransaction(tx, {
      companyId,
      transactionId: txn.id,
      sessionUser,
    });
  }

  await tx.deliveryNoteMaterialLine.deleteMany({ where: { deliveryNoteId: row.id } });
  await tx.deliveryNote.delete({ where: { id: row.id } });

  return { deleted: true, transactionCount: linkedTxns.length };
}
