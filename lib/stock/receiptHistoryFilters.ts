import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Receipt numbers for warehouse-transfer batches tied to delivery notes (subcontract issue/receive).
 * These are internal moves and must not appear in goods receipt history totals.
 */
export async function getDeliveryNoteTransferReceiptNumbers(
  db: Db,
  companyId: string,
  receiptNumbers: string[]
): Promise<Set<string>> {
  const unique = [...new Set(receiptNumbers.filter(Boolean))];
  if (unique.length === 0) return new Set();

  const links = await db.transactionBatch.findMany({
    where: {
      batch: {
        companyId,
        receiptNumber: { in: unique },
      },
      transaction: {
        type: 'TRANSFER_IN',
        deliveryNoteId: { not: null },
      },
    },
    select: {
      batch: { select: { receiptNumber: true } },
    },
  });

  return new Set(
    links
      .map((link) => link.batch.receiptNumber)
      .filter((value): value is string => Boolean(value))
  );
}
