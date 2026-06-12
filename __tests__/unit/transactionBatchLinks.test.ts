import { consumeTransactionBatchQuantitiesBestEffort } from '@/lib/utils/transactionBatchLinks';

describe('consumeTransactionBatchQuantitiesBestEffort', () => {
  it('consumes only remaining batch quantity when stock was partially cleared', async () => {
    const batches = new Map<string, number>([['batch-1', 25]]);

    const tx = {
      stockBatch: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
          quantityAvailable: batches.get(where.id) ?? 0,
        })),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; quantityAvailable: { gte: number } };
            data: { quantityAvailable: { decrement: number } };
          }) => {
            const current = batches.get(where.id) ?? 0;
            if (current < where.quantityAvailable.gte) return { count: 0 };
            batches.set(where.id, current - data.quantityAvailable.decrement);
            return { count: 1 };
          }
        ),
      },
    };

    const consumed = await consumeTransactionBatchQuantitiesBestEffort(tx as never, [
      {
        batchId: 'batch-1',
        batchNumber: 'B-1',
        quantityFromBatch: 100,
        unitCost: 10,
        costAmount: 1000,
      },
    ]);

    expect(consumed).toBe(25);
    expect(batches.get('batch-1')).toBe(0);
  });

  it('returns zero when inbound batch was already cancelled', async () => {
    const tx = {
      stockBatch: {
        findUnique: jest.fn(async () => ({ quantityAvailable: 0 })),
        updateMany: jest.fn(),
      },
    };

    const consumed = await consumeTransactionBatchQuantitiesBestEffort(tx as never, [
      {
        batchId: 'batch-1',
        batchNumber: 'B-1',
        quantityFromBatch: 50,
        unitCost: 4,
        costAmount: 200,
      },
    ]);

    expect(consumed).toBe(0);
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });
});
