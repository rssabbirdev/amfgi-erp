import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const JobSchema = z.object({
  jobNumber:      z.string().min(1).max(50),
  customerId:     z.string().min(1),
  description:    z.string().max(1000).optional(),
  site:           z.string().max(200).optional(),
  address:        z.string().max(2000).optional(),
  locationName:   z.string().max(200).optional(),
  locationLat:    z.number().optional(),
  locationLng:    z.number().optional(),
  status:         z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).default('ACTIVE'),
  startDate:      z.string().optional(),
  endDate:        z.string().optional(),
  quotationNumber: z.string().max(100).optional(),
  quotationDate:   z.string().optional(),
  lpoNumber:      z.string().max(100).optional(),
  lpoDate:         z.string().optional(),
  lpoValue:        z.number().optional(),
  projectName:    z.string().max(200).optional(),
  projectDetails: z.string().max(2000).optional(),
  contactPerson:  z.string().max(200).nullable().optional(),
  contactsJson:   z.array(z.any()).optional(),
  salesPerson:    z.string().max(200).optional(),
  jobWorkValue:   z.number().positive().optional(),
  requiredExpertises: z.array(z.string().min(1).max(120)).optional(),
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
    include: {
      customer: {
        select: { name: true },
      },
    },
  });
  return successResponse(
    jobs.map((j) => ({
      ...j,
      customerName: j.customer?.name ?? null,
    }))
  );
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

  const company = await prisma.company.findUnique({
    where: { id: session.user.activeCompanyId },
    select: { jobSourceMode: true },
  });
  if (!company) return errorResponse('Company not found', 404);
  if (company.jobSourceMode === 'EXTERNAL_ONLY' && !parsed.data.parentJobId) {
    return errorResponse(
      'Parent job creation is disabled for this company. Sync parent jobs from Project Management API; local variations are still allowed.',
      403
    );
  }

  try {
    const job = await prisma.job.create({
      data: {
        jobNumber: parsed.data.jobNumber,
        customerId: parsed.data.customerId,
        description: parsed.data.description || null,
        site: parsed.data.site || null,
        address: parsed.data.address || null,
        locationName: parsed.data.locationName || null,
        locationLat: parsed.data.locationLat ?? null,
        locationLng: parsed.data.locationLng ?? null,
        status: parsed.data.status,
        startDate: parsed.data.startDate ? new Date(`${parsed.data.startDate}T00:00:00Z`) : new Date(),
        endDate: parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00Z`) : null,
        quotationNumber: parsed.data.quotationNumber || null,
        quotationDate: parsed.data.quotationDate ? new Date(`${parsed.data.quotationDate}T00:00:00Z`) : null,
        lpoNumber: parsed.data.lpoNumber || null,
        lpoDate: parsed.data.lpoDate ? new Date(`${parsed.data.lpoDate}T00:00:00Z`) : null,
        lpoValue: parsed.data.lpoValue ?? null,
        projectName: parsed.data.projectName || null,
        projectDetails: parsed.data.projectDetails || null,
        contactPerson: parsed.data.contactPerson?.trim() || null,
        contactsJson: (parsed.data.contactsJson && parsed.data.contactsJson.length > 0) ? parsed.data.contactsJson : [],
        salesPerson: parsed.data.salesPerson || null,
        jobWorkValue: parsed.data.jobWorkValue || null,
        requiredExpertises:
          parsed.data.requiredExpertises && parsed.data.requiredExpertises.length > 0
            ? parsed.data.requiredExpertises
            : [],
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
