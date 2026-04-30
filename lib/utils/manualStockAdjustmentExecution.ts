import type { Prisma } from '@prisma/client';
import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  consumeTransactionBatchQuantities,
  createTransactionBatchRecords,
  type TransactionBatchLinkInput,
} from '@/lib/utils/transactionBatchLinks';
import { buildManualStockAdjustmentNote } from '@/lib/utils/manualStockAdjustment';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';

type Tx = Prisma.TransactionClient;

export type ManualStockAdjustmentLinePayload = {
  materialId: string;
  warehouseId: string;
  quantityDelta: number;
  unitCost?: number | null;
};

export async function applyManualStockAdjustmentApproval(args: {
  tx: Tx;
  companyId: string;
  approvalId: string;
  reason: string;
  payload: ManualStockAdjustmentLinePayload;
  requestNotes?: string | null;
  actor: {
    performedBy: string;
    performedByUserId?: string | null;
    performedByName?: string | null;
  };
  appliedAt: Date;
}) {
  const { tx, companyId, approvalId, reason, payload, requestNotes, actor, appliedAt } = args;
  const quantityDelta = Number(payload.quantityDelta);

  if (!Number.isFinite(quantityDelta) || Math.abs(quantityDelta) < 0.0005) {
    throw new Error('Manual adjustment quantity must be non-zero');
  }

  const material = await tx.material.findUnique({
    where: { id: payload.materialId },
    select: {
      id: true,
      name: true,
      unit: true,
      unitCost: true,
    },
  });

  if (!material) throw new Error('Material not found for manual adjustment');

  const effectiveWarehouse = await resolveEffectiveWarehouse(tx, {
    companyId,
    materialId: payload.materialId,
    warehouseId: payload.warehouseId,
  });

  const notes = buildManualStockAdjustmentNote(approvalId, reason, requestNotes ?? null);

  if (quantityDelta > 0) {
    const unitCost = payload.unitCost ?? decimalToNumberOrZero(material.unitCost);
    const batch = await tx.stockBatch.create({
      data: {
        companyId,
        materialId: payload.materialId,
        warehouseId: effectiveWarehouse.warehouseId,
        batchNumber: `ADJ-${approvalId.slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: quantityDelta,
        quantityAvailable: quantityDelta,
        unitCost,
        totalCost: quantityDelta * unitCost,
        supplier: 'Manual Adjustment',
        receivedDate: appliedAt,
        notes,
      },
    });

    await tx.material.update({
      where: { id: payload.materialId },
      data: {
        currentStock: {
          increment: quantityDelta,
        },
      },
    });

    await applyMaterialWarehouseDelta(
      tx,
      companyId,
      payload.materialId,
      effectiveWarehouse.warehouseId,
      quantityDelta
    );

    return tx.transaction.create({
      data: {
        companyId,
        type: 'ADJUSTMENT',
        materialId: payload.materialId,
        warehouseId: effectiveWarehouse.warehouseId,
        quantity: quantityDelta,
        notes,
        date: appliedAt,
        totalCost: quantityDelta * unitCost,
        averageCost: unitCost,
        ...actor,
      },
      include: {
        material: {
          select: { name: true, unit: true },
        },
        warehouse: {
          select: { id: true, name: true },
        },
      },
    });
  }

  const adjustmentQty = Math.abs(quantityDelta);
  const warehouseStockRow = await tx.materialWarehouseStock.findUnique({
    where: {
      companyId_materialId_warehouseId: {
        companyId,
        materialId: payload.materialId,
        warehouseId: effectiveWarehouse.warehouseId,
      },
    },
    select: {
      currentStock: true,
    },
  });
  const currentWarehouseStock = decimalToNumberOrZero(warehouseStockRow?.currentStock);
  if (currentWarehouseStock + 0.0005 < adjustmentQty) {
    throw new Error(
      `Manual adjustment exceeds available stock in ${effectiveWarehouse.warehouseName}. Available: ${currentWarehouseStock.toFixed(3)}`
    );
  }

  let batches = await tx.stockBatch.findMany({
    where: {
      companyId,
      materialId: payload.materialId,
      warehouseId: effectiveWarehouse.warehouseId,
      quantityAvailable: {
        gt: 0,
      },
    },
    orderBy: {
      receivedDate: 'asc',
    },
  });

  if (batches.length === 0 && currentWarehouseStock > 0) {
    const unitCost = decimalToNumberOrZero(material.unitCost);
    const openingBatch = await tx.stockBatch.create({
      data: {
        companyId,
        materialId: payload.materialId,
        warehouseId: effectiveWarehouse.warehouseId,
        batchNumber: `OPENING-${payload.materialId}-${Date.now()}`,
        quantityReceived: currentWarehouseStock,
        quantityAvailable: currentWarehouseStock,
        unitCost,
        totalCost: currentWarehouseStock * unitCost,
        receivedDate: new Date('2020-01-01'),
        supplier: 'Opening Balance',
        notes: 'Auto-created opening balance for manual stock adjustment.',
      },
    });
    batches = [openingBatch];
  }

  const fifoResult = calculateFIFOConsumption(
    batches.map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      quantityAvailable: decimalToNumberOrZero(batch.quantityAvailable),
      unitCost: decimalToNumberOrZero(batch.unitCost),
      receivedDate: batch.receivedDate,
    })),
    adjustmentQty
  );

  if (fifoResult.batchesUsed.length === 0) {
    throw new Error(`No open FIFO stock is available for ${material.name}`);
  }

  const batchLinkData: TransactionBatchLinkInput[] = fifoResult.batchesUsed.map((batchUsed) => ({
    batchId: batchUsed.batchId.toString(),
    batchNumber: batchUsed.batchNumber,
    quantityFromBatch: batchUsed.quantityFromBatch,
    unitCost: batchUsed.unitCost,
    costAmount: batchUsed.costAmount,
  }));

  await consumeTransactionBatchQuantities(
    tx,
    batchLinkData,
    `Stock changed while adjusting ${material.name}. Please refresh and submit again.`
  );

  await tx.material.update({
    where: { id: payload.materialId },
    data: {
      currentStock: {
        decrement: adjustmentQty,
      },
    },
  });

  await applyMaterialWarehouseDelta(
    tx,
    companyId,
    payload.materialId,
    effectiveWarehouse.warehouseId,
    -adjustmentQty
  );

  const adjustmentTxn = await tx.transaction.create({
    data: {
      companyId,
      type: 'ADJUSTMENT',
      materialId: payload.materialId,
      warehouseId: effectiveWarehouse.warehouseId,
      quantity: quantityDelta,
      notes,
      date: appliedAt,
      totalCost: -fifoResult.totalCost,
      averageCost: adjustmentQty > 0 ? fifoResult.totalCost / adjustmentQty : 0,
      ...actor,
    },
    include: {
      material: {
        select: { name: true, unit: true },
      },
      warehouse: {
        select: { id: true, name: true },
      },
    },
  });

  await createTransactionBatchRecords(tx, adjustmentTxn.id, batchLinkData);

  return adjustmentTxn;
}
