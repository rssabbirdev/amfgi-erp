import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveApiCredentialByKey } from '@/lib/integrations/apiKeys';
import { integrationDomainCheck } from '@/lib/integrations/domainAllowlist';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export function readIntegrationApiKey(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return req.headers.get('x-api-key')?.trim() || null;
}

export function readIntegrationIdempotencyKey(req: Request): string | null {
  return req.headers.get('x-idempotency-key')?.trim() || null;
}

export function parseIntegrationBody(rawBodyText: string): { ok: true; data: unknown } | { ok: false } {
  if (!rawBodyText.trim()) return { ok: true, data: null };
  try {
    return { ok: true, data: JSON.parse(rawBodyText) as unknown };
  } catch {
    return { ok: false };
  }
}

export async function prepareIntegrationRequest(req: Request, entityType: string) {
  const rawBodyText = await req.text();
  const requestHash = createHash('sha256').update(rawBodyText).digest('hex');
  const idempotencyKey = readIntegrationIdempotencyKey(req);
  const apiKey = readIntegrationApiKey(req);
  if (!apiKey) return { ok: false as const, response: errorResponse('Missing API key', 401) };

  const cred = await resolveApiCredentialByKey(apiKey);
  if (!cred) return { ok: false as const, response: errorResponse('Invalid API key', 401) };

  const domainCheck = integrationDomainCheck(req, cred.allowedDomains);
  if (!domainCheck.ok) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: cred.companyId,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType,
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
    return { ok: false as const, response: errorResponse(domainCheck.reason, 403) };
  }

  const parsedBody = parseIntegrationBody(rawBodyText);
  if (!parsedBody.ok) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: cred.companyId,
        credentialId: cred.id,
        idempotencyKey,
        requestHash,
        direction: 'inbound',
        entityType,
        status: 'validation_error',
        httpStatus: 422,
        requestBody: { _invalidJson: true, snippet: rawBodyText.slice(0, 500) },
        errorMessage: 'Invalid JSON body',
      },
    });
    return { ok: false as const, response: errorResponse('Invalid JSON body', 422) };
  }

  if (idempotencyKey) {
    const prior = await prisma.integrationSyncLog.findFirst({
      where: { companyId: cred.companyId, idempotencyKey },
      orderBy: { createdAt: 'desc' },
    });
    if (prior) {
      if (prior.status === 'success' && prior.responseBody) {
        return {
          ok: false as const,
          response: successResponse(
            { ...(prior.responseBody as Record<string, unknown>), replayed: true },
            prior.httpStatus ?? 200
          ),
        };
      }
      return {
        ok: false as const,
        response: errorResponse(prior.errorMessage || 'Duplicate idempotent request', prior.httpStatus ?? 409),
      };
    }
  }

  return { ok: true as const, cred, idempotencyKey, requestHash, rawBody: parsedBody.data };
}

export async function verifyIntegrationCompany(params: {
  credentialCompanyId: string;
  credentialId: string;
  idempotencyKey: string | null;
  requestHash: string;
  rawBody: unknown;
  companyExternalId: string;
  entityType: string;
  entityKey?: string | null;
}) {
  const company = await prisma.company.findFirst({
    where: { id: params.credentialCompanyId, externalCompanyId: params.companyExternalId },
    select: { id: true },
  });
  if (company) return { ok: true as const, company };

  await prisma.integrationSyncLog.create({
    data: {
      companyId: params.credentialCompanyId,
      credentialId: params.credentialId,
      idempotencyKey: params.idempotencyKey,
      requestHash: params.requestHash,
      direction: 'inbound',
      entityType: params.entityType,
      entityKey: params.entityKey ?? null,
      status: 'forbidden',
      httpStatus: 403,
      requestBody: params.rawBody as Prisma.InputJsonValue,
      errorMessage: 'Company external id does not match this API key',
    },
  });
  return { ok: false as const, response: errorResponse('Company external id does not match this API key', 403) };
}
