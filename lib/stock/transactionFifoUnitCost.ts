import { decimalToNumberOrZero } from '@/lib/utils/decimal';

type TransactionCostSource = {
  averageCost?: unknown;
  totalCost?: unknown;
  quantity?: unknown;
  material?: { unitCost?: unknown } | null;
};

/** FIFO unit cost captured on the transaction at issue time (falls back to material master). */
export function resolveTransactionFifoUnitCost(txn: TransactionCostSource): number {
  const averageCost = decimalToNumberOrZero(txn.averageCost);
  if (averageCost > 0) return averageCost;

  const grossQty = decimalToNumberOrZero(txn.quantity);
  const totalCost = decimalToNumberOrZero(txn.totalCost);
  if (grossQty > 0 && totalCost > 0) return totalCost / grossQty;

  return decimalToNumberOrZero(txn.material?.unitCost);
}

/** Line valuation for net quantity after returns, using transaction FIFO cost. */
export function resolveTransactionNetLineCost(
  txn: TransactionCostSource,
  netQuantity: number
): number {
  if (netQuantity <= 0) return 0;
  const grossQty = decimalToNumberOrZero(txn.quantity);
  const totalCost = decimalToNumberOrZero(txn.totalCost);
  if (grossQty > 0 && totalCost > 0) {
    return (totalCost * netQuantity) / grossQty;
  }
  return netQuantity * resolveTransactionFifoUnitCost(txn);
}
