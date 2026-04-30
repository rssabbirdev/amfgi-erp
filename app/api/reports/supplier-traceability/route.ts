import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('report.view')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const batches = await prisma.stockBatch.findMany({
      where: { companyId },
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
        supplierRef: {
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
                isDeliveryNote: true,
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
              date: 'asc',
            },
          },
        },
      },
      orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
    });

    const rows = batches.map((batch) => {
      let issuedQuantity = 0;
      let issuedCost = 0;
      let returnedQuantity = 0;
      let returnedCost = 0;
      let firstIssueDate: Date | null = null;
      let lastIssueDate: Date | null = null;
      let firstReturnDate: Date | null = null;
      let lastActivityDate: Date | null = null;

      const jobMap = new Map<string, { id: string; jobNumber: string }>();
      const customerMap = new Map<string, { id: string; name: string }>();
      const dispatchIds = new Set<string>();
      const deliveryNoteIds = new Set<string>();

      for (const link of batch.transactionLinks) {
        const quantity = decimalToNumberOrZero(link.quantityFromBatch);
        const cost = decimalToNumberOrZero(link.costAmount);
        const txn = link.transaction;
        lastActivityDate = txn.date;

        if (txn.job?.id) {
          jobMap.set(txn.job.id, {
            id: txn.job.id,
            jobNumber: txn.job.jobNumber,
          });
        }
        if (txn.job?.customer?.id) {
          customerMap.set(txn.job.customer.id, {
            id: txn.job.customer.id,
            name: txn.job.customer.name,
          });
        }

        if (txn.type === 'STOCK_OUT') {
          issuedQuantity += quantity;
          issuedCost += cost;
          dispatchIds.add(txn.id);
          if (txn.isDeliveryNote) deliveryNoteIds.add(txn.id);
          if (!firstIssueDate) firstIssueDate = txn.date;
          lastIssueDate = txn.date;
        } else if (txn.type === 'RETURN') {
          returnedQuantity += quantity;
          returnedCost += cost;
          if (!firstReturnDate) firstReturnDate = txn.date;
        }
      }

      const quantityReceived = decimalToNumberOrZero(batch.quantityReceived);
      const quantityAvailable = decimalToNumberOrZero(batch.quantityAvailable);

      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        receiptNumber: batch.receiptNumber,
        supplierId: batch.supplierRef?.id ?? batch.supplierId ?? null,
        supplierName: batch.supplierRef?.name ?? batch.supplier ?? 'Unassigned supplier',
        materialId: batch.materialId,
        materialName: batch.material?.name ?? 'Unknown material',
        unit: batch.material?.unit ?? '-',
        warehouseId: batch.warehouse?.id ?? batch.warehouseId ?? null,
        warehouseName: batch.warehouse?.name ?? null,
        receivedDate: batch.receivedDate,
        expiryDate: batch.expiryDate,
        notes: batch.notes,
        quantityReceived,
        quantityAvailable,
        netIssuedQuantity: issuedQuantity - returnedQuantity,
        issuedQuantity,
        returnedQuantity,
        unitCost: decimalToNumberOrZero(batch.unitCost),
        receiptCost: decimalToNumberOrZero(batch.totalCost),
        issuedCost,
        returnedCost,
        jobCount: jobMap.size,
        customerCount: customerMap.size,
        dispatchCount: dispatchIds.size,
        deliveryNoteCount: deliveryNoteIds.size,
        firstIssueDate,
        firstReturnDate,
        lastIssueDate,
        lastActivityDate,
        jobs: Array.from(jobMap.values()).sort((a, b) => a.jobNumber.localeCompare(b.jobNumber)),
        customers: Array.from(customerMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    return successResponse({
      summary: {
        totalBatches: rows.length,
        openBatches: rows.filter((row) => row.quantityAvailable > 0.0005).length,
        suppliersCovered: new Set(rows.map((row) => row.supplierId ?? row.supplierName)).size,
        receiptLinkedCount: rows.filter((row) => Boolean(row.receiptNumber)).length,
        dispatchedBatchCount: rows.filter((row) => row.dispatchCount > 0).length,
        returnedBatchCount: rows.filter((row) => row.returnedQuantity > 0.0005).length,
      },
      rows,
    });
  } catch (error) {
    console.error('[supplier-traceability]', error);
    return errorResponse('Failed to load supplier traceability report', 500);
  }
}
