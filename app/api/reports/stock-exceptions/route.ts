import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import {
  parseReceiptAdjustmentMetadata,
  parseReceiptCancellationMetadata,
} from '@/lib/utils/receiptCancellation';

function parseOverrideReason(notes?: string | null) {
  const match = (notes ?? '').match(/\[OVERRIDE_REASON:([^\]]+)\]/);
  return match?.[1] ?? null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView = session.user.isSuperAdmin || session.user.permissions.includes('report.view');
  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const [overrideTransactions, receiptBatches, manualAdjustmentApprovals] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          companyId,
          type: 'STOCK_OUT',
          notes: { contains: '[OVERRIDE_REASON:' },
        },
        include: {
          material: {
            select: { id: true, name: true, unit: true },
          },
          warehouse: {
            select: { id: true, name: true },
          },
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
        orderBy: { date: 'desc' },
      }),
      prisma.stockBatch.findMany({
        where: {
          companyId,
          receiptNumber: { not: null },
          OR: [
            { notes: { contains: '[RECEIPT_CANCELLED_AT:' } },
            { notes: { contains: '[RECEIPT_ADJUSTED_AT:' } },
          ],
        },
        include: {
          material: {
            select: { id: true, name: true, unit: true },
          },
          warehouse: {
            select: { id: true, name: true },
          },
          transactionLinks: {
            include: {
              transaction: {
                select: {
                  id: true,
                  type: true,
                  date: true,
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
          },
        },
        orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.stockExceptionApproval.findMany({
        where: {
          companyId,
          exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
          status: 'APPROVED',
        },
        orderBy: { decidedAt: 'desc' },
      }),
    ]);

    const rows: Array<{
      id: string;
      category: 'dispatch_override' | 'receipt_adjustment' | 'receipt_cancellation' | 'manual_stock_adjustment';
      categoryLabel: string;
      severity: 'warning' | 'critical';
      occurredAt: string;
      referenceNumber: string;
      materialNames: string[];
      warehouseNames: string[];
      jobNumbers: string[];
      customerNames: string[];
      reason: string | null;
      details: string;
    }> = [];

    const linkedJobIds = new Set<string>();
    const linkedCustomerIds = new Set<string>();

    for (const txn of overrideTransactions) {
      if (txn.job?.id) linkedJobIds.add(txn.job.id);
      if (txn.job?.customer?.id) linkedCustomerIds.add(txn.job.customer.id);

      rows.push({
        id: `dispatch-override-${txn.id}`,
        category: 'dispatch_override',
        categoryLabel: 'Dispatch override',
        severity: 'warning',
        occurredAt: txn.date.toISOString(),
        referenceNumber: txn.id,
        materialNames: txn.material ? [txn.material.name] : [],
        warehouseNames: txn.warehouse?.name ? [txn.warehouse.name] : [],
        jobNumbers: txn.job?.jobNumber ? [txn.job.jobNumber] : [],
        customerNames: txn.job?.customer?.name ? [txn.job.customer.name] : [],
        reason: parseOverrideReason(txn.notes),
        details: 'Dispatch was saved with an override reason after an exception condition.',
      });
    }

    for (const approval of manualAdjustmentApprovals) {
      const payload = (approval.payload ?? null) as
        | {
            lines?: Array<{
              materialId?: string;
              warehouseId?: string;
              quantityDelta?: number;
            }>;
            evidenceType?: string | null;
            evidenceReference?: string | null;
          }
        | null;
      const lines = payload?.lines ?? [];
      const materialIds = lines
        .map((line) => (typeof line.materialId === 'string' ? line.materialId : null))
        .filter((value): value is string => Boolean(value));
      const warehouseIds = lines
        .map((line) => (typeof line.warehouseId === 'string' ? line.warehouseId : null))
        .filter((value): value is string => Boolean(value));
      const [materials, warehouses] = await Promise.all([
        materialIds.length > 0
          ? prisma.material.findMany({
              where: {
                companyId,
                id: { in: Array.from(new Set(materialIds)) },
              },
              select: { name: true },
            })
          : Promise.resolve([] as Array<{ name: string }>),
        warehouseIds.length > 0
          ? prisma.warehouse.findMany({
              where: {
                companyId,
                id: { in: Array.from(new Set(warehouseIds)) },
              },
              select: { name: true },
            })
          : Promise.resolve([] as Array<{ name: string }>),
      ]);
      const netDelta = lines.reduce((sum, line) => sum + Number(line.quantityDelta ?? 0), 0);

      rows.push({
        id: `manual-stock-adjustment-${approval.id}`,
        category: 'manual_stock_adjustment',
        categoryLabel: 'Manual stock adjustment',
        severity: 'warning',
        occurredAt: (approval.decidedAt ?? approval.createdAt).toISOString(),
        referenceNumber: approval.referenceNumber ?? approval.referenceId,
        materialNames: materials.map((material) => material.name),
        warehouseNames: warehouses.map((warehouse) => warehouse.name),
        jobNumbers: [],
        customerNames: [],
        reason: approval.reason,
        details: `${lines.length} lines approved with a net stock delta of ${netDelta.toFixed(3)}.${payload?.evidenceType ? ` Evidence: ${payload.evidenceType}${payload.evidenceReference ? ` ${payload.evidenceReference}` : ''}.` : ''}`,
      });
    }

    const groupedReceiptBatches = new Map<string, typeof receiptBatches>();
    for (const batch of receiptBatches) {
      const key = batch.receiptNumber!;
      if (!groupedReceiptBatches.has(key)) {
        groupedReceiptBatches.set(key, []);
      }
      groupedReceiptBatches.get(key)!.push(batch);
    }

    for (const [receiptNumber, batches] of groupedReceiptBatches.entries()) {
      const firstBatch = batches[0];
      const cancellationMetadata = parseReceiptCancellationMetadata(firstBatch?.notes);
      const adjustmentMetadata = parseReceiptAdjustmentMetadata(firstBatch?.notes);

      const materialNames = uniqueStrings(batches.map((batch) => batch.material?.name));
      const warehouseNames = uniqueStrings(batches.map((batch) => batch.warehouse?.name));
      const jobNumbers = uniqueStrings(
        batches.flatMap((batch) =>
          batch.transactionLinks.map((link) => link.transaction.job?.jobNumber)
        )
      );
      const customerNames = uniqueStrings(
        batches.flatMap((batch) =>
          batch.transactionLinks.map((link) => link.transaction.job?.customer?.name)
        )
      );

      batches.forEach((batch) => {
        batch.transactionLinks.forEach((link) => {
          if (link.transaction.job?.id) linkedJobIds.add(link.transaction.job.id);
          if (link.transaction.job?.customer?.id) linkedCustomerIds.add(link.transaction.job.customer.id);
        });
      });

      if (cancellationMetadata.isCancelled && cancellationMetadata.cancelledAt) {
        rows.push({
          id: `receipt-cancellation-${receiptNumber}`,
          category: 'receipt_cancellation',
          categoryLabel: 'Receipt cancellation',
          severity: 'critical',
          occurredAt: cancellationMetadata.cancelledAt,
          referenceNumber: receiptNumber,
          materialNames,
          warehouseNames,
          jobNumbers,
          customerNames,
          reason: cancellationMetadata.cancellationReason,
          details: 'Receipt was cancelled and its remaining stock was reversed.',
        });
      }

      if (adjustmentMetadata.isAdjusted && adjustmentMetadata.adjustedAt) {
        rows.push({
          id: `receipt-adjustment-${receiptNumber}`,
          category: 'receipt_adjustment',
          categoryLabel: 'Receipt adjustment',
          severity: 'warning',
          occurredAt: adjustmentMetadata.adjustedAt,
          referenceNumber: receiptNumber,
          materialNames,
          warehouseNames,
          jobNumbers,
          customerNames,
          reason: adjustmentMetadata.adjustmentReason,
          details: 'Remaining on-hand stock from a consumed receipt was reversed by approved adjustment.',
        });
      }
    }

    rows.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return successResponse({
      summary: {
        totalEvents: rows.length,
        dispatchOverrideCount: rows.filter((row) => row.category === 'dispatch_override').length,
        receiptAdjustmentCount: rows.filter((row) => row.category === 'receipt_adjustment').length,
        receiptCancellationCount: rows.filter((row) => row.category === 'receipt_cancellation').length,
        manualStockAdjustmentCount: rows.filter((row) => row.category === 'manual_stock_adjustment').length,
        linkedJobsCount: linkedJobIds.size,
        linkedCustomersCount: linkedCustomerIds.size,
      },
      rows,
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load stock exceptions report',
      500
    );
  }
}
