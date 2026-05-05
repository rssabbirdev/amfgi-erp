import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  consumeTransactionBatchQuantities,
  normalizeTransactionBatchLinks,
  restoreTransactionBatchQuantities,
} from '@/lib/utils/transactionBatchLinks';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import { publishLiveUpdate } from '@/lib/live-updates/server';

function isReconcileTransaction(notes?: string | null) {
  const value = (notes ?? '').trim().toLowerCase();
  return value.startsWith('non-stock reconcile');
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;

  try {
    const txn = await prisma.transaction.findUnique({
      where: { id },
      include: {
        material: { select: { id: true, name: true, unit: true, currentStock: true, unitCost: true } },
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        job: {
          select: {
            id: true,
            jobNumber: true,
            description: true,
            site: true,
            address: true,
            locationName: true,
            locationLat: true,
            locationLng: true,
            status: true,
            startDate: true,
            endDate: true,
            lpoNumber: true,
            lpoDate: true,
            lpoValue: true,
            quotationNumber: true,
            quotationDate: true,
            projectName: true,
            projectDetails: true,
            jobWorkValue: true,
            contactPerson: true,
            contacts: {
              orderBy: { sortOrder: 'asc' },
            },
            salesPerson: true,
            source: true,
            externalJobId: true,
            externalUpdatedAt: true,
            parentJobId: true,
            parentJob: { select: { jobNumber: true } },
            customerId: true,
            customer: {
              select: {
                name: true,
                contactPerson: true,
                phone: true,
                email: true,
                address: true,
              },
            },
          },
        },
        batchesUsed: true,
        performedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            signatureUrl: true,
          },
        },
      },
    });

    if (!txn) {
      return errorResponse('Transaction not found', 404);
    }

    if (txn.companyId !== companyId) {
      return errorResponse('Unauthorized', 403);
    }

    if (!session.user.isSuperAdmin) {
      const hasDispatch = session.user.permissions.includes('transaction.stock_out');
      const hasReconcile = session.user.permissions.includes('transaction.reconcile');
      const isReconcile = isReconcileTransaction(txn.notes);
      if ((isReconcile && !hasReconcile) || (!isReconcile && !hasDispatch)) {
        return errorResponse('Forbidden', 403);
      }
    }

    return successResponse({
      ...txn,
      job: txn.job ? serializeJobWithContacts(txn.job) : null,
      performedByUser: txn.performedByUser ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch transaction';
    return errorResponse(message, 500);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;

  try {
    const actorFields = buildTransactionActorFields(session.user);
    const result = await prisma.$transaction(async (tx) => {
      // Get the transaction
      const txn = await tx.transaction.findUnique({
        where: { id },
        include: {
          batchesUsed: true,
        },
      });

      if (!txn) {
        throw new Error('Transaction not found');
      }

      if (txn.companyId !== companyId) {
        throw new Error('Unauthorized');
      }

      if (!session.user.isSuperAdmin) {
        const hasDispatch = session.user.permissions.includes('transaction.stock_out');
        const hasReconcile = session.user.permissions.includes('transaction.reconcile');
        const isReconcile = isReconcileTransaction(txn.notes);
        if ((isReconcile && !hasReconcile) || (!isReconcile && !hasDispatch)) {
          throw new Error('Unauthorized');
        }
      }

      // Create reversal transaction for audit trail instead of just deleting
      if (txn.type === 'STOCK_OUT' || txn.type === 'RETURN') {
        // Reverse the stock impact
        await tx.material.update({
          where: { id: txn.materialId },
          data: {
            currentStock: {
              increment: txn.type === 'STOCK_OUT' ? txn.quantity : -txn.quantity,
            },
          },
        });
        const reversalWarehouse = await resolveEffectiveWarehouse(tx, {
          companyId,
          materialId: txn.materialId,
          warehouseId: txn.warehouseId,
        });
        await applyMaterialWarehouseDelta(
          tx,
          companyId,
          txn.materialId,
          reversalWarehouse.warehouseId,
          txn.type === 'STOCK_OUT'
            ? decimalToNumberOrZero(txn.quantity)
            : -decimalToNumberOrZero(txn.quantity)
        );

        // Restore batch quantities for STOCK_OUT
        if (txn.type === 'STOCK_OUT' && txn.batchesUsed && txn.batchesUsed.length > 0) {
          await restoreTransactionBatchQuantities(
            tx,
            normalizeTransactionBatchLinks(txn.batchesUsed)
          );
        }

        if (txn.type === 'RETURN' && txn.batchesUsed && txn.batchesUsed.length > 0) {
          await consumeTransactionBatchQuantities(
            tx,
            normalizeTransactionBatchLinks(txn.batchesUsed),
            'Stock changed while deleting this return. Please refresh and retry.'
          );
        }

        // Create reversal transaction for ledger
        await tx.transaction.create({
          data: {
            companyId,
            type: 'REVERSAL',
            materialId: txn.materialId,
            warehouseId: reversalWarehouse.warehouseId,
            quantity: txn.quantity,
            jobId: txn.jobId,
            notes: `Reversal of ${txn.type} - ${txn.notes || ''}`,
            date: new Date(),
            ...actorFields,
          },
        });
      }

      // Delete the original transaction (cascade will remove batchesUsed)
      await tx.transaction.delete({
        where: { id },
      });

      // If this was a STOCK_OUT, also delete any linked RETURN transactions
      if (txn.type === 'STOCK_OUT') {
        const returnTxns = await tx.transaction.findMany({
          where: {
            parentTransactionId: txn.id,
          },
          include: {
            batchesUsed: true,
          },
        });

        for (const returnTxn of returnTxns) {
          // Reverse RETURN stock impact
          await tx.material.update({
            where: { id: returnTxn.materialId },
            data: {
              currentStock: {
                increment: -returnTxn.quantity,
              },
            },
          });
          const returnWarehouse = await resolveEffectiveWarehouse(tx, {
            companyId,
            materialId: returnTxn.materialId,
            warehouseId: returnTxn.warehouseId,
          });
          await applyMaterialWarehouseDelta(
            tx,
            companyId,
            returnTxn.materialId,
            returnWarehouse.warehouseId,
            -decimalToNumberOrZero(returnTxn.quantity)
          );

          if (returnTxn.batchesUsed && returnTxn.batchesUsed.length > 0) {
            await consumeTransactionBatchQuantities(
              tx,
              normalizeTransactionBatchLinks(returnTxn.batchesUsed),
              'Stock changed while deleting a linked return. Please refresh and retry.'
            );
          }

          // Create reversal for RETURN transaction
          await tx.transaction.create({
            data: {
              companyId,
              type: 'REVERSAL',
              materialId: returnTxn.materialId,
              warehouseId: returnWarehouse.warehouseId,
              quantity: returnTxn.quantity,
              jobId: returnTxn.jobId,
              notes: `Reversal of RETURN - ${returnTxn.notes || ''}`,
              date: new Date(),
              ...actorFields,
            },
          });

          // Delete the RETURN transaction (cascade will remove batchesUsed)
          await tx.transaction.delete({
            where: { id: returnTxn.id },
          });
        }
      }

      return { deleted: true };
    });

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'transaction',
      action: 'deleted',
    });

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete transaction';
    const status = message === 'Unauthorized' ? 403 : message === 'Transaction not found' ? 404 : 500;
    return errorResponse(message, status);
  }
}
