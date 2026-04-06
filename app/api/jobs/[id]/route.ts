import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';

const UpdateSchema = z.object({
  customerId:  z.string().min(1).optional(),
  description: z.string().min(1).max(1000).optional(),
  site:        z.string().max(200).optional(),
  status:      z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
  startDate:   z.string().optional(),
  endDate:     z.string().optional(),
});

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
  const { Job } = getModels(conn);
  const job = await Job.findById(id).populate('customerId', 'name').lean();
  if (!job) return errorResponse('Job not found', 404);
  return successResponse(job);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.edit')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const conn = await getCompanyDB(dbName);
  const { Job } = getModels(conn);
  const job = await Job.findByIdAndUpdate(id, parsed.data, { new: true })
    .populate('customerId', 'name')
    .lean();
  if (!job) return errorResponse('Job not found', 404);
  return successResponse(job);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.delete')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  const conn = await getCompanyDB(dbName);
  const { Job, Transaction } = getModels(conn);

  // Check for linked transactions
  const txnCount = await Transaction.countDocuments({ jobId: new Types.ObjectId(id) });
  if (txnCount > 0 && !hardDelete) {
    return errorResponse(
      `Cannot delete: ${txnCount} transaction(s) linked to this job. Deactivate instead or use hard delete if you're certain.`,
      400
    );
  }

  if (hardDelete) {
    // Permanently delete (only if no transactions OR user explicitly confirmed)
    await Job.findByIdAndDelete(id);
    return successResponse({ deleted: true, permanent: true });
  } else {
    // Soft delete (deactivate)
    const job = await Job.findByIdAndUpdate(id, { status: 'CANCELLED' }, { new: true }).lean();
    if (!job) return errorResponse('Job not found', 404);
    return successResponse({ deleted: true, permanent: false, message: 'Job marked as CANCELLED' });
  }
}
