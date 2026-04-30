import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  buildReceiptAdjustmentNotes,
  buildReceiptAdjustmentTransactionNote,
  parseReceiptAdjustmentMetadata,
  parseReceiptCancellationMetadata,
} from '@/lib/utils/receiptCancellation';
import { upsertStockExceptionApproval } from '@/lib/utils/stockExceptionApproval';
import { createTransactionBatchRecords } from '@/lib/utils/transactionBatchLinks';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import { z } from 'zod';

const RECEIPT_ADJUST_TOLERANCE = 0.0005;

const AdjustReceiptSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin) {
    return errorResponse('Only super admins can approve receipt adjustments', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = AdjustReceiptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;
  const reason = parsed.data.reason;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    const actorFields = buildTransactionActorFields(session.user);
    const adjustedAt = new Date();
    const adjustedAtIso = adjustedAt.toISOString();
    const actorName = session.user.name || session.user.email || session.user.id || null;

    const result = await prisma.$transaction(async (tx) => {
      const batches = await tx.stockBatch.findMany({
        where: {
          companyId,
          receiptNumber,
        },
      });

      if (batches.length === 0) {
        throw new Error('Receipt not found');
      }

      if (batches.some((batch) => parseReceiptCancellationMetadata(batch.notes).isCancelled)) {
        throw new Error('Cancelled receipts cannot be adjusted');
      }

      if (batches.some((batch) => parseReceiptAdjustmentMetadata(batch.notes).isAdjusted)) {
        throw new Error('Receipt adjustment has already been posted');
      }

      const totalAvailable = batches.reduce(
        (sum, batch) => sum + decimalToNumberOrZero(batch.quantityAvailable),
        0
      );
      const totalConsumed = batches.reduce(
        (sum, batch) =>
          sum +
          Math.max(
            0,
            decimalToNumberOrZero(batch.quantityReceived) -
              decimalToNumberOrZero(batch.quantityAvailable)
          ),
        0
      );

      if (totalConsumed <= RECEIPT_ADJUST_TOLERANCE) {
        throw new Error('Use receipt cancellation instead because no downstream consumption exists');
      }

      if (totalAvailable <= RECEIPT_ADJUST_TOLERANCE) {
        throw new Error('No remaining stock is available to adjust on this receipt');
      }

      for (const batch of batches) {
        const reversalQuantity = decimalToNumberOrZero(batch.quantityAvailable);
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: {
            notes: buildReceiptAdjustmentNotes(batch.notes, adjustedAtIso, reason),
          },
        });

        if (reversalQuantity <= RECEIPT_ADJUST_TOLERANCE) {
          continue;
        }

        await tx.material.update({
          where: { id: batch.materialId },
          data: {
            currentStock: {
              decrement: reversalQuantity,
            },
          },
        });

        const effectiveWarehouse = await resolveEffectiveWarehouse(tx, {
          companyId,
          materialId: batch.materialId,
          warehouseId: batch.warehouseId,
        });

        await applyMaterialWarehouseDelta(
          tx,
          companyId,
          batch.materialId,
          effectiveWarehouse.warehouseId,
          -reversalQuantity
        );

        await tx.stockBatch.update({
          where: { id: batch.id },
          data: {
            quantityAvailable: 0,
          },
        });

        const unitCost = decimalToNumberOrZero(batch.unitCost);
        const reversal = await tx.transaction.create({
          data: {
            companyId,
            type: 'REVERSAL',
            materialId: batch.materialId,
            warehouseId: effectiveWarehouse.warehouseId,
            quantity: reversalQuantity,
            notes: buildReceiptAdjustmentTransactionNote(receiptNumber, batch.batchNumber, reason),
            date: adjustedAt,
            totalCost: unitCost * reversalQuantity,
            averageCost: unitCost,
            ...actorFields,
          },
        });

        await createTransactionBatchRecords(tx, reversal.id, [
          {
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            quantityFromBatch: reversalQuantity,
            unitCost,
            costAmount: unitCost * reversalQuantity,
          },
        ]);
      }

      await upsertStockExceptionApproval(tx, {
        companyId,
        exceptionType: 'RECEIPT_ADJUSTMENT',
        referenceId: receiptNumber,
        referenceNumber: receiptNumber,
        reason,
        createdById: session.user.id ?? null,
        createdByName: actorName,
        status: 'APPROVED',
        decidedById: session.user.id ?? null,
        decidedByName: actorName,
        decidedAt: adjustedAt,
        decisionNote: 'Auto-approved because receipt adjustment is restricted to super admins.',
      });

      return {
        adjusted: true,
        receiptNumber,
        adjustedAt: adjustedAtIso,
        reason,
        remainingAdjustedQty: totalAvailable,
      };
    });

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'receipt',
      action: 'changed',
    });

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to adjust receipt';
    const status =
      message === 'Receipt not found'
        ? 404
        : message === 'Only super admins can approve receipt adjustments'
          ? 403
          : 409;
    return errorResponse(message, status);
  }
}
