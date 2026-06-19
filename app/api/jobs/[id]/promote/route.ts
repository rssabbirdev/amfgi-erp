import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { promoteProvisionalJob, PromoteProvisionalJobError } from '@/lib/jobs/promoteProvisionalJob';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PromoteSchema = z.object({
  jobNumber: z.string().min(1).max(50),
  customerId: z.string().min(1),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.edit')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body = await req.json();
  const parsed = PromoteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  try {
    const result = await promoteProvisionalJob(prisma, {
      companyId: session.user.activeCompanyId,
      jobId: id,
      userId: session.user.id,
      jobNumber: parsed.data.jobNumber,
      customerId: parsed.data.customerId,
      note: parsed.data.note,
    });

    publishLiveUpdate({
      companyId: session.user.activeCompanyId,
      channel: 'jobs',
      entity: 'job',
      action: 'updated',
    });
    publishLiveUpdate({
      companyId: session.user.activeCompanyId,
      channel: 'hr',
      entity: 'job',
      action: 'updated',
    });

    return successResponse(result);
  } catch (err: unknown) {
    if (err instanceof PromoteProvisionalJobError) {
      return errorResponse(err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'Failed to confirm job number';
    if (message.includes('Unique constraint failed')) {
      return errorResponse('Job number already exists for this company', 409);
    }
    console.error('Job promote error:', message, err);
    return errorResponse(message, 500);
  }
}
