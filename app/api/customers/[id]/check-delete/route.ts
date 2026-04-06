import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }             from 'mongoose';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const conn = await getCompanyDB(dbName);
  const { Job } = getModels(conn);

  // Check for linked jobs
  const jobs = await Job.find({ customerId: new Types.ObjectId(id) })
    .select('jobNumber description status')
    .lean()
    .limit(10);

  const jobCount = await Job.countDocuments({ customerId: new Types.ObjectId(id) });

  return successResponse({
    canDelete: jobCount === 0,
    linkedJobs: jobs,
    linkedJobsCount: jobCount,
  });
}
