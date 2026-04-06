import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

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

  const conn = await getCompanyDB(dbName);
  const { Transaction, Material, Job } = getModels(conn);

  // Group transactions by jobId and date (calendar day)
  const entries = await Transaction.aggregate([
    {
      $match: {
        type: 'STOCK_OUT',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $addFields: {
        dateOnly: {
          $dateToString: { format: '%Y-%m-%d', date: '$date' },
        },
      },
    },
    {
      $group: {
        _id: {
          jobId: '$jobId',
          dateOnly: '$dateOnly',
        },
        transactions: { $push: '$$ROOT' },
        totalQuantity: { $sum: '$quantity' },
        firstDate: { $min: '$date' },
        entryCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'jobs',
        localField: '_id.jobId',
        foreignField: '_id',
        as: 'jobDetails',
      },
    },
    {
      $unwind: {
        path: '$jobDetails',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $sort: { firstDate: -1 },
    },
  ]);

  // Enrich each entry with material details and calculate net quantities
  const enrichedEntries = await Promise.all(
    entries.map(async (entry) => {
      const materialsMap = new Map();
      let totalNetQuantity = 0;

      for (const txn of entry.transactions) {
        const material = await Material.findById(txn.materialId).lean();
        if (material) {
          // Find any linked RETURN transactions
          const returnTxns = await Transaction.find({
            type: 'RETURN',
            parentTransactionId: txn._id,
          }).lean();

          const returnQuantity = returnTxns.reduce((sum, rt: any) => sum + (rt.quantity ?? 0), 0);
          const netQuantity = txn.quantity - returnQuantity;
          totalNetQuantity += netQuantity;

          const key = txn.materialId.toString();
          if (materialsMap.has(key)) {
            const existing = materialsMap.get(key);
            existing.quantity += netQuantity;
            existing.transactionIds.push(txn._id);
          } else {
            materialsMap.set(key, {
              materialId: txn.materialId,
              materialName: material.name,
              materialUnit: material.unit,
              quantity: netQuantity,
              transactionIds: [txn._id],
            });
          }
        }
      }

      const entryId = `${entry._id.jobId}-${entry._id.dateOnly}`;
      return {
        _id: entryId,
        entryId,
        jobId: entry._id.jobId,
        jobNumber: entry.jobDetails?.jobNumber ?? 'N/A',
        jobDescription: entry.jobDetails?.description ?? '',
        dispatchDate: entry.firstDate,
        totalQuantity: totalNetQuantity,
        materialsCount: materialsMap.size,
        materials: Array.from(materialsMap.values()),
        transactionIds: entry.transactions.map((t: any) => t._id),
        transactionCount: entry.entryCount,
      };
    })
  );

  return successResponse({
    entries: enrichedEntries,
    dateRange: {
      startDate,
      endDate,
      filterType,
    },
  });
}
