import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;

  try {
    const txn = await prisma.transaction.findUnique({
      where: { id },
      include: {
        material: { select: { id: true, name: true, unit: true, currentStock: true, unitCost: true } },
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
            contactsJson: true,
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
      },
    });

    if (!txn) {
      return errorResponse('Transaction not found', 404);
    }

    if (txn.companyId !== companyId) {
      return errorResponse('Unauthorized', 403);
    }

    const performedById = typeof txn.performedBy === 'string' ? txn.performedBy.trim() : '';
    const performedByUser = performedById
      ? await prisma.user.findUnique({
          where: { id: performedById },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            signatureUrl: true,
            imageDriveId: true,
            signatureDriveId: true,
          },
        })
      : null;

    return successResponse({
      ...txn,
      performedByUser: performedByUser ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch transaction';
    return errorResponse(message, 500);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;

  try {
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

      // Create reversal transaction for audit trail instead of just deleting
      if (txn.type === 'STOCK_OUT' || txn.type === 'RETURN') {
        // Reverse the stock impact
        await tx.material.update({
          where: { id: txn.materialId },
          data: {
            currentStock: {
              increment: txn.quantity,
            },
          },
        });

        // Restore batch quantities for STOCK_OUT
        if (txn.type === 'STOCK_OUT' && txn.batchesUsed && txn.batchesUsed.length > 0) {
          for (const batchUsed of txn.batchesUsed) {
            await tx.stockBatch.update({
              where: { id: batchUsed.batchId },
              data: {
                quantityAvailable: {
                  increment: batchUsed.quantityFromBatch,
                },
              },
            });
          }
        }

        // Create reversal transaction for ledger
        await tx.transaction.create({
          data: {
            companyId,
            type: 'REVERSAL',
            materialId: txn.materialId,
            quantity: txn.quantity,
            jobId: txn.jobId,
            parentTransactionId: txn.id,
            notes: `Reversal of ${txn.type} - ${txn.notes || ''}`,
            date: new Date(),
            performedBy: session.user.id,
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

          // Create reversal for RETURN transaction
          await tx.transaction.create({
            data: {
              companyId,
              type: 'REVERSAL',
              materialId: returnTxn.materialId,
              quantity: returnTxn.quantity,
              jobId: returnTxn.jobId,
              parentTransactionId: returnTxn.id,
              notes: `Reversal of RETURN - ${returnTxn.notes || ''}`,
              date: new Date(),
              performedBy: session.user.id,
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

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete transaction';
    const status = message === 'Unauthorized' ? 403 : message === 'Transaction not found' ? 404 : 500;
    return errorResponse(message, status);
  }
}
