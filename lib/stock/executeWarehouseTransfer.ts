import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { buildTransactionActorFields, type AuditActorUser } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { resolveQuantityToBase } from '@/lib/utils/materialUomDb';
import { createBatchData } from '@/lib/utils/stockBatchManagement';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import {
  WAREHOUSE_TRANSFER_REFERENCE_TYPE,
  warehouseTransferReceiptNumber,
} from '@/lib/stock/warehouseTransferConstants';

type Tx = Parameters<Parameters<typeof import('@/lib/db/prisma').prisma.$transaction>[0]>[0];

export interface WarehouseTransferLineInput {
  materialId: string;
  quantity: number;
  quantityUomId?: string;
}

export interface WarehouseTransferLinkOptions {
  deliveryNoteId?: string;
  deliveryNoteLineId?: string;
  referenceType?: string;
  isDeliveryNote?: boolean;
}

export interface WarehouseTransferBatchInput {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  lines: WarehouseTransferLineInput[];
  notes?: string;
  date?: Date;
  transferGroupId?: string;
  link?: WarehouseTransferLinkOptions;
  /** Per-line link overrides (same order as `lines`). */
  lineLinks?: WarehouseTransferLinkOptions[];
}

export interface WarehouseTransferLineResult {
  materialId: string;
  materialName: string;
  transferredQty: number;
  transferOutId: string;
  transferInId: string;
}

export interface WarehouseTransferBatchResult {
  transferGroupId: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  lines: WarehouseTransferLineResult[];
}

export async function executeWarehouseTransferBatch(
  tx: Tx,
  companyId: string,
  sessionUser: AuditActorUser,
  input: WarehouseTransferBatchInput,
): Promise<WarehouseTransferBatchResult> {
  const { sourceWarehouseId, destinationWarehouseId, lines, notes, date } = input;
  const transferGroupId = input.transferGroupId ?? crypto.randomUUID();
  const txDate = date ?? new Date();
  const actorFields = buildTransactionActorFields(sessionUser);

  const firstMaterial = await tx.material.findUnique({ where: { id: lines[0]!.materialId } });
  if (!firstMaterial) throw new Error('Material not found');

  const sourceWarehouse = await resolveEffectiveWarehouse(tx, {
    companyId,
    materialId: firstMaterial.id,
    warehouseId: sourceWarehouseId,
  });
  const destinationWarehouse = await resolveEffectiveWarehouse(tx, {
    companyId,
    materialId: firstMaterial.id,
    warehouseId: destinationWarehouseId,
  });

  const lineResults: WarehouseTransferLineResult[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const lineLink = input.lineLinks?.[lineIndex] ?? input.link;
    const material = await tx.material.findUnique({ where: { id: line.materialId } });
    if (!material) throw new Error('Material not found');
    if (material.companyId !== companyId) throw new Error('Material does not belong to active company');

    const qtyBase = await resolveQuantityToBase(tx, line.materialId, line.quantity, line.quantityUomId);

    const sourceRow = await tx.materialWarehouseStock.findUnique({
      where: {
        companyId_materialId_warehouseId: {
          companyId,
          materialId: line.materialId,
          warehouseId: sourceWarehouse.warehouseId,
        },
      },
    });
    const availableAtSource = sourceRow ? decimalToNumberOrZero(sourceRow.currentStock) : 0;
    if (!material.allowNegativeConsumption && availableAtSource < qtyBase) {
      throw new Error(
        `Insufficient stock at ${sourceWarehouse.warehouseName} for ${material.name}. Available: ${availableAtSource} ${material.unit}`,
      );
    }

    const sourceBatches = await tx.stockBatch.findMany({
      where: {
        companyId,
        materialId: line.materialId,
        warehouseId: sourceWarehouse.warehouseId,
        quantityAvailable: { gt: 0 },
      },
      orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
    });

    const availableFromBatches = sourceBatches.reduce(
      (sum, batch) => sum + decimalToNumberOrZero(batch.quantityAvailable),
      0,
    );
    const quantityFromBatches = material.allowNegativeConsumption
      ? Math.min(qtyBase, availableFromBatches)
      : qtyBase;
    const shortfallQuantity = Math.max(0, qtyBase - quantityFromBatches);
    const fallbackUnitCost = decimalToNumberOrZero(material.unitCost);

    const fifoResult =
      quantityFromBatches > 0
        ? calculateFIFOConsumption(
            sourceBatches.map((batch) => ({
              id: batch.id,
              batchNumber: batch.batchNumber,
              quantityAvailable: decimalToNumberOrZero(batch.quantityAvailable),
              unitCost: decimalToNumberOrZero(batch.unitCost),
              receivedDate: batch.receivedDate,
            })),
            quantityFromBatches,
          )
        : { totalCost: 0, averageCost: 0, batchesUsed: [] };

    if (!material.allowNegativeConsumption && fifoResult.batchesUsed.length === 0) {
      throw new Error(
        `Cannot fulfill ${qtyBase} ${material.unit} of ${material.name} from ${sourceWarehouse.warehouseName}`,
      );
    }

    const totalCost = fifoResult.totalCost + shortfallQuantity * fallbackUnitCost;
    const averageCost = qtyBase > 0 ? totalCost / qtyBase : 0;

    const referenceType = lineLink?.referenceType ?? WAREHOUSE_TRANSFER_REFERENCE_TYPE;
    const transferMeta = {
      kind: referenceType === WAREHOUSE_TRANSFER_REFERENCE_TYPE ? 'warehouse_transfer' : referenceType,
      transferGroupId,
      sourceWarehouseId: sourceWarehouse.warehouseId,
      sourceWarehouseName: sourceWarehouse.warehouseName,
      destinationWarehouseId: destinationWarehouse.warehouseId,
      destinationWarehouseName: destinationWarehouse.warehouseName,
      ...(lineLink?.deliveryNoteLineId ? { deliveryNoteLineId: lineLink.deliveryNoteLineId } : {}),
    };

    const transferOutTxn = await tx.transaction.create({
      data: {
        companyId,
        type: 'TRANSFER_OUT',
        materialId: line.materialId,
        warehouseId: sourceWarehouse.warehouseId,
        quantity: qtyBase,
        counterpartCompany: destinationWarehouse.warehouseName,
        notes: notes || null,
        date: txDate,
        referenceType,
        referenceId: lineLink?.deliveryNoteLineId ?? null,
        deliveryNoteId: lineLink?.deliveryNoteId ?? null,
        isDeliveryNote: lineLink?.isDeliveryNote ?? false,
        ...actorFields,
        totalCost,
        averageCost,
        meta: transferMeta,
      },
    });

    for (const batchUsed of fifoResult.batchesUsed) {
      const batchUpdateResult = await tx.stockBatch.updateMany({
        where: {
          id: String(batchUsed.batchId),
          quantityAvailable: { gte: batchUsed.quantityFromBatch },
        },
        data: {
          quantityAvailable: { decrement: batchUsed.quantityFromBatch },
        },
      });
      if (batchUpdateResult.count === 0) {
        throw new Error(`Stock changed while transferring ${material.name}. Please refresh and retry.`);
      }

      await tx.transactionBatch.create({
        data: {
          transactionId: transferOutTxn.id,
          batchId: String(batchUsed.batchId),
          batchNumber: batchUsed.batchNumber,
          quantityFromBatch: batchUsed.quantityFromBatch,
          unitCost: batchUsed.unitCost,
          costAmount: batchUsed.costAmount,
        },
      });
    }

    await applyMaterialWarehouseDelta(tx, companyId, line.materialId, sourceWarehouse.warehouseId, -qtyBase);

    const transferInTxn = await tx.transaction.create({
      data: {
        companyId,
        type: 'TRANSFER_IN',
        materialId: line.materialId,
        warehouseId: destinationWarehouse.warehouseId,
        quantity: qtyBase,
        counterpartCompany: sourceWarehouse.warehouseName,
        notes: notes || null,
        date: txDate,
        parentTransactionId: transferOutTxn.id,
        referenceType,
        referenceId: lineLink?.deliveryNoteLineId ?? null,
        deliveryNoteId: lineLink?.deliveryNoteId ?? null,
        isDeliveryNote: lineLink?.isDeliveryNote ?? false,
        ...actorFields,
        totalCost,
        averageCost,
        meta: transferMeta,
      },
    });

    const transferReceiptNumber = warehouseTransferReceiptNumber(referenceType, transferOutTxn.id);

    for (const batchUsed of fifoResult.batchesUsed) {
      const inboundBatch = await tx.stockBatch.create({
        data: {
          companyId,
          warehouseId: destinationWarehouse.warehouseId,
          ...createBatchData({
            materialId: line.materialId,
            quantity: batchUsed.quantityFromBatch,
            unitCost: batchUsed.unitCost,
            receivedDate: txDate,
            receiptNumber: transferReceiptNumber,
            notes: notes
              ? `Warehouse transfer from ${sourceWarehouse.warehouseName}: ${notes}`
              : `Warehouse transfer from ${sourceWarehouse.warehouseName}`,
            meta: transferMeta,
          }),
        },
      });

      await tx.transactionBatch.create({
        data: {
          transactionId: transferInTxn.id,
          batchId: inboundBatch.id,
          batchNumber: inboundBatch.batchNumber,
          quantityFromBatch: batchUsed.quantityFromBatch,
          unitCost: batchUsed.unitCost,
          costAmount: batchUsed.costAmount,
        },
      });
    }

    await applyMaterialWarehouseDelta(tx, companyId, line.materialId, destinationWarehouse.warehouseId, qtyBase);

    lineResults.push({
      materialId: line.materialId,
      materialName: material.name,
      transferredQty: qtyBase,
      transferOutId: transferOutTxn.id,
      transferInId: transferInTxn.id,
    });
  }

  return {
    transferGroupId,
    sourceWarehouse: sourceWarehouse.warehouseName,
    destinationWarehouse: destinationWarehouse.warehouseName,
    lines: lineResults,
  };
}
