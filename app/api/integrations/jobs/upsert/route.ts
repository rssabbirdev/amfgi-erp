import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { resolveApiCredentialByKey } from '@/lib/integrations/apiKeys';
import { integrationDomainCheck } from '@/lib/integrations/domainAllowlist';
import {
  JobSyncConflictError,
  JobSyncReferenceError,
  UpsertJobSchema,
  processJobUpsert,
} from '@/lib/integrations/jobSyncService';

function readApiKey(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const apiKey = req.headers.get('x-api-key')?.trim();
  return apiKey || null;
}

function readIdempotencyKey(req: Request): string | null {
  const v = req.headers.get('x-idempotency-key')?.trim();
  return v || null;
}

function parseRequestBody(rawBodyText: string): { ok: true; data: unknown } | { ok: false } {
  if (!rawBodyText.trim()) return { ok: true, data: null };
  try {
    return { ok: true, data: JSON.parse(rawBodyText) as unknown };
  } catch {
    return { ok: false };
  }
}

export async function POST(req: Request) {
  const rawBodyText = await req.text();
  const requestHash = createHash('sha256').update(rawBodyText).digest('hex');
  const idempotencyKey = readIdempotencyKey(req);

  const apiKey = readApiKey(req);
  if (!apiKey) return errorResponse('Missing API key', 401);

  const cred = await resolveApiCredentialByKey(apiKey);
  if (!cred) return errorResponse('Invalid API key', 401);

  const domainCheck = integrationDomainCheck(req, cred.allowedDomains);
  if (!domainCheck.ok) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: cred.companyId,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType: 'job',
        status: 'forbidden',
        httpStatus: 403,
        requestBody: (() => {
          try {
            return JSON.parse(rawBodyText) as object;
          } catch {
            return { _invalidJson: true, snippet: rawBodyText.slice(0, 400) };
          }
        })(),
        errorMessage: domainCheck.reason,
      },
    });
    return errorResponse(domainCheck.reason, 403);
  }

  const parsedBody = parseRequestBody(rawBodyText);
  if (!parsedBody.ok) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: cred.companyId,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType: 'job',
        status: 'validation_error',
        httpStatus: 422,
        requestBody: { _invalidJson: true, snippet: rawBodyText.slice(0, 500) },
        errorMessage: 'Invalid JSON body',
      },
    });
    return errorResponse('Invalid JSON body', 422);
  }

  const rawBody = parsedBody.data;

  if (idempotencyKey) {
    const prior = await prisma.integrationSyncLog.findFirst({
      where: { companyId: cred.companyId, idempotencyKey },
      orderBy: { createdAt: 'desc' },
    });
    if (prior) {
      if (prior.status === 'success' && prior.responseBody) {
        return successResponse(
          { ...(prior.responseBody as Record<string, unknown>), replayed: true },
          prior.httpStatus ?? 200
        );
      }
      return errorResponse(prior.errorMessage || 'Duplicate idempotent request', prior.httpStatus ?? 409);
    }
  }

  const parsed = UpsertJobSchema.safeParse(rawBody);
  if (!parsed.success) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: cred.companyId,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType: 'job',
        status: 'validation_error',
        httpStatus: 422,
        requestBody: rawBody as Prisma.InputJsonValue,
        errorMessage: parsed.error.issues[0]?.message ?? 'Validation error',
      },
    });
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const company = await prisma.company.findFirst({
    where: { id: cred.companyId, externalCompanyId: parsed.data.companyExternalId },
    select: { id: true },
  });
  if (!company) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: cred.companyId,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType: 'job',
        entityKey: parsed.data.job.externalJobId,
        status: 'forbidden',
        httpStatus: 403,
        requestBody: rawBody as Prisma.InputJsonValue,
        errorMessage: 'Company external id does not match this API key',
      },
    });
    return errorResponse('Company external id does not match this API key', 403);
  }

  const payload = parsed.data.job;

  try {
    const result = await processJobUpsert({
      companyId: company.id,
      credentialId: cred.id,
      payload,
    });

    await prisma.integrationSyncLog.create({
      data: {
        companyId: company.id,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType: 'job',
        entityKey: payload.externalJobId,
        status: 'success',
        httpStatus: result.created ? 201 : 200,
        requestBody: rawBody as Prisma.InputJsonValue,
        responseBody: result as Prisma.InputJsonValue,
      },
    });
    return successResponse(result, result.created ? 201 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Integration upsert failed';
    const conflict = err instanceof JobSyncConflictError;
    const badRef = err instanceof JobSyncReferenceError;
    const status = conflict ? 409 : badRef ? 400 : 500;
    await prisma.integrationSyncLog.create({
      data: {
        companyId: company.id,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType: 'job',
        entityKey: payload.externalJobId,
        status: 'error',
        httpStatus: status,
        requestBody: rawBody as Prisma.InputJsonValue,
        errorMessage: message,
      },
    });
    return errorResponse(message, status);
  }
}
