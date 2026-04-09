import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const JobSchema = z.object({
  jobNumber:      z.string().min(1).max(50),
  customerId:     z.string().min(1),
  description:    z.string().max(1000).optional(),
  site:           z.string().max(200).optional(),
  status:         z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).default('ACTIVE'),
  startDate:      z.string().optional(),
  endDate:        z.string().optional(),
  quotationNumber: z.string().max(100).optional(),
  lpoNumber:      z.string().max(100).optional(),
  projectName:    z.string().max(200).optional(),
  projectDetails: z.string().max(2000).optional(),
  jobWorkValue:   z.number().positive().optional(),
  parentJobId:    z.string().optional(),
  finishedGoods:  z.array(z.object({
    materialId:   z.string(),
    materialName: z.string(),
    quantity:     z.number().positive(),
  })).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const where: Record<string, unknown> = { companyId: session.user.activeCompanyId };
  if (status) where.status = status;

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  return successResponse(jobs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = JobSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const job = await prisma.job.create({
      data: {
        jobNumber: parsed.data.jobNumber,
        customerId: parsed.data.customerId,
        description: parsed.data.description || null,
        site: parsed.data.site || null,
        status: parsed.data.status,
        startDate: parsed.data.startDate ? new Date(`${parsed.data.startDate}T00:00:00Z`) : new Date(),
        endDate: parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00Z`) : null,
        quotationNumber: parsed.data.quotationNumber || null,
        lpoNumber: parsed.data.lpoNumber || null,
        projectName: parsed.data.projectName || null,
        projectDetails: parsed.data.projectDetails || null,
        jobWorkValue: parsed.data.jobWorkValue || null,
        parentJobId: parsed.data.parentJobId || null,
        finishedGoods: (parsed.data.finishedGoods && parsed.data.finishedGoods.length > 0) ? parsed.data.finishedGoods : [],
        companyId: session.user.activeCompanyId,
        createdBy: session.user.id,
      },
    });
    return successResponse(job, 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create job';
    console.error('Job creation error:', errorMsg, err);
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Job number already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
