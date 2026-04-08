import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';

const JobSchema = z.object({
  jobNumber:   z.string().min(1).max(50),
  customerId:  z.string().min(1),
  description: z.string().min(1).max(1000),
  site:        z.string().max(200).optional(),
  status:      z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).default('ACTIVE'),
  startDate:   z.string().optional(),
  endDate:     z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const conn = await getCompanyDB(dbName);
  const { Job } = getModels(conn);
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .lean();
  return successResponse(jobs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.create')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = JobSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const conn = await getCompanyDB(dbName);
  const { Job } = getModels(conn);
  const job = await Job.create({
    ...parsed.data,
    createdBy: session.user.id, // string — cross-DB reference
  });
  return successResponse(job, 201);
}
