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
  const filterType = searchParams.get('filterType') ?? 'all'; // 'day', 'month', 'all'
  const dateStr = searchParams.get('date'); // ISO date string

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

  // Fetch dispatch transactions (STOCK_OUT only) within the date range
  const transactions = await Transaction.find({
    type: 'STOCK_OUT',
    date: { $gte: startDate, $lte: endDate },
  })
    .populate('materialId', 'name unit')
    .populate('jobId', 'jobNumber description')
    .sort({ date: -1 })
    .lean();

  // Calculate consumption summary by material
  const summary = await Transaction.aggregate([
    {
      $match: {
        type: 'STOCK_OUT',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$materialId',
        totalQuantity: { $sum: '$quantity' },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'materials',
        localField: '_id',
        foreignField: '_id',
        as: 'material',
      },
    },
    {
      $unwind: '$material',
    },
    {
      $project: {
        _id: 1,
        materialName: '$material.name',
        materialUnit: '$material.unit',
        totalQuantity: 1,
        transactionCount: 1,
      },
    },
    {
      $sort: { totalQuantity: -1 },
    },
  ]);

  return successResponse({
    transactions,
    summary,
    dateRange: {
      startDate,
      endDate,
      filterType,
    },
  });
}
