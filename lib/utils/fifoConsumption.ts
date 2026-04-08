import { Types } from 'mongoose';

interface StockBatch {
  _id: Types.ObjectId;
  batchNumber: string;
  quantityAvailable: number;
  unitCost: number;
  receivedDate: Date;
}

interface BatchConsumption {
  batchId: Types.ObjectId;
  batchNumber: string;
  quantityFromBatch: number;
  unitCost: number;
  costAmount: number;
}

/**
 * Calculate FIFO consumption for dispatching materials
 * Returns which batches should be consumed in FIFO order and total cost
 */
export function calculateFIFOConsumption(
  batches: StockBatch[],
  quantityNeeded: number
): {
  batchesUsed: BatchConsumption[];
  totalCost: number;
  averageCost: number;
} {
  if (!batches || batches.length === 0) {
    return {
      batchesUsed: [],
      totalCost: 0,
      averageCost: 0,
    };
  }

  // Sort by received date (oldest first) - FIFO
  const sortedBatches = [...batches].sort(
    (a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime()
  );

  const batchesUsed: BatchConsumption[] = [];
  let remainingQuantity = quantityNeeded;
  let totalCost = 0;

  for (const batch of sortedBatches) {
    if (remainingQuantity <= 0) break;

    // How much can we take from this batch?
    const quantityFromBatch = Math.min(remainingQuantity, batch.quantityAvailable);

    if (quantityFromBatch > 0) {
      const costAmount = quantityFromBatch * batch.unitCost;

      batchesUsed.push({
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        quantityFromBatch,
        unitCost: batch.unitCost,
        costAmount,
      });

      totalCost += costAmount;
      remainingQuantity -= quantityFromBatch;
    }
  }

  const averageCost = quantityNeeded > 0 ? totalCost / quantityNeeded : 0;

  return {
    batchesUsed,
    totalCost,
    averageCost,
  };
}

/**
 * Validate if we have enough stock to fulfill a dispatch request
 */
export function hasEnoughStock(batches: StockBatch[], quantityNeeded: number): boolean {
  const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantityAvailable, 0);
  return totalAvailable >= quantityNeeded;
}

/**
 * Generate unique batch number
 */
export function generateBatchNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BATCH-${yyyy}${mm}${dd}-${rand}`;
}
