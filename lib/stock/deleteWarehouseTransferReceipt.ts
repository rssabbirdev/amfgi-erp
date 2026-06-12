import type { Prisma } from '@prisma/client';
import type { AuditActorUser } from '@/lib/utils/auditActor';
import {
  reverseAndDeleteStockTransaction,
  sortTransactionsForDeletion,
} from '@/lib/stock/reverseAndDeleteTransaction';

type Tx = Prisma.TransactionClient;

export const WAREHOUSE_TRANSFER_RECEIPT_PREFIX = 'WH-XFER-';

export function isWarehouseTransferReceiptNumber(receiptNumber: string) {
  return receiptNumber.startsWith(WAREHOUSE_TRANSFER_RECEIPT_PREFIX);
}

/**
 * Unwind a warehouse transfer shown in receipt history (WH-XFER-* batches).
 */
export async function deleteWarehouseTransferReceipt(
  tx: Tx,
  params: {
    companyId: string;
    receiptNumber: string;
    batchIds: string[];
    sessionUser: AuditActorUser;
  }
) {
  const { companyId, receiptNumber, batchIds, sessionUser } = params;

  const links = await tx.transactionBatch.findMany({
    where: { batchId: { in: batchIds } },
    include: {
      transaction: {
        select: {
          id: true,
          type: true,
          createdAt: true,
          referenceType: true,
          parentTransactionId: true,
          deliveryNoteId: true,
        },
      },
    },
  });

  const transferInIds = new Set(
    links
      .filter((link) => link.transaction.type === 'TRANSFER_IN')
      .map((link) => link.transactionId)
  );

  if (transferInIds.size === 0) {
    throw new Error(
      'Transfer receipt is missing ledger links and cannot be deleted safely. Please refresh and retry.'
    );
  }

  const transferOutIds = new Set<string>();
  for (const link of links) {
    const parentId = link.transaction.parentTransactionId;
    if (link.transaction.type === 'TRANSFER_IN' && parentId) {
      transferOutIds.add(parentId);
    }
  }

  const linkedTransactions = await tx.transaction.findMany({
    where: {
      companyId,
      id: { in: [...transferInIds, ...transferOutIds] },
    },
    select: {
      id: true,
      type: true,
      createdAt: true,
      referenceType: true,
      deliveryNoteId: true,
    },
  });

  if (linkedTransactions.some((txn) => txn.deliveryNoteId)) {
    throw new Error(
      'This transfer is linked to a delivery note. Delete the delivery note from Dispatch instead.'
    );
  }

  for (const txn of sortTransactionsForDeletion(linkedTransactions)) {
    await reverseAndDeleteStockTransaction(tx, {
      companyId,
      transactionId: txn.id,
      sessionUser,
      deleteLinkedReturns: false,
    });
  }

  const remainingBatches = await tx.stockBatch.count({
    where: { companyId, receiptNumber },
  });
  if (remainingBatches > 0) {
    throw new Error(
      'Transfer receipt could not be fully removed because stock is still linked elsewhere.'
    );
  }

  return { deleted: true, transactionCount: linkedTransactions.length };
}
