import type { Prisma, PrismaClient } from '@prisma/client';
import { decimalToNumberOrZero } from './decimal';

type Tx = PrismaClient | Prisma.TransactionClient;

export type TransactionBatchLinkInput = {
  batchId: string;
  batchNumber: string;
  quantityFromBatch: number;
  unitCost: number;
  costAmount: number;
};

export async function restoreTransactionBatchQuantities(
  tx: Tx,
  links: readonly TransactionBatchLinkInput[]
) {
  for (const link of links) {
    await tx.stockBatch.update({
      where: { id: link.batchId },
      data: {
        quantityAvailable: {
          increment: link.quantityFromBatch,
        },
      },
    });
  }
}

export async function consumeTransactionBatchQuantities(
  tx: Tx,
  links: readonly TransactionBatchLinkInput[],
  errorMessage: string
) {
  for (const link of links) {
    const batchUpdateResult = await tx.stockBatch.updateMany({
      where: {
        id: link.batchId,
        quantityAvailable: {
          gte: link.quantityFromBatch,
        },
      },
      data: {
        quantityAvailable: {
          decrement: link.quantityFromBatch,
        },
      },
    });
    if (batchUpdateResult.count === 0) {
      throw new Error(errorMessage);
    }
  }
}

export async function createTransactionBatchRecords(
  tx: Tx,
  transactionId: string,
  links: readonly TransactionBatchLinkInput[]
) {
  for (const link of links) {
    await tx.transactionBatch.create({
      data: {
        transactionId,
        batchId: link.batchId,
        batchNumber: link.batchNumber,
        quantityFromBatch: link.quantityFromBatch,
        unitCost: link.unitCost,
        costAmount: link.costAmount,
      },
    });
  }
}

export function normalizeTransactionBatchLinks<
  T extends {
    batchId: string;
    batchNumber: string;
    quantityFromBatch: unknown;
    unitCost: unknown;
    costAmount: unknown;
  },
>(links: readonly T[]): TransactionBatchLinkInput[] {
  return links.map((link) => ({
    batchId: link.batchId,
    batchNumber: link.batchNumber,
    quantityFromBatch: decimalToNumberOrZero(link.quantityFromBatch),
    unitCost: decimalToNumberOrZero(link.unitCost),
    costAmount: decimalToNumberOrZero(link.costAmount),
  }));
}
