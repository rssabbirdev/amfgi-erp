import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;

  const conn = await getCompanyDB(dbName);
  const { Transaction } = getModels(conn);

  // Aggregation: net consumed per material for this job
  const result = await Transaction.aggregate([
    {
      $match: {
        jobId: new Types.ObjectId(id),
        type:  { $in: ['STOCK_OUT', 'RETURN'] },
      },
    },
    {
      $group: {
        _id: '$materialId',
        dispatched: {
          $sum: { $cond: [{ $eq: ['$type', 'STOCK_OUT'] }, '$quantity', 0] },
        },
        returned: {
          $sum: { $cond: [{ $eq: ['$type', 'RETURN'] }, '$quantity', 0] },
        },
      },
    },
    {
      $addFields: {
        netConsumed:       { $subtract: ['$dispatched', '$returned'] },
        availableToReturn: { $subtract: ['$dispatched', '$returned'] },
      },
    },
    {
      $lookup: {
        from:         'materials',
        localField:   '_id',
        foreignField: '_id',
        as:           'material',
      },
    },
    { $unwind: '$material' },
    {
      $project: {
        materialId:        '$_id',
        materialName:      '$material.name',
        unit:              '$material.unit',
        dispatched:        1,
        returned:          1,
        netConsumed:       1,
        availableToReturn: 1,
      },
    },
    { $sort: { materialName: 1 } },
  ]);

  return successResponse(result);
}
