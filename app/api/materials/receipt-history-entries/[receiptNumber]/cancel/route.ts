import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  buildReceiptCancellationNotes,
  buildReceiptCancellationTransactionNote,
  parseReceiptCancellationMetadata,
} from '@/lib/utils/receiptCancellation';
import { upsertStockExceptionApproval } from '@/lib/utils/stockExceptionApproval';
import { createTransactionBatchRecords } from '@/lib/utils/transactionBatchLinks';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import { z } from 'zod';

const RECEIPT_CANCEL_TOLERANCE = 0.0005;

const CancelReceiptSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = CancelReceiptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;
  const reason = parsed.data.reason?.trim() || undefined;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    const actorFields = buildTransactionActorFields(session.user);
    const cancelledAt = new Date();
    const cancelledAtIso = cancelledAt.toISOString();
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
        throw new Error('Receipt has already been cancelled');
      }

      const consumedBatch = batches.find((batch) => {
        const quantityReceived = decimalToNumberOrZero(batch.quantityReceived);
        const quantityAvailable = decimalToNumberOrZero(batch.quantityAvailable);
        return quantityAvailable < quantityReceived - RECEIPT_CANCEL_TOLERANCE;
      });

      if (consumedBatch) {
        throw new Error('Receipt cannot be cancelled because some quantity has already been consumed');
      }

      for (const batch of batches) {
        const reversalQuantity = decimalToNumberOrZero(batch.quantityAvailable);
        if (reversalQuantity <= 0) continue;

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
            notes: buildReceiptCancellationNotes(batch.notes, cancelledAtIso, reason),
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
            notes: buildReceiptCancellationTransactionNote(receiptNumber, batch.batchNumber, reason),
            date: cancelledAt,
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
        exceptionType: 'RECEIPT_CANCELLATION',
        referenceId: receiptNumber,
        referenceNumber: receiptNumber,
        reason: reason ?? 'Receipt cancelled',
        createdById: session.user.id ?? null,
        createdByName: actorName,
        status: 'APPROVED',
        decidedById: session.user.id ?? null,
        decidedByName: actorName,
        decidedAt: cancelledAt,
        decisionNote: 'Auto-approved under current receipt cancellation policy.',
      });

      return {
        cancelled: true,
        receiptNumber,
        cancelledAt: cancelledAtIso,
        reason: reason ?? null,
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
    const message = err instanceof Error ? err.message : 'Failed to cancel receipt';
    const status =
      message === 'Receipt not found'
        ? 404
        : message === 'Unauthorized'
          ? 403
          : 409;
    return errorResponse(message, status);
  }
}
