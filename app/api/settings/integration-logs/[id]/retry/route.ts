import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Prisma } from '@prisma/client';
import {
  JobSyncConflictError,
  JobSyncReferenceError,
  UpsertJobSchema,
  processJobUpsert,
} from '@/lib/integrations/jobSyncService';
import {
  PartySyncConflictError,
  UpsertCustomerSchema,
  UpsertSupplierSchema,
  processCustomerUpsert,
  processSupplierUpsert,
} from '@/lib/integrations/partyUpsertService';

function hasManagePermission(user: AppSessionUser) {
  const isSA = user.isSuperAdmin ?? false;
  const perms = (user.permissions ?? []) as string[];
  return isSA || perms.includes('settings.manage');
}

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasManagePermission(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await ctx.params;
  const log = await prisma.integrationSyncLog.findFirst({
    where: { id, companyId: session.user.activeCompanyId },
  });
  if (!log) return errorResponse('Integration log not found', 404);
  if (!['job', 'customer', 'supplier'].includes(log.entityType) || log.direction !== 'inbound') {
    return errorResponse('Retry is only supported for inbound job, customer, and supplier sync logs', 400);
  }

  const credential = log.credentialId
    ? await prisma.apiCredential.findFirst({
        where: { id: log.credentialId, companyId: session.user.activeCompanyId, revokedAt: null },
        select: { id: true },
      })
    : null;
  if (!credential) return errorResponse('Original credential was revoked or missing', 400);

  try {
    let result: { created: boolean };
    let parsedData: unknown;
    let entityKey: string;

    if (log.entityType === 'customer') {
      const parsed = UpsertCustomerSchema.safeParse(log.requestBody);
      if (!parsed.success) return errorResponse('Stored request body is invalid for retry', 422);
      const company = await prisma.company.findFirst({
        where: { id: session.user.activeCompanyId, externalCompanyId: parsed.data.companyExternalId },
        select: { id: true },
      });
      if (!company) return errorResponse('Company external id no longer matches; cannot retry', 400);
      result = await processCustomerUpsert({
        companyId: company.id,
        credentialId: credential.id,
        payload: parsed.data.customer,
      });
      parsedData = parsed.data;
      entityKey = String(parsed.data.customer.externalPartyId ?? parsed.data.customer.name);
    } else if (log.entityType === 'supplier') {
      const parsed = UpsertSupplierSchema.safeParse(log.requestBody);
      if (!parsed.success) return errorResponse('Stored request body is invalid for retry', 422);
      const company = await prisma.company.findFirst({
        where: { id: session.user.activeCompanyId, externalCompanyId: parsed.data.companyExternalId },
        select: { id: true },
      });
      if (!company) return errorResponse('Company external id no longer matches; cannot retry', 400);
      result = await processSupplierUpsert({
        companyId: company.id,
        credentialId: credential.id,
        payload: parsed.data.supplier,
      });
      parsedData = parsed.data;
      entityKey = String(parsed.data.supplier.externalPartyId ?? parsed.data.supplier.name);
    } else {
      const parsed = UpsertJobSchema.safeParse(log.requestBody);
      if (!parsed.success) return errorResponse('Stored request body is invalid for retry', 422);
      const company = await prisma.company.findFirst({
        where: { id: session.user.activeCompanyId, externalCompanyId: parsed.data.companyExternalId },
        select: { id: true },
      });
      if (!company) return errorResponse('Company external id no longer matches; cannot retry', 400);
      result = await processJobUpsert({
        companyId: company.id,
        credentialId: credential.id,
        payload: parsed.data.job,
      });
      parsedData = parsed.data;
      entityKey = parsed.data.job.externalJobId;
    }

    await prisma.integrationSyncLog.create({
      data: {
        companyId: session.user.activeCompanyId,
        credentialId: credential.id,
        direction: 'inbound',
        entityType: log.entityType,
        entityKey,
        status: 'retry_success',
        httpStatus: result.created ? 201 : 200,
        requestBody: parsedData as Prisma.InputJsonValue,
        responseBody: result as Prisma.InputJsonValue,
      },
    });
    return successResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry failed';
    const status =
      err instanceof JobSyncConflictError || err instanceof PartySyncConflictError
        ? 409
        : err instanceof JobSyncReferenceError
          ? 400
          : 500;
    await prisma.integrationSyncLog.create({
      data: {
        companyId: session.user.activeCompanyId,
        credentialId: credential.id,
        direction: 'inbound',
        entityType: log.entityType,
        entityKey: log.entityKey,
        status: 'retry_error',
        httpStatus: status,
        requestBody: log.requestBody as Prisma.InputJsonValue,
        errorMessage: message,
      },
    });
    return errorResponse(message, status);
  }
}
