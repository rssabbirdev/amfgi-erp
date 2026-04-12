import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

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

  // Fetch all dispatch transactions within the date range
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
      materialId: true,
      quantity: true,
      jobId: true,
      notes: true,
      isDeliveryNote: true,
      date: true,
      totalCost: true,
      signedCopyUrl: true,
      material: { select: { id: true, name: true, unit: true, unitCost: true } },
      job: { select: { id: true, jobNumber: true, description: true } },
    },
    orderBy: { date: 'asc' },
  });

  // Group transactions by jobId and calendar day
  // For delivery notes, each submission is a separate entry
  // For dispatch notes, group by jobId-date
  const groupedMap = new Map<string, typeof transactions>();
  for (const txn of transactions) {
    const dateOnly = txn.date.toISOString().split('T')[0];
    // Delivery notes: each submission gets a unique key using the transaction ID as a unique identifier
    // Dispatch notes: group by jobId-date as before
    const isDeliveryNote = txn.isDeliveryNote ?? false;
    const key = isDeliveryNote
      ? `${txn.jobId}-${dateOnly}-dn-${txn.id}`  // Unique per delivery note submission
      : `${txn.jobId}-${dateOnly}`;               // Group dispatch notes by date
    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key)!.push(txn);
  }

  // Enrich each entry with material details and calculate net quantities
  const enrichedEntries = await Promise.all(
    Array.from(groupedMap.entries()).map(async ([groupKey, groupedTxns]) => {
      const materialsMap = new Map<string, {
        materialId: string;
        materialName: string;
        materialUnit: string;
        quantity: number;
        unitCost: number;
        transactionIds: string[];
      }>();
      let totalNetQuantity = 0;
      let totalValuation = 0;

      for (const txn of groupedTxns) {
        // Find any linked RETURN transactions
        const returnTxns = await prisma.transaction.findMany({
          where: {
            companyId,
            type: 'RETURN',
            parentTransactionId: txn.id ?? undefined,
          },
        });

        const returnQuantity = returnTxns.reduce((sum, rt) => sum + rt.quantity, 0);
        const netQuantity = txn.quantity - returnQuantity;
        totalNetQuantity += netQuantity;

        const key = txn.materialId;
        const unitCost = txn.material?.unitCost ?? 0;
        const materialValuation = netQuantity * unitCost;
        totalValuation += materialValuation;

        if (materialsMap.has(key)) {
          const existing = materialsMap.get(key)!;
          existing.quantity += netQuantity;
          existing.transactionIds.push(txn.id);
        } else {
          materialsMap.set(key, {
            materialId: txn.materialId,
            materialName: txn.material?.name ?? 'Unknown',
            materialUnit: txn.material?.unit ?? '—',
            quantity: netQuantity,
            unitCost,
            transactionIds: [txn.id],
          });
        }
      }

      const firstTxn = groupedTxns[0];
      const dateOnly = firstTxn.date.toISOString().split('T')[0];
      const isDeliveryNote = firstTxn.isDeliveryNote ?? false;
      // For delivery notes, use transaction ID to make each submission unique
      // For dispatch notes, use jobId-date
      const entryId = isDeliveryNote
        ? `${firstTxn.jobId}-${dateOnly}-dn-${firstTxn.id}`
        : `${firstTxn.jobId}-${dateOnly}`;
      return {
        id: entryId,
        _id: entryId,
        entryId,
        jobId: firstTxn.jobId,
        jobNumber: firstTxn.job?.jobNumber ?? 'N/A',
        jobDescription: firstTxn.job?.description ?? '',
        dispatchDate: firstTxn.date,
        totalQuantity: totalNetQuantity,
        totalValuation,
        materialsCount: materialsMap.size,
        materials: Array.from(materialsMap.values()),
        transactionIds: groupedTxns.map(t => t.id),
        transactionCount: groupedTxns.length,
        notes: firstTxn.notes ?? undefined,
        isDeliveryNote: firstTxn.isDeliveryNote ?? false,
        signedCopyUrl: firstTxn.signedCopyUrl ?? undefined,
      };
    })
  );

  // Sort by dispatchDate descending
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
