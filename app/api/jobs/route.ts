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
import { canViewJobsListApi } from '@/lib/permissions/stockModuleAccess';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const jobListInclude = {
  contacts: {
    orderBy: { sortOrder: 'asc' as const },
  },
  requiredExpertiseLinks: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      sortOrder: true,
      expertise: {
        select: { name: true },
      },
    },
  },
  customer: {
    select: { name: true },
  },
} satisfies Prisma.JobInclude;

function parseTrackingItemsCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

async function attachBudgetSummaries<T extends { id: string }>(companyId: string, jobs: T[]) {
  if (jobs.length === 0) return jobs;
  const jobIds = jobs.map((job) => job.id);
  const [jobItems, snapshots] = await Promise.all([
    prisma.jobItem.findMany({
      where: {
        companyId,
        jobId: { in: jobIds },
        isActive: true,
      },
      select: {
        jobId: true,
        trackingItems: true,
        progressPercent: true,
        trackableMaterialLinks: {
          select: { id: true },
        },
      },
    }),
    prisma.jobCostingSnapshot.findMany({
      where: {
        companyId,
        jobId: { in: jobIds },
      },
      orderBy: [{ versionNumber: 'desc' }],
      select: {
        id: true,
        jobId: true,
        versionNumber: true,
        status: true,
        pricingMode: true,
        postingDate: true,
        totalQuotedMaterialCost: true,
        totalActualMaterialCost: true,
        totalEstimatedCompletionDays: true,
        createdAt: true,
      },
    }),
  ]);

  const itemSummaryByJobId = new Map<
    string,
    {
      budgetItemCount: number;
      trackableItemCount: number;
      stockLinkedTrackableCount: number;
      budgetLineProgressTotal: number;
    }
  >();
  for (const item of jobItems) {
    const current =
      itemSummaryByJobId.get(item.jobId) ??
      {
        budgetItemCount: 0,
        trackableItemCount: 0,
        stockLinkedTrackableCount: 0,
        budgetLineProgressTotal: 0,
      };
    current.budgetItemCount += 1;
    current.trackableItemCount += parseTrackingItemsCount(item.trackingItems);
    current.stockLinkedTrackableCount += item.trackableMaterialLinks.length;
    current.budgetLineProgressTotal += decimalToNumberOrZero(item.progressPercent);
    itemSummaryByJobId.set(item.jobId, current);
  }

  const snapshotByJobId = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const existing = snapshotByJobId.get(snapshot.jobId);
    if (!existing) {
      snapshotByJobId.set(snapshot.jobId, snapshot);
      continue;
    }
    if (snapshot.status === 'APPROVED' && existing.status !== 'APPROVED') {
      snapshotByJobId.set(snapshot.jobId, snapshot);
    }
  }

  return jobs.map((job) => {
    const itemSummary = itemSummaryByJobId.get(job.id);
    const snapshot = snapshotByJobId.get(job.id);
    const budgetItemCount = itemSummary?.budgetItemCount ?? 0;
    return {
      ...job,
      budgetSummary: {
        budgetItemCount,
        trackableItemCount: itemSummary?.trackableItemCount ?? 0,
        stockLinkedTrackableCount: itemSummary?.stockLinkedTrackableCount ?? 0,
        averageBudgetLineProgressPercent:
          budgetItemCount > 0 ? (itemSummary?.budgetLineProgressTotal ?? 0) / budgetItemCount : null,
        currentSnapshot: snapshot
          ? {
              id: snapshot.id,
              versionNumber: snapshot.versionNumber,
              status: snapshot.status,
              pricingMode: snapshot.pricingMode,
              postingDate: snapshot.postingDate.toISOString(),
              totalQuotedMaterialCost: decimalToNumberOrZero(snapshot.totalQuotedMaterialCost),
              totalActualMaterialCost: decimalToNumberOrZero(snapshot.totalActualMaterialCost),
              totalEstimatedCompletionDays: decimalToNumberOrZero(snapshot.totalEstimatedCompletionDays),
              createdAt: snapshot.createdAt.toISOString(),
            }
          : null,
      },
    };
  });
}

function buildJobListWhere(
  companyId: string,
  opts: {
    status: string | null;
    scope: string | null;
    search: string;
  },
): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = { companyId };

  if (opts.status && opts.status !== 'ALL') {
    where.status = opts.status as Prisma.EnumJobStatusFilter;
  }
  if (opts.scope === 'PARENT_ONLY') where.parentJobId = null;
  if (opts.scope === 'VARIATION_ONLY') where.parentJobId = { not: null };

  if (opts.search) {
    where.OR = [
      { jobNumber: { contains: opts.search, mode: 'insensitive' } },
      { quotationNumber: { contains: opts.search, mode: 'insensitive' } },
      { lpoNumber: { contains: opts.search, mode: 'insensitive' } },
      { site: { contains: opts.search, mode: 'insensitive' } },
      { customer: { name: { contains: opts.search, mode: 'insensitive' } } },
      { description: { contains: opts.search, mode: 'insensitive' } },
      { projectName: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

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
  lpoValue:        z.number().finite().optional(),
  projectName:    z.string().max(200).optional(),
  projectDetails: z.string().max(2000).optional(),
  contactPerson:  z.string().max(200).nullable().optional(),
  contactsJson:   z.array(z.any()).optional(),
  salesPerson:    z.string().max(200).optional(),
  jobWorkValue:   z.number().positive().finite().optional(),
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
  if (!canViewJobsListApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  const limitParam = searchParams.get('limit');

  try {
    const mapJob = (j: Prisma.JobGetPayload<{ include: typeof jobListInclude }>) => ({
      ...serializeRequiredExpertises(serializeJobWithContacts(j)),
      customerName: j.customer?.name ?? null,
    });

    if (idsParam) {
      const ids = [...new Set(idsParam.split(',').map((part) => part.trim()).filter(Boolean))].slice(0, 100);
      if (ids.length === 0) return successResponse([]);
      const jobs = await prisma.job.findMany({
        where: { companyId, id: { in: ids } },
        orderBy: { createdAt: 'desc' },
        include: jobListInclude,
      });
      return successResponse(await attachBudgetSummaries(companyId, jobs.map(mapJob)));
    }

    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));
      const listFilters = {
        scope: searchParams.get('scope'),
        search: searchParams.get('search')?.trim() ?? '',
      };
      const where = buildJobListWhere(companyId, {
        status: searchParams.get('status'),
        ...listFilters,
      });
      const activeWhere = buildJobListWhere(companyId, {
        status: 'ACTIVE',
        ...listFilters,
      });

      const [total, activeTotal, jobs] = await Promise.all([
        prisma.job.count({ where }),
        prisma.job.count({ where: activeWhere }),
        prisma.job.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }],
          skip: offset,
          take: limit,
          include: jobListInclude,
        }),
      ]);

      return successResponse({
        items: await attachBudgetSummaries(companyId, jobs.map(mapJob)),
        total,
        activeTotal,
      });
    }

    const status = searchParams.get('status');
    const where: Prisma.JobWhereInput = { companyId };
    if (status) where.status = status as Prisma.EnumJobStatusFilter;

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: jobListInclude,
    });
    return successResponse(await attachBudgetSummaries(companyId, jobs.map(mapJob)));
  } catch {
    return errorResponse('Failed to fetch jobs', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const body = await req.json();
  const parsed = JobSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { jobSourceMode: true },
  });
  if (!company) return errorResponse('Company not found', 404);
  if (company.jobSourceMode === 'EXTERNAL_ONLY' && !parsed.data.parentJobId) {
    return errorResponse(
      'Parent job creation is disabled for this company. Sync parent jobs from Project Management API; local variations are still allowed.',
      403
    );
  }

  const requiredExpertises = normalizeRequiredExpertiseNames(parsed.data.requiredExpertises);

  try {
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
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
          lpoValue: decimalToNumber(parsed.data.lpoValue) ?? null,
          projectName: parsed.data.projectName || null,
          projectDetails: parsed.data.projectDetails || null,
          contactPerson: parsed.data.contactPerson?.trim() || null,
          salesPerson: parsed.data.salesPerson || null,
          jobWorkValue: decimalToNumber(parsed.data.jobWorkValue) ?? null,
          parentJobId: parsed.data.parentJobId || null,
          finishedGoods: (parsed.data.finishedGoods && parsed.data.finishedGoods.length > 0) ? parsed.data.finishedGoods : [],
          companyId,
          createdBy: session.user.id,
        },
      });

      await syncJobContacts(tx, {
        companyId,
        jobId: created.id,
        contacts: parsed.data.contactsJson,
      });

      await syncJobRequiredExpertises(tx, {
        companyId,
        jobId: created.id,
        names: requiredExpertises,
      });

      return tx.job.findUniqueOrThrow({
        where: { id: created.id },
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
        },
      });
    });
    publishLiveUpdate({
      companyId,
      channel: 'jobs',
      entity: 'job',
      action: 'created',
    });
    return successResponse(serializeRequiredExpertises(serializeJobWithContacts(job)), 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create job';
    console.error('Job creation error:', errorMsg, err);
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Job number already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
