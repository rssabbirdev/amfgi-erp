import type { Prisma } from '@prisma/client';
import { buildTransactionActorFields, type AuditActorUser } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  consumeTransactionBatchQuantities,
  consumeTransactionBatchQuantitiesBestEffort,
  normalizeTransactionBatchLinks,
  restoreTransactionBatchQuantities,
} from '@/lib/utils/transactionBatchLinks';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';

type Tx = Prisma.TransactionClient;

const EPSILON = 0.0005;

/**
 * Reverse stock impact and delete one ledger transaction (STOCK_OUT, RETURN, TRANSFER_*).
 */
export async function reverseAndDeleteStockTransaction(
  tx: Tx,
  params: {
    companyId: string;
    transactionId: string;
    sessionUser: AuditActorUser;
    deleteLinkedReturns?: boolean;
  }
) {
  const { companyId, transactionId, sessionUser, deleteLinkedReturns = true } = params;
  const actorFields = buildTransactionActorFields(sessionUser);

  const txn = await tx.transaction.findFirst({
    where: { id: transactionId, companyId },
    include: { batchesUsed: true },
  });
  if (!txn) return;

  const qty = decimalToNumberOrZero(txn.quantity);
  const inboundBatchIdsToCleanup: string[] = [];

  if (txn.type === 'STOCK_OUT' || txn.type === 'RETURN') {
    await tx.material.update({
      where: { id: txn.materialId },
      data: {
        currentStock: {
          increment: txn.type === 'STOCK_OUT' ? qty : -qty,
        },
      },
    });
    const reversalWarehouse = await resolveEffectiveWarehouse(tx, {
      companyId,
      materialId: txn.materialId,
      warehouseId: txn.warehouseId,
    });
    await applyMaterialWarehouseDelta(
      tx,
      companyId,
      txn.materialId,
      reversalWarehouse.warehouseId,
      txn.type === 'STOCK_OUT' ? qty : -qty
    );

    if (txn.type === 'STOCK_OUT' && txn.batchesUsed.length > 0) {
      await restoreTransactionBatchQuantities(tx, normalizeTransactionBatchLinks(txn.batchesUsed));
    }
    if (txn.type === 'RETURN' && txn.batchesUsed.length > 0) {
      await consumeTransactionBatchQuantities(
        tx,
        normalizeTransactionBatchLinks(txn.batchesUsed),
        'Stock changed while deleting this return. Please refresh and retry.'
      );
    }

    await tx.transaction.create({
      data: {
        companyId,
        type: 'REVERSAL',
        materialId: txn.materialId,
        warehouseId: reversalWarehouse.warehouseId,
        quantity: txn.quantity,
        jobId: txn.jobId,
        notes: `Reversal of ${txn.type} - ${txn.notes || ''}`,
        date: new Date(),
        ...actorFields,
      },
    });
  } else if (txn.type === 'TRANSFER_IN') {
    const warehouse = await resolveEffectiveWarehouse(tx, {
      companyId,
      materialId: txn.materialId,
      warehouseId: txn.warehouseId,
    });
    const links = normalizeTransactionBatchLinks(txn.batchesUsed);
    let warehouseReduction = qty;
    if (links.length > 0) {
      warehouseReduction = await consumeTransactionBatchQuantitiesBestEffort(tx, links);
      inboundBatchIdsToCleanup.push(...links.map((link) => link.batchId));
    }
    if (warehouseReduction > EPSILON) {
      await applyMaterialWarehouseDelta(
        tx,
        companyId,
        txn.materialId,
        warehouse.warehouseId,
        -warehouseReduction
      );
    }
  } else if (txn.type === 'TRANSFER_OUT') {
    const warehouse = await resolveEffectiveWarehouse(tx, {
      companyId,
      materialId: txn.materialId,
      warehouseId: txn.warehouseId,
    });
    if (txn.batchesUsed.length > 0) {
      await restoreTransactionBatchQuantities(tx, normalizeTransactionBatchLinks(txn.batchesUsed));
    }
    await applyMaterialWarehouseDelta(tx, companyId, txn.materialId, warehouse.warehouseId, qty);
  }

  if (txn.type === 'STOCK_OUT' && deleteLinkedReturns) {
    const returnTxns = await tx.transaction.findMany({
      where: { parentTransactionId: txn.id, companyId },
      include: { batchesUsed: true },
    });
    for (const returnTxn of returnTxns) {
      await reverseAndDeleteStockTransaction(tx, {
        companyId,
        transactionId: returnTxn.id,
        sessionUser,
        deleteLinkedReturns: false,
      });
    }
  }

  await tx.transaction.delete({ where: { id: txn.id } });

  for (const batchId of inboundBatchIdsToCleanup) {
    const batch = await tx.stockBatch.findUnique({ where: { id: batchId } });
    if (!batch) continue;
    const remaining = decimalToNumberOrZero(batch.quantityAvailable);
    if (remaining > EPSILON) continue;
    const linkCount = await tx.transactionBatch.count({ where: { batchId } });
    if (linkCount === 0) {
      await tx.stockBatch.delete({ where: { id: batchId } });
    }
  }
}

/**
 * Delete order for full unwind (incl. partial/full subcontract receive):
 * receive transfers → issue transfers → returns → stock-outs; IN before OUT; newest first.
 */
export function sortTransactionsForDeletion(
  txns: Array<{ id: string; type: string; createdAt: Date; referenceType?: string | null }>
) {
  const referenceRank = (referenceType: string | null | undefined) => {
    if (referenceType === 'subcontract_receive') return 0;
    if (referenceType === 'subcontract_issue') return 1;
    return 2;
  };
  const typeRank = (type: string) => {
    if (type === 'TRANSFER_IN') return 0;
    if (type === 'TRANSFER_OUT') return 1;
    if (type === 'RETURN') return 2;
    if (type === 'STOCK_OUT') return 3;
    return 4;
  };
  return [...txns].sort((a, b) => {
    const refDiff = referenceRank(a.referenceType) - referenceRank(b.referenceType);
    if (refDiff !== 0) return refDiff;
    const rankDiff = typeRank(a.type) - typeRank(b.type);
    if (rankDiff !== 0) return rankDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
