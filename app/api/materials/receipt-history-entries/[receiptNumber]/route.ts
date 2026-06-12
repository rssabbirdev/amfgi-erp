import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  parseReceiptAdjustmentMetadata,
  parseReceiptCancellationMetadata,
  stripReceiptCancellationMarkers,
} from '@/lib/utils/receiptCancellation';
import {
  parseReceiptHeaderMetadata,
  resolveReceiptBillAmount,
} from '@/lib/utils/receiptHeaderMetadata';
import { parseReceiptLineMetadata } from '@/lib/utils/receiptLineMetadata';
import { reverseReceiptPriceLogUpdates } from '@/lib/utils/receiptPriceLogs';
import {
  deleteWarehouseTransferReceipt,
  isWarehouseTransferReceiptNumber,
} from '@/lib/stock/deleteWarehouseTransferReceipt';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';

const RECEIPT_DELETE_TOLERANCE = 0.0005;

export async function GET(
  _: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    const batches = await prisma.stockBatch.findMany({
      where: {
        companyId,
        receiptNumber,
      },
      include: {
        material: { select: { id: true, name: true, unit: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    if (batches.length === 0) {
      return errorResponse('Receipt not found', 404);
    }

    // Get first batch for receipt metadata
    const firstBatch = batches[0];
    const cancellationMetadata = parseReceiptCancellationMetadata(firstBatch?.notes);
    const adjustmentMetadata = parseReceiptAdjustmentMetadata(firstBatch?.notes);
    const headerMetadata = parseReceiptHeaderMetadata(firstBatch?.meta);

    const grouped = new Map<string, {
      materialId: string;
      materialName: string;
      unit: string;
      warehouseId: string | null;
      warehouseName: string | null;
      quantityReceived: number;
      quantityAvailable: number;
      unitCost: number;
      totalCost: number;
      batchNumber: string;
      quantityUomId?: string;
      displayQuantity?: number;
      displayUnitCost?: number;
    }>();
    for (const batch of batches) {
      const materialId = batch.materialId;
      const warehouseId = batch.warehouse?.id ?? null;
      const unitCost = decimalToNumberOrZero(batch.unitCost);
      const lineMeta = parseReceiptLineMetadata(batch.meta);
      const key = `${materialId}::${warehouseId ?? 'none'}::${unitCost}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.quantityReceived += decimalToNumberOrZero(batch.quantityReceived);
        existing.quantityAvailable += decimalToNumberOrZero(batch.quantityAvailable);
        existing.totalCost += decimalToNumberOrZero(batch.totalCost);
      } else {
        grouped.set(key, {
          materialId,
          materialName: batch.material?.name ?? 'Unknown',
          unit: batch.material?.unit ?? '—',
          warehouseId,
          warehouseName: batch.warehouse?.name ?? null,
          quantityReceived: decimalToNumberOrZero(batch.quantityReceived),
          quantityAvailable: decimalToNumberOrZero(batch.quantityAvailable),
          unitCost,
          totalCost: decimalToNumberOrZero(batch.totalCost),
          batchNumber: batch.batchNumber,
          ...(lineMeta.quantityUomId ? { quantityUomId: lineMeta.quantityUomId } : {}),
          ...(lineMeta.displayQuantity != null ? { displayQuantity: lineMeta.displayQuantity } : {}),
          ...(lineMeta.displayUnitCost != null ? { displayUnitCost: lineMeta.displayUnitCost } : {}),
        });
      }
    }
    const materials = Array.from(grouped.values());

    const totalValue = batches.reduce((sum, b) => sum + decimalToNumberOrZero(b.totalCost), 0);
    const billAmount = resolveReceiptBillAmount(headerMetadata, totalValue);

    return successResponse({
      _id: receiptNumber,
      receiptNumber,
      receivedDate: firstBatch.receivedDate,
      supplier: firstBatch.supplier || undefined,
      lpoNumber: headerMetadata.lpoNumber || undefined,
      supplierInvoiceNumber: headerMetadata.supplierInvoiceNumber || undefined,
      notes: stripReceiptCancellationMarkers(firstBatch.notes) || undefined,
      billAmount,
      includeTax: headerMetadata.includeTax ?? undefined,
      taxAmount: headerMetadata.taxAmount ?? undefined,
      status: cancellationMetadata.isCancelled ? 'cancelled' : 'active',
      cancelledAt: cancellationMetadata.cancelledAt,
      cancellationReason: cancellationMetadata.cancellationReason,
      adjustedAt: adjustmentMetadata.adjustedAt,
      adjustmentReason: adjustmentMetadata.adjustmentReason,
      itemsCount: batches.length,
      totalValue,
      materials,
    });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch receipt', 500);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    // Find all batches for this receipt
    const batches = await prisma.stockBatch.findMany({
      where: {
        companyId,
        receiptNumber,
      },
    });

    if (batches.length === 0) {
      return errorResponse('Receipt not found', 404);
    }

    if (batches.some((batch) => parseReceiptCancellationMetadata(batch.notes).isCancelled)) {
      return errorResponse('Receipt has already been cancelled and can no longer be deleted', 409);
    }

    const consumedBatches = batches.filter((batch) => {
      const quantityReceived = decimalToNumberOrZero(batch.quantityReceived);
      const quantityAvailable = decimalToNumberOrZero(batch.quantityAvailable);
      return quantityAvailable < quantityReceived - RECEIPT_DELETE_TOLERANCE;
    });

    if (consumedBatches.length > 0) {
      const blockedBatch = consumedBatches[0];
      const consumedQuantity = decimalToNumberOrZero(blockedBatch.quantityReceived) -
        decimalToNumberOrZero(blockedBatch.quantityAvailable);
      const material = await prisma.material.findUnique({
        where: { id: blockedBatch.materialId },
        select: { name: true },
      });

      return errorResponse(
        `Receipt cannot be deleted because ${material?.name ?? 'one or more materials'} has already been consumed (${consumedQuantity.toFixed(3)} used from batch ${blockedBatch.batchNumber || receiptNumber}). Post an adjustment or cancellation instead.`,
        409
      );
    }

    if (isWarehouseTransferReceiptNumber(receiptNumber)) {
      await prisma.$transaction(async (tx) => {
        await deleteWarehouseTransferReceipt(tx, {
          companyId,
          receiptNumber,
          batchIds: batches.map((batch) => batch.id),
          sessionUser: session.user,
        });
      });
      publishLiveUpdate({
        companyId,
        channel: 'stock',
        entity: 'receipt',
        action: 'deleted',
      });
      return successResponse({ deleted: true });
    }

    const materialIds = Array.from(new Set(batches.map((b) => b.materialId)));
    const batchIds = batches.map((batch) => batch.id);

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      const receiptMarker = `[RECEIPT:${receiptNumber}]`;
      const taggedDelete = await tx.transaction.deleteMany({
        where: {
          companyId,
          type: 'STOCK_IN',
          notes: { contains: receiptMarker },
        },
      });

      // Backward compatibility for older rows that don't have receipt markers.
      if (taggedDelete.count === 0) {
        const receivedDate = batches[0].receivedDate;
        const dayStart = new Date(receivedDate.getFullYear(), receivedDate.getMonth(), receivedDate.getDate(), 0, 0, 0);
        const dayEnd = new Date(receivedDate.getFullYear(), receivedDate.getMonth(), receivedDate.getDate(), 23, 59, 59);
        await tx.transaction.deleteMany({
          where: {
            companyId,
            type: 'STOCK_IN',
            materialId: { in: materialIds },
            date: { gte: dayStart, lte: dayEnd },
          },
        });
      }

      await tx.transactionBatch.deleteMany({
        where: { batchId: { in: batchIds } },
      });

      // Reverse stock for each batch
      for (const batch of batches) {
        const receivedQty = decimalToNumberOrZero(batch.quantityReceived);
        await tx.material.update({
          where: { id: batch.materialId },
          data: {
            currentStock: {
              decrement: receivedQty,
            },
          },
        });
        if (batch.warehouseId) {
          await applyMaterialWarehouseDelta(
            tx,
            companyId,
            batch.materialId,
            batch.warehouseId,
            -receivedQty
          );
        }
      }

      await tx.stockBatch.deleteMany({
        where: {
          companyId,
          receiptNumber: receiptNumber!,
        },
      });

      await reverseReceiptPriceLogUpdates(tx, {
        companyId,
        receiptNumber: receiptNumber!,
        changedBy: session.user.name || session.user.email || session.user.id,
      });
    });

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'receipt',
      action: 'deleted',
    });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to delete receipt', 400);
  }
}
