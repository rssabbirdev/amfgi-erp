import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('report.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const from   = searchParams.get('from');
  const to     = searchParams.get('to');
  const jobIds = searchParams.getAll('jobId');

  const conn = await getCompanyDB(dbName);
  const { Transaction } = getModels(conn);

  const match: Record<string, unknown> = {
    type: { $in: ['STOCK_OUT', 'RETURN'] },
  };
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    match.date = dateFilter;
  }
  if (jobIds.length > 0) {
    match.jobId = { $in: jobIds.map((id) => new Types.ObjectId(id)) };
  }

  // Pivot: rows = jobs, columns = materials, values = net consumption
  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { jobId: '$jobId', materialId: '$materialId' },
        dispatched: { $sum: { $cond: [{ $eq: ['$type', 'STOCK_OUT'] }, '$quantity', 0] } },
        returned:   { $sum: { $cond: [{ $eq: ['$type', 'RETURN']   }, '$quantity', 0] } },
      },
    },
    {
      $addFields: {
        netConsumed: { $subtract: ['$dispatched', '$returned'] },
      },
    },
    {
      $lookup: { from: 'jobs',      localField: '_id.jobId',      foreignField: '_id', as: 'job'      },
    },
    {
      $lookup: { from: 'materials', localField: '_id.materialId', foreignField: '_id', as: 'material' },
    },
    { $unwind: '$job'      },
    { $unwind: '$material' },
    {
      $project: {
        jobId:        '$_id.jobId',
        jobNumber:    '$job.jobNumber',
        materialId:   '$_id.materialId',
        materialName: '$material.name',
        unit:         '$material.unit',
        dispatched:   1,
        returned:     1,
        netConsumed:  1,
      },
    },
    { $sort: { jobNumber: 1, materialName: 1 } },
  ]);

  return successResponse(rows);
}
