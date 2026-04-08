/**
 * Stock Batch Management Utilities for FIFO tracking
 * Handles creation and management of material batches
 */

import { generateBatchNumber } from './fifoConsumption';

export interface CreateBatchInput {
  materialId: string;
  quantity: number;
  unitCost: number;
  supplier?: string;
  receiptNumber?: string;
  receivedDate: Date;
  expiryDate?: Date;
  notes?: string;
}

export interface UpdateBatchInput {
  quantityAvailable: number;
}

/**
 * Create batch data for new stock receipt
 */
export function createBatchData(input: CreateBatchInput) {
  const batchNumber = generateBatchNumber();
  const totalCost = input.quantity * input.unitCost;

  return {
    batchNumber,
    materialId: input.materialId,
    quantityReceived: input.quantity,
    quantityAvailable: input.quantity,
    unitCost: input.unitCost,
    totalCost,
    supplier: input.supplier,
    receiptNumber: input.receiptNumber,
    receivedDate: input.receivedDate,
    expiryDate: input.expiryDate,
    notes: input.notes,
  };
}

/**
 * Calculate weighted average cost for material
 * Used for reporting and valuation
 */
export function calculateWeightedAverageCost(
  batches: Array<{
    quantityAvailable: number;
    unitCost: number;
  }>
): number {
  if (!batches || batches.length === 0) return 0;

  const totalValue = batches.reduce((sum, b) => sum + b.quantityAvailable * b.unitCost, 0);
  const totalQuantity = batches.reduce((sum, b) => sum + b.quantityAvailable, 0);

  return totalQuantity > 0 ? totalValue / totalQuantity : 0;
}

/**
 * Format batch information for reports
 */
export function formatBatchForReport(batch: any) {
  return {
    batchNumber: batch.batchNumber,
    materialId: batch.materialId,
    quantityReceived: batch.quantityReceived,
    quantityAvailable: batch.quantityAvailable,
    unitCost: batch.unitCost,
    totalCost: batch.totalCost,
    receivedDate: batch.receivedDate,
    supplier: batch.supplier,
    receiptNumber: batch.receiptNumber,
  };
}
