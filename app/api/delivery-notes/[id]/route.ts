import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { deleteDeliveryNoteWithStockTransactions } from '@/lib/stock/deleteDeliveryNote';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { serializeSupplierWithContacts } from '@/lib/partyContacts';
import { jobForPrintSelect } from '@/lib/jobs/jobPrintSelect';
import { outstandingQty } from '@/lib/stock/subcontractDeliveryNote';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

function canDeleteDeliveryNote(isSuperAdmin: boolean, permissions: string[]) {
  return isSuperAdmin || permissions.includes('transaction.stock_out');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const perms = (session.user.permissions ?? []) as string[];
  const canRead =
    session.user.isSuperAdmin ||
    perms.includes('transaction.stock_out') ||
    perms.includes('settings.manage');
  if (!canRead) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  if (!id?.trim()) return errorResponse('Delivery note id is required', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const dn = await prisma.deliveryNote.findFirst({
      where: { id: id.trim(), companyId },
      include: {
        job: { select: jobForPrintSelect },
        referenceJob: { select: jobForPrintSelect },
        supplier: {
          include: {
            contacts: { orderBy: { sortOrder: 'asc' } },
          },
        },
        sourceWarehouse: { select: { id: true, name: true } },
        targetWarehouse: { select: { id: true, name: true } },
        materialLines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            material: { select: { id: true, name: true, unit: true } },
            sourceWarehouse: { select: { id: true, name: true } },
            targetWarehouse: { select: { id: true, name: true } },
          },
        },
        transactions: {
          where: { type: 'STOCK_OUT' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!dn) return errorResponse('Delivery note not found', 404);

    const serializedJob = dn.job ? serializeJobWithContacts(dn.job) : null;
    const serializedReferenceJob = dn.referenceJob ? serializeJobWithContacts(dn.referenceJob) : null;

    const stockOutIds = dn.transactions.map((txn) => txn.id);
    const allTxnIds =
      dn.deliveryType === 'SUBCONTRACT'
        ? await prisma.transaction.findMany({
            where: { companyId, deliveryNoteId: dn.id },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })
        : dn.transactions;

    return successResponse({
      id: dn.id,
      number: dn.number,
      deliveryType: dn.deliveryType,
      jobId: dn.jobId,
      date: dn.date,
      documentNotes: dn.documentNotes ?? null,
      contactPerson: dn.contactPerson ?? null,
      customItemsJson: dn.customItemsJson ?? null,
      materialDispatchSkipped: dn.materialDispatchSkipped,
      supplierId: dn.supplierId,
      supplier: dn.supplier ? serializeSupplierWithContacts(dn.supplier) : null,
      sourceWarehouseId: dn.sourceWarehouseId,
      targetWarehouseId: dn.targetWarehouseId,
      sourceWarehouse: dn.sourceWarehouse,
      targetWarehouse: dn.targetWarehouse,
      transitStatus: dn.transitStatus,
      referenceJobId: dn.referenceJobId,
      referenceJob: serializedReferenceJob,
      job: serializedJob,
      materialLines: dn.materialLines.map((line) => {
        const issued = decimalToNumberOrZero(line.issuedQty);
        const received = decimalToNumberOrZero(line.receivedQty);
        return {
          id: line.id,
          materialId: line.materialId,
          materialName: line.material.name,
          materialUnit: line.material.unit,
          quantityUomId: line.quantityUomId,
          issuedQty: issued,
          receivedQty: received,
          outstandingQty: outstandingQty(issued, received),
          sourceWarehouseId: line.sourceWarehouseId,
          targetWarehouseId: line.targetWarehouseId,
          sourceWarehouseName: line.sourceWarehouse.name,
          targetWarehouseName: line.targetWarehouse.name,
          sortOrder: line.sortOrder,
        };
      }),
      firstStockOutTransactionId: stockOutIds[0] ?? null,
      transactionIds: allTxnIds.map((txn) => txn.id),
    });
  } catch (err: unknown) {
    console.error('delivery-notes GET:', err);
    return errorResponse('Failed to load delivery note', 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const perms = (session.user.permissions ?? []) as string[];
  if (!canDeleteDeliveryNote(session.user.isSuperAdmin ?? false, perms)) {
    return errorResponse('Forbidden — requires transaction.stock_out permission', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  if (!id?.trim()) return errorResponse('Delivery note id is required', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const result = await prisma.$transaction(async (tx) =>
      deleteDeliveryNoteWithStockTransactions(tx, {
        companyId,
        deliveryNoteId: id.trim(),
        sessionUser: session.user,
      })
    );

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'delivery_note',
      action: 'deleted',
    });

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete delivery note';
    const status = message.includes('not found') ? 404 : message.includes('Cannot delete') ? 400 : 500;
    console.error('delivery-notes DELETE:', err);
    return errorResponse(message, status);
  }
}
