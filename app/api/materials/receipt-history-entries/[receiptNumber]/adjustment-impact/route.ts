import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  parseReceiptAdjustmentMetadata,
  parseReceiptCancellationMetadata,
} from '@/lib/utils/receiptCancellation';

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
        material: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        transactionLinks: {
          include: {
            transaction: {
              select: {
                id: true,
                type: true,
                date: true,
                quantity: true,
                notes: true,
                job: {
                  select: {
                    id: true,
                    jobNumber: true,
                    customer: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            transaction: {
              date: 'desc',
            },
          },
        },
      },
      orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
    });

    if (batches.length === 0) {
      return errorResponse('Receipt not found', 404);
    }

    const firstBatch = batches[0];
    const receiptMetadata = parseReceiptCancellationMetadata(firstBatch?.notes);
    const adjustmentMetadata = parseReceiptAdjustmentMetadata(firstBatch?.notes);

    const linkedJobIds = new Set<string>();
    const linkedCustomerIds = new Set<string>();
    let totalReceived = 0;
    let totalAvailable = 0;
    let totalConsumed = 0;
    let totalAdjusted = 0;
    let linkedTransactionCount = 0;

    const rows = batches.map((batch) => {
      const quantityReceived = decimalToNumberOrZero(batch.quantityReceived);
      const quantityAvailable = decimalToNumberOrZero(batch.quantityAvailable);
      const quantityAdjusted = batch.transactionLinks.reduce((sum, link) => {
        const isReceiptAdjustmentReversal =
          link.transaction.type === 'REVERSAL' &&
          (link.transaction.notes ?? '').includes(`Receipt adjustment for ${receiptNumber}`);
        return isReceiptAdjustmentReversal
          ? sum + decimalToNumberOrZero(link.quantityFromBatch)
          : sum;
      }, 0);
      const quantityConsumed = Math.max(0, quantityReceived - quantityAvailable - quantityAdjusted);

      totalReceived += quantityReceived;
      totalAvailable += quantityAvailable;
      totalConsumed += quantityConsumed;
      totalAdjusted += quantityAdjusted;

      const linkedTransactions = batch.transactionLinks.map((link) => {
        linkedTransactionCount += 1;
        const jobId = link.transaction.job?.id ?? null;
        const customerId = link.transaction.job?.customer?.id ?? null;
        if (jobId) linkedJobIds.add(jobId);
        if (customerId) linkedCustomerIds.add(customerId);

        return {
          transactionId: link.transaction.id,
          type: link.transaction.type,
          date: link.transaction.date,
          quantity: decimalToNumberOrZero(link.transaction.quantity),
          quantityFromBatch: decimalToNumberOrZero(link.quantityFromBatch),
          notes: link.transaction.notes ?? null,
          jobId,
          jobNumber: link.transaction.job?.jobNumber ?? null,
          customerId,
          customerName: link.transaction.job?.customer?.name ?? null,
        };
      });

      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        materialId: batch.materialId,
        materialName: batch.material?.name ?? 'Unknown',
        unit: batch.material?.unit ?? '-',
        warehouseId: batch.warehouse?.id ?? null,
        warehouseName: batch.warehouse?.name ?? null,
        quantityReceived,
        quantityAvailable,
        quantityConsumed,
        quantityAdjusted,
        linkedTransactions,
      };
    });

    return successResponse({
      receiptNumber,
      status: receiptMetadata.isCancelled ? 'cancelled' : 'active',
      canCancel: !receiptMetadata.isCancelled && totalConsumed <= 0.0005,
      canAdjustRemaining:
        !receiptMetadata.isCancelled &&
        !adjustmentMetadata.isAdjusted &&
        totalConsumed > 0.0005 &&
        totalAvailable > 0.0005,
      needsAdjustmentReview: !receiptMetadata.isCancelled && totalConsumed > 0.0005,
      cancelledAt: receiptMetadata.cancelledAt,
      cancellationReason: receiptMetadata.cancellationReason,
      adjustedAt: adjustmentMetadata.adjustedAt,
      adjustmentReason: adjustmentMetadata.adjustmentReason,
      summary: {
        totalReceived,
        totalAvailable,
        totalConsumed,
        totalAdjusted,
        affectedBatches: rows.length,
        linkedTransactionCount,
        linkedJobsCount: linkedJobIds.size,
        linkedCustomersCount: linkedCustomerIds.size,
      },
      rows,
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load receipt adjustment impact',
      500
    );
  }
}
