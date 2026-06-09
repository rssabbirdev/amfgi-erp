import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
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
  if (links.length === 0) return;
  await Promise.all(
    links.map((link) =>
      tx.stockBatch.update({
        where: { id: link.batchId },
        data: {
          quantityAvailable: {
            increment: link.quantityFromBatch,
          },
        },
      })
    )
  );
}

export async function consumeTransactionBatchQuantities(
  tx: Tx,
  links: readonly TransactionBatchLinkInput[],
  errorMessage: string
) {
  if (links.length === 0) return;
  const results = await Promise.all(
    links.map((link) =>
      tx.stockBatch.updateMany({
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
      })
    )
  );
  if (results.some((result) => result.count === 0)) {
    throw new Error(errorMessage);
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
        id: randomUUID(),
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
