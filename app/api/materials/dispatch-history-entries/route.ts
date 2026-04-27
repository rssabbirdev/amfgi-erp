import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const filterType = searchParams.get('filterType') ?? 'all';
  const dateStr = searchParams.get('date');

  let startDate = new Date(0);
  let endDate = new Date();

  if (filterType === 'day' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  } else if (filterType === 'month' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      type: 'STOCK_OUT',
      date: { gte: startDate, lte: endDate },
    },
    select: {
      id: true,
      companyId: true,
      type: true,
      performedBy: true,
      performedByUserId: true,
      performedByName: true,
      materialId: true,
      quantity: true,
      jobId: true,
      notes: true,
      isDeliveryNote: true,
      date: true,
      totalCost: true,
      signedCopyUrl: true,
      warehouse: {
        select: { id: true, name: true },
      },
      material: {
        select: { id: true, name: true, unit: true, unitCost: true },
      },
      job: {
        select: {
          id: true,
          jobNumber: true,
          description: true,
          contactPerson: true,
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  const creatorIds = Array.from(
    new Set(transactions.map((txn) => txn.performedByUserId?.trim() ?? '').filter(Boolean))
  );

  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true, signatureUrl: true },
      })
    : [];
  const creatorsById = new Map(creators.map((u) => [u.id, u]));

  const groupedMap = new Map<string, typeof transactions>();
  for (const txn of transactions) {
    const dateOnly = txn.date.toISOString().split('T')[0];
    const isDeliveryNote = txn.isDeliveryNote ?? false;
    const key = isDeliveryNote ? `${txn.jobId}-${dateOnly}-dn-${txn.id}` : `${txn.jobId}-${dateOnly}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key)!.push(txn);
  }

  const enrichedEntries = await Promise.all(
    Array.from(groupedMap.entries()).map(async ([, groupedTxns]) => {
      const materialsMap = new Map<
        string,
        {
          materialId: string;
          materialName: string;
          materialUnit: string;
          warehouseId: string | null;
          warehouseName: string | null;
          quantity: number;
          unitCost: number;
          transactionIds: string[];
        }
      >();
      let totalNetQuantity = 0;
      let totalValuation = 0;

      for (const txn of groupedTxns) {
        const returnTxns = await prisma.transaction.findMany({
          where: {
            companyId,
            type: 'RETURN',
            parentTransactionId: txn.id ?? undefined,
          },
        });

        const returnQuantity = returnTxns.reduce((sum, rt) => sum + decimalToNumberOrZero(rt.quantity), 0);
        const netQuantity = decimalToNumberOrZero(txn.quantity) - returnQuantity;
        totalNetQuantity += netQuantity;

        const key = txn.materialId;
        const unitCost = decimalToNumberOrZero(txn.material?.unitCost);
        totalValuation += netQuantity * unitCost;

        if (materialsMap.has(key)) {
          const existing = materialsMap.get(key)!;
          existing.quantity += netQuantity;
          existing.transactionIds.push(txn.id);
        } else {
          materialsMap.set(key, {
            materialId: txn.materialId,
            materialName: txn.material?.name ?? 'Unknown',
            materialUnit: txn.material?.unit ?? '-',
            warehouseId: txn.warehouse?.id ?? null,
            warehouseName: txn.warehouse?.name ?? null,
            quantity: netQuantity,
            unitCost,
            transactionIds: [txn.id],
          });
        }
      }

      const firstTxn = groupedTxns[0];
      const serializedJob = firstTxn.job ? serializeJobWithContacts(firstTxn.job) : null;
      const dateOnly = firstTxn.date.toISOString().split('T')[0];
      const isDeliveryNote = firstTxn.isDeliveryNote ?? false;
      const entryId = isDeliveryNote ? `${firstTxn.jobId}-${dateOnly}-dn-${firstTxn.id}` : `${firstTxn.jobId}-${dateOnly}`;

      return {
        id: entryId,
        _id: entryId,
        entryId,
        jobId: firstTxn.jobId,
        jobNumber: firstTxn.job?.jobNumber ?? 'N/A',
        jobDescription: firstTxn.job?.description ?? '',
        jobContactPerson: serializedJob?.contactPerson ?? undefined,
        jobContactsJson: serializedJob?.contactsJson ?? undefined,
        dispatchDate: firstTxn.date,
        totalQuantity: totalNetQuantity,
        totalValuation,
        materialsCount: materialsMap.size,
        materials: Array.from(materialsMap.values()),
        transactionIds: groupedTxns.map((t) => t.id),
        transactionCount: groupedTxns.length,
        notes: firstTxn.notes ?? undefined,
        isDeliveryNote: firstTxn.isDeliveryNote ?? false,
        signedCopyUrl: firstTxn.signedCopyUrl ?? undefined,
        createdByUserId: firstTxn.performedByUserId ?? undefined,
        createdByName:
          (firstTxn.performedByUserId ? creatorsById.get(firstTxn.performedByUserId)?.name : undefined) ??
          firstTxn.performedByName ??
          firstTxn.performedBy ??
          undefined,
        createdByEmail:
          (firstTxn.performedByUserId ? creatorsById.get(firstTxn.performedByUserId)?.email : undefined) ??
          undefined,
        createdBySignatureUrl:
          (firstTxn.performedByUserId ? creatorsById.get(firstTxn.performedByUserId)?.signatureUrl : undefined) ??
          undefined,
      };
    })
  );

  enrichedEntries.sort((a, b) => b.dispatchDate.getTime() - a.dispatchDate.getTime());

  return successResponse({
    entries: enrichedEntries,
    dateRange: {
      startDate,
      endDate,
      filterType,
    },
  });
}
