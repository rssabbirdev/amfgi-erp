import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { generateIntegrationApiKey } from '@/lib/integrations/apiKeys';
import { normalizeAllowedDomainsList, parseStoredAllowedDomains } from '@/lib/integrations/domainAllowlist';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const CreateCredentialSchema = z.object({
  label: z.string().min(2).max(120),
  /** Hostnames (or https URLs) allowed to call integration APIs; empty = no restriction. */
  allowedDomains: z.array(z.string()).max(40).optional(),
});

function hasManagePermission(user: AppSessionUser) {
  const isSA = user.isSuperAdmin ?? false;
  const perms = (user.permissions ?? []) as string[];
  return isSA || perms.includes('settings.manage');
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasManagePermission(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const rows = await prisma.apiCredential.findMany({
    where: { companyId: session.user.activeCompanyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      allowedDomains: true,
      lastUsedAt: true,
      revokedAt: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return successResponse(
    rows.map((r) => ({
      ...r,
      allowedDomains: parseStoredAllowedDomains(r.allowedDomains),
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasManagePermission(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json().catch(() => null);
  const parsed = CreateCredentialSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const domains = normalizeAllowedDomainsList(parsed.data.allowedDomains ?? []);

  const { plainTextKey, keyPrefix, keyHash } = generateIntegrationApiKey();
  const created = await prisma.apiCredential.create({
    data: {
      companyId: session.user.activeCompanyId,
      label: parsed.data.label.trim(),
      keyPrefix,
      keyHash,
      ...(domains.length > 0 ? { allowedDomains: domains as unknown as Prisma.InputJsonValue } : {}),
      scopes: ['jobs:upsert'],
      createdBy: session.user.id,
    },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      createdAt: true,
    },
  });

  return successResponse(
    {
      ...created,
      key: plainTextKey,
      allowedDomains: domains,
      hint: 'Store the API key now. It will not be shown again.',
    },
    201
  );
}
