import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const ContactSchema = z.object({
  label: z.string().max(80).optional(),
  name: z.string().max(150),
  number: z.string().max(60).optional(),
  email: z.string().email().optional().or(z.literal('')),
  designation: z.string().max(120).optional(),
});

/** Thrown when customerName + customerExternalId disagree with stored party links (maps to HTTP 409). */
export class JobSyncConflictError extends Error {
  override name = 'JobSyncConflictError';
  constructor(message: string) {
    super(message);
  }
}

/** Invalid parent reference for API job upsert (maps to HTTP 400). */
export class JobSyncReferenceError extends Error {
  override name = 'JobSyncReferenceError';
  constructor(message: string) {
    super(message);
  }
}

const customerExternalIdSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return undefined;
    if (!/^\d+$/.test(t)) return Number.NaN;
    const n = Number.parseInt(t, 10);
    return n > 0 && n <= 2_147_483_647 ? n : Number.NaN;
  }
  return Number.NaN;
}, z.number().int().positive().max(2_147_483_647).optional());

export const UpsertJobSchema = z.object({
  companyExternalId: z.string().min(1).max(120),
  job: z.object({
    externalJobId: z.string().min(1).max(120),
    jobNumber: z.string().min(1).max(50),
    customerName: z.string().min(1).max(200),
    /** PM / Accounts party id — matches `Customer.externalPartyId` when set */
    customerExternalId: customerExternalIdSchema,
    description: z.string().max(2000).optional(),
    site: z.string().max(200).optional(),
    projectName: z.string().max(200).optional(),
    projectDetails: z.string().max(2000).optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).default('ACTIVE'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    quotationNumber: z.string().max(120).optional(),
    lpoNumber: z.string().max(120).optional(),
    quotationDate: z.string().optional(),
    lpoDate: z.string().optional(),
    lpoValue: z.number().optional(),
    address: z.string().max(2000).optional(),
    locationName: z.string().max(200).optional(),
    locationLat: z.number().optional(),
    locationLng: z.number().optional(),
    contacts: z.array(ContactSchema).optional(),
    /** Primary contact name (same role as Customer.contactPerson) */
    contactPerson: z.string().max(200).optional(),
    salesPerson: z.string().max(200).optional(),
    externalUpdatedAt: z.string().optional(),
    /** When set, this job is a variation of the parent identified by `Job.externalJobId` in AMFGI */
    parentExternalJobId: z.string().min(1).max(120).optional(),
  }),
});

export type UpsertJobPayload = z.infer<typeof UpsertJobSchema>;

async function resolveCustomerForJobUpsert(
  tx: Prisma.TransactionClient,
  companyId: string,
  payload: UpsertJobPayload['job']
): Promise<{ id: string }> {
  const name = payload.customerName.trim();
  const extId = payload.customerExternalId;

  if (extId !== undefined) {
    const byExt = await tx.customer.findFirst({
      where: { companyId, externalPartyId: extId },
      select: { id: true, name: true },
    });
    if (byExt) {
      if (name !== byExt.name) {
        await tx.customer.update({
          where: { id: byExt.id },
          data: { name },
        });
      }
      return { id: byExt.id };
    }

    const byName = await tx.customer.findFirst({
      where: { companyId, name },
      select: { id: true, externalPartyId: true },
    });
    if (byName) {
      if (byName.externalPartyId != null && byName.externalPartyId !== extId) {
        throw new JobSyncConflictError(
          'customerName matches an existing customer linked to a different customerExternalId'
        );
      }
      await tx.customer.update({
        where: { id: byName.id },
        data: { externalPartyId: extId },
      });
      return { id: byName.id };
    }

    return tx.customer.create({
      data: { companyId, name, source: 'LOCAL', externalPartyId: extId },
      select: { id: true },
    });
  }

  let customer = await tx.customer.findFirst({
    where: { companyId, name },
    select: { id: true },
  });
  if (!customer) {
    customer = await tx.customer.create({
      data: { companyId, name, source: 'LOCAL' },
      select: { id: true },
    });
  }
  return customer;
}

function parseDateOrNull(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function processJobUpsert(params: {
  companyId: string;
  credentialId: string;
  payload: UpsertJobPayload['job'];
}): Promise<{
  created: boolean;
  job: {
    id: string;
    jobNumber: string;
    externalJobId: string | null;
    lpoValue: number | null;
    parentJobId: string | null;
  };
}> {
  const { companyId, credentialId, payload } = params;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const customer = await resolveCustomerForJobUpsert(tx, companyId, payload);

    let parentJobId: string | null = null;
    if (payload.parentExternalJobId) {
      if (payload.parentExternalJobId === payload.externalJobId) {
        throw new JobSyncReferenceError('parentExternalJobId must differ from externalJobId');
      }
      const parent = await tx.job.findFirst({
        where: { companyId, externalJobId: payload.parentExternalJobId },
        select: { id: true, parentJobId: true },
      });
      if (!parent) {
        throw new JobSyncReferenceError(
          'parentExternalJobId does not match any job in this company; sync the parent job first'
        );
      }
      if (parent.parentJobId) {
        throw new JobSyncReferenceError('parentExternalJobId must refer to a parent job, not a variation');
      }
      parentJobId = parent.id;
    }

    const existing = await tx.job.findFirst({
      where: { companyId, externalJobId: payload.externalJobId },
      select: { id: true, lpoValue: true, parentJobId: true },
    });

    if (payload.parentExternalJobId && existing) {
      const variationCount = await tx.job.count({ where: { parentJobId: existing.id } });
      if (variationCount > 0) {
        throw new JobSyncReferenceError(
          'This job already has variations; it cannot be linked under another parent. Upsert variations using their own externalJobId and parentExternalJobId.'
        );
      }
    }

    const baseData: Omit<Prisma.JobUncheckedCreateInput, 'companyId' | 'createdBy'> = {
      externalJobId: payload.externalJobId,
      jobNumber: payload.jobNumber,
      customerId: customer.id,
      description: payload.description || null,
      site: payload.site || null,
      address: payload.address || null,
      locationName: payload.locationName || null,
      locationLat: payload.locationLat ?? null,
      locationLng: payload.locationLng ?? null,
      status: payload.status,
      startDate: parseDateOrNull(payload.startDate),
      endDate: parseDateOrNull(payload.endDate),
      quotationNumber: payload.quotationNumber || null,
      quotationDate: parseDateOrNull(payload.quotationDate),
      lpoNumber: payload.lpoNumber || null,
      lpoDate: parseDateOrNull(payload.lpoDate),
      lpoValue: payload.lpoValue ?? null,
      projectName: payload.projectName || null,
      projectDetails: payload.projectDetails || null,
      contactPerson: payload.contactPerson?.trim() || null,
      contactsJson:
        payload.contacts && payload.contacts.length > 0
          ? (payload.contacts as Prisma.InputJsonValue)
          : ([] as Prisma.InputJsonValue),
      salesPerson: payload.salesPerson || null,
      source: 'EXTERNAL_API',
      externalUpdatedAt: parseDateOrNull(payload.externalUpdatedAt),
    };

    if (payload.parentExternalJobId !== undefined) {
      baseData.parentJobId = parentJobId;
    }

    const createData: Prisma.JobUncheckedCreateInput = {
      ...baseData,
      companyId,
      createdBy: `api:${credentialId}`,
    };

    const job = existing
      ? await tx.job.update({
          where: { id: existing.id },
          data: baseData as Prisma.JobUpdateInput,
          select: { id: true, jobNumber: true, externalJobId: true, lpoValue: true, parentJobId: true },
        })
      : await tx.job.create({
          data: createData,
          select: { id: true, jobNumber: true, externalJobId: true, lpoValue: true, parentJobId: true },
        });

    if (existing && existing.lpoValue !== (payload.lpoValue ?? null)) {
      await tx.jobLpoValueHistory.create({
        data: {
          companyId,
          jobId: existing.id,
          previousValue: existing.lpoValue,
          newValue: payload.lpoValue ?? null,
          changedBy: `api:${credentialId}`,
          source: 'external_api',
          note: 'Synced from Project Management API',
        },
      });
    }

    await tx.apiCredential.update({ where: { id: credentialId }, data: { lastUsedAt: now } });
    return { created: !existing, job };
  });
}
