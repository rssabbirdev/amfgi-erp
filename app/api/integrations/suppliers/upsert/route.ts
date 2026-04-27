import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { prepareIntegrationRequest, verifyIntegrationCompany } from '@/lib/integrations/integrationRoute';
import {
  PartySyncConflictError,
  UpsertSupplierSchema,
  processSupplierUpsert,
} from '@/lib/integrations/partyUpsertService';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function POST(req: Request) {
  const prepared = await prepareIntegrationRequest(req, 'supplier');
  if (!prepared.ok) return prepared.response;

  const parsed = UpsertSupplierSchema.safeParse(prepared.rawBody);
  if (!parsed.success) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: prepared.cred.companyId,
        credentialId: prepared.cred.id,
        idempotencyKey: prepared.idempotencyKey,
        requestHash: prepared.requestHash,
        direction: 'inbound',
        entityType: 'supplier',
        status: 'validation_error',
        httpStatus: 422,
        requestBody: prepared.rawBody as Prisma.InputJsonValue,
        errorMessage: parsed.error.issues[0]?.message ?? 'Validation error',
      },
    });
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const payload = parsed.data.supplier;
  const companyResult = await verifyIntegrationCompany({
    credentialCompanyId: prepared.cred.companyId,
    credentialId: prepared.cred.id,
    idempotencyKey: prepared.idempotencyKey,
    requestHash: prepared.requestHash,
    rawBody: prepared.rawBody,
    companyExternalId: parsed.data.companyExternalId,
    entityType: 'supplier',
    entityKey: payload.externalPartyId != null ? String(payload.externalPartyId) : payload.name,
  });
  if (!companyResult.ok) return companyResult.response;

  try {
    const result = await processSupplierUpsert({
      companyId: companyResult.company.id,
      credentialId: prepared.cred.id,
      payload,
    });

    await prisma.integrationSyncLog.create({
      data: {
        companyId: companyResult.company.id,
        credentialId: prepared.cred.id,
        idempotencyKey: prepared.idempotencyKey,
        requestHash: prepared.requestHash,
        direction: 'inbound',
        entityType: 'supplier',
        entityKey: payload.externalPartyId != null ? String(payload.externalPartyId) : payload.name,
        status: 'success',
        httpStatus: result.created ? 201 : 200,
        requestBody: prepared.rawBody as Prisma.InputJsonValue,
        responseBody: result as Prisma.InputJsonValue,
      },
    });
    return successResponse(result, result.created ? 201 : 200);
  } catch (err) {
    const status = err instanceof PartySyncConflictError ? 409 : 500;
    const message = err instanceof Error ? err.message : 'Supplier integration upsert failed';
    await prisma.integrationSyncLog.create({
      data: {
        companyId: companyResult.company.id,
        credentialId: prepared.cred.id,
        idempotencyKey: prepared.idempotencyKey,
        requestHash: prepared.requestHash,
        direction: 'inbound',
        entityType: 'supplier',
        entityKey: payload.externalPartyId != null ? String(payload.externalPartyId) : payload.name,
        status: 'error',
        httpStatus: status,
        requestBody: prepared.rawBody as Prisma.InputJsonValue,
        errorMessage: message,
      },
    });
    return errorResponse(message, status);
  }
}
