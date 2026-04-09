import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UpdateSchema = z.object({
  customerId:     z.string().min(1).optional(),
  description:    z.string().max(1000).optional(),
  site:           z.string().max(200).optional(),
  status:         z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
  startDate:      z.string().optional(),
  endDate:        z.string().optional(),
  quotationNumber: z.string().max(100).optional(),
  lpoNumber:      z.string().max(100).optional(),
  projectName:    z.string().max(200).optional(),
  projectDetails: z.string().max(2000).optional(),
  jobWorkValue:   z.number().positive().optional(),
  finishedGoods:  z.array(z.object({
    materialId:   z.string(),
    materialName: z.string(),
    quantity:     z.number().positive(),
  })).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: {
      id,
      companyId: session.user.activeCompanyId,
    },
    include: {
      customer: {
        select: { id: true, name: true },
      },
    },
  });
  if (!job) return errorResponse('Job not found', 404);
  return successResponse(job);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.edit')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const updateData: Record<string, unknown> = {};

    // Only include fields that were explicitly provided
    if (parsed.data.customerId !== undefined) updateData.customerId = parsed.data.customerId;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.site !== undefined) updateData.site = parsed.data.site;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.startDate !== undefined) updateData.startDate = parsed.data.startDate ? new Date(`${parsed.data.startDate}T00:00:00Z`) : null;
    if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00Z`) : null;
    if (parsed.data.quotationNumber !== undefined) updateData.quotationNumber = parsed.data.quotationNumber;
    if (parsed.data.lpoNumber !== undefined) updateData.lpoNumber = parsed.data.lpoNumber;
    if (parsed.data.projectName !== undefined) updateData.projectName = parsed.data.projectName;
    if (parsed.data.projectDetails !== undefined) updateData.projectDetails = parsed.data.projectDetails;
    if (parsed.data.jobWorkValue !== undefined) updateData.jobWorkValue = parsed.data.jobWorkValue;
    if (parsed.data.finishedGoods !== undefined) {
      updateData.finishedGoods = (parsed.data.finishedGoods && parsed.data.finishedGoods.length > 0) ? parsed.data.finishedGoods : [];
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        customer: {
          select: { id: true, name: true },
        },
      },
    });
    return successResponse(job);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update job';
    if (errorMsg.includes('not found')) {
      return errorResponse('Job not found', 404);
    }
    return errorResponse(errorMsg, 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.delete')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  try {
    // Check for linked transactions
    const txnCount = await prisma.transaction.count({
      where: {
        jobId: id,
        companyId: session.user.activeCompanyId,
      },
    });

    if (txnCount > 0 && !hardDelete) {
      return errorResponse(
        `Cannot delete: ${txnCount} transaction(s) linked to this job. Deactivate instead or use hard delete if you're certain.`,
        400
      );
    }

    if (hardDelete) {
      // Permanently delete (only if no transactions OR user explicitly confirmed)
      await prisma.job.delete({
        where: { id },
      });
      return successResponse({ deleted: true, permanent: true });
    } else {
      // Soft delete (deactivate)
      const job = await prisma.job.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      return successResponse({ deleted: true, permanent: false, message: 'Job marked as CANCELLED' });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete job';
    if (errorMsg.includes('not found')) {
      return errorResponse('Job not found', 404);
    }
    return errorResponse(errorMsg, 500);
  }
}
