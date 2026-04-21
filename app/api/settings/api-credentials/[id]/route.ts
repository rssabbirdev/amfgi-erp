import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { normalizeAllowedDomainsList, parseStoredAllowedDomains } from '@/lib/integrations/domainAllowlist';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const PatchCredentialSchema = z.object({
  label: z.string().min(2).max(120).optional(),
  /** Omit = leave unchanged; [] or null = clear restriction. */
  allowedDomains: z.union([z.array(z.string()).max(40), z.null()]).optional(),
});

function hasManagePermission(user: AppSessionUser) {
  const isSA = user.isSuperAdmin ?? false;
  const perms = (user.permissions ?? []) as string[];
  return isSA || perms.includes('settings.manage');
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasManagePermission(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await ctx.params;
  const row = await prisma.apiCredential.findFirst({
    where: { id, companyId: session.user.activeCompanyId, revokedAt: null },
    select: { id: true },
  });
  if (!row) return errorResponse('Credential not found', 404);

  const body = await req.json().catch(() => null);
  const parsed = PatchCredentialSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const data: Prisma.ApiCredentialUpdateInput = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label.trim();
  if (parsed.data.allowedDomains !== undefined) {
    if (parsed.data.allowedDomains === null) {
      data.allowedDomains = Prisma.DbNull;
    } else {
      const domains = normalizeAllowedDomainsList(parsed.data.allowedDomains);
      data.allowedDomains = domains.length > 0 ? domains : Prisma.DbNull;
    }
  }

  if (Object.keys(data).length === 0) {
    return errorResponse('No fields to update', 422);
  }

  const updated = await prisma.apiCredential.update({
    where: { id: row.id },
    data,
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      allowedDomains: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return successResponse({
    ...updated,
    allowedDomains: parseStoredAllowedDomains(updated.allowedDomains),
  });
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasManagePermission(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await ctx.params;
  const row = await prisma.apiCredential.findFirst({
    where: { id, companyId: session.user.activeCompanyId },
    select: { id: true },
  });
  if (!row) return errorResponse('Credential not found', 404);

  await prisma.apiCredential.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
  return successResponse({ revoked: true });
}
