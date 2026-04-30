import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  serializeJobWithContacts,
  syncJobContacts,
} from '@/lib/jobs/jobContacts';
import {
  normalizeRequiredExpertiseNames,
  serializeRequiredExpertises,
  syncJobRequiredExpertises,
} from '@/lib/jobs/jobRequiredExpertises';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalEqualsNullable, decimalToNumber } from '@/lib/utils/decimal';
import { z } from 'zod';

const UpdateSchema = z.object({
  customerId:     z.string().min(1).optional(),
  description:    z.string().max(1000).optional(),
  site:           z.string().max(200).optional(),
  address:        z.string().max(2000).optional(),
  locationName:   z.string().max(200).optional(),
  locationLat:    z.number().optional(),
  locationLng:    z.number().optional(),
  status:         z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
  startDate:      z.string().optional(),
  endDate:        z.string().optional(),
  quotationNumber: z.string().max(100).optional(),
  quotationDate:   z.string().optional(),
  lpoNumber:      z.string().max(100).optional(),
  lpoDate:         z.string().optional(),
  lpoValue:        z.number().finite().optional(),
  projectName:    z.string().max(200).optional(),
  projectDetails: z.string().max(2000).optional(),
  contactPerson:  z.string().max(200).nullable().optional(),
  contactsJson:   z.array(z.any()).optional(),
  salesPerson:    z.string().max(200).optional(),
  jobWorkValue:   z.number().positive().finite().optional(),
  requiredExpertises: z.array(z.string().min(1).max(120)).optional(),
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
      contacts: {
        orderBy: { sortOrder: 'asc' },
      },
      requiredExpertiseLinks: {
        orderBy: { sortOrder: 'asc' },
        select: {
          sortOrder: true,
          expertise: {
            select: { name: true },
          },
        },
      },
      customer: {
        select: { id: true, name: true },
      },
    },
  });
  if (!job) return errorResponse('Job not found', 404);
  return successResponse(serializeRequiredExpertises(serializeJobWithContacts(job)));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.edit')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const requiredExpertises =
    parsed.data.requiredExpertises === undefined
      ? undefined
      : normalizeRequiredExpertiseNames(parsed.data.requiredExpertises);

  try {
    const before = await prisma.job.findUnique({
      where: { id },
      select: { lpoValue: true },
    });
    const updateData: Record<string, unknown> = {};

    // Only include fields that were explicitly provided
    if (parsed.data.customerId !== undefined) updateData.customerId = parsed.data.customerId;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.site !== undefined) updateData.site = parsed.data.site;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address;
    if (parsed.data.locationName !== undefined) updateData.locationName = parsed.data.locationName;
    if (parsed.data.locationLat !== undefined) updateData.locationLat = parsed.data.locationLat;
    if (parsed.data.locationLng !== undefined) updateData.locationLng = parsed.data.locationLng;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.startDate !== undefined) updateData.startDate = parsed.data.startDate ? new Date(`${parsed.data.startDate}T00:00:00Z`) : null;
    if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00Z`) : null;
    if (parsed.data.quotationNumber !== undefined) updateData.quotationNumber = parsed.data.quotationNumber;
    if (parsed.data.quotationDate !== undefined) updateData.quotationDate = parsed.data.quotationDate ? new Date(`${parsed.data.quotationDate}T00:00:00Z`) : null;
    if (parsed.data.lpoNumber !== undefined) updateData.lpoNumber = parsed.data.lpoNumber;
    if (parsed.data.lpoDate !== undefined) updateData.lpoDate = parsed.data.lpoDate ? new Date(`${parsed.data.lpoDate}T00:00:00Z`) : null;
    if (parsed.data.lpoValue !== undefined) updateData.lpoValue = decimalToNumber(parsed.data.lpoValue);
    if (parsed.data.projectName !== undefined) updateData.projectName = parsed.data.projectName;
    if (parsed.data.projectDetails !== undefined) updateData.projectDetails = parsed.data.projectDetails;
    if (parsed.data.contactPerson !== undefined) updateData.contactPerson = parsed.data.contactPerson?.trim() || null;
    if (parsed.data.salesPerson !== undefined) updateData.salesPerson = parsed.data.salesPerson;
    if (parsed.data.jobWorkValue !== undefined) updateData.jobWorkValue = decimalToNumber(parsed.data.jobWorkValue);
    if (parsed.data.finishedGoods !== undefined) {
      updateData.finishedGoods = (parsed.data.finishedGoods && parsed.data.finishedGoods.length > 0) ? parsed.data.finishedGoods : [];
    }

    const job = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id },
        data: updateData,
        include: {
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
          requiredExpertiseLinks: {
            orderBy: { sortOrder: 'asc' },
            select: {
              sortOrder: true,
              expertise: {
                select: { name: true },
              },
            },
          },
          customer: {
            select: { id: true, name: true },
          },
        },
      });
      if (parsed.data.contactsJson !== undefined) {
        await syncJobContacts(tx, {
          companyId,
          jobId: updated.id,
          contacts: parsed.data.contactsJson,
        });
      }
      if (requiredExpertises !== undefined) {
        await syncJobRequiredExpertises(tx, {
          companyId,
          jobId: updated.id,
          names: requiredExpertises,
        });
      }
      if (parsed.data.lpoValue !== undefined && !decimalEqualsNullable(before?.lpoValue, parsed.data.lpoValue)) {
        await tx.jobLpoValueHistory.create({
          data: {
            companyId,
            jobId: updated.id,
            previousValue: before?.lpoValue ?? null,
            newValue: decimalToNumber(parsed.data.lpoValue) ?? null,
            changedBy: session.user.id,
            source: 'manual',
            note: 'Updated from AMFGI job form',
          },
        });
      }
      return tx.job.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
          requiredExpertiseLinks: {
            orderBy: { sortOrder: 'asc' },
            select: {
              sortOrder: true,
              expertise: {
                select: { name: true },
              },
            },
          },
          customer: {
            select: { id: true, name: true },
          },
        },
      });
    });
    publishLiveUpdate({
      companyId,
      channel: 'jobs',
      entity: 'job',
      action: 'updated',
    });
    return successResponse(serializeRequiredExpertises(serializeJobWithContacts(job)));
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
  const companyId = session.user.activeCompanyId;

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
      publishLiveUpdate({
        companyId,
        channel: 'jobs',
        entity: 'job',
        action: 'deleted',
      });
      return successResponse({ deleted: true, permanent: true });
    } else {
      // Soft delete (deactivate)
      const job = await prisma.job.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      publishLiveUpdate({
        companyId,
        channel: 'jobs',
        entity: 'job',
        action: 'updated',
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
