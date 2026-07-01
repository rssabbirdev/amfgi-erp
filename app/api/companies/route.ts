import { randomUUID } from 'crypto';

import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID, publishLiveUpdate } from '@/lib/live-updates/server';
import { checkCompanyDeleteEligibility } from '@/lib/companies/checkCompanyDeleteEligibility';
import { ensureCompanyFallbackWarehouse, normalizeWarehouseMode } from '@/lib/warehouses/companyWarehouseMode';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                from 'zod';

/** Lowercase URL slug: letters, digits, single hyphens; empty if nothing valid remains. */
function normalizeCompanySlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const includeInactive =
    session.user.isSuperAdmin &&
    new URL(req.url).searchParams.get('includeInactive') === '1';

  const companies = await prisma.company.findMany({
    where: includeInactive
      ? { id: { not: GLOBAL_LIVE_UPDATE_COMPANY_ID } }
      : { isActive: true, id: { not: GLOBAL_LIVE_UPDATE_COMPANY_ID } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      stockFallbackWarehouse: {
        select: { id: true, name: true },
      },
    },
  });

  if (!includeInactive) {
    return successResponse(companies);
  }

  const enriched = await Promise.all(
    companies.map(async (company) => {
      const eligibility = await checkCompanyDeleteEligibility(prisma, company.id);
      return {
        ...company,
        canDelete: eligibility.canDelete,
      };
    }),
  );

  return successResponse(enriched);
}

const CreateSchema = z.object({
  name:              z.string().min(1).max(100),
  /** Optional; normalized to lowercase a-z, 0-9, hyphens. Omit or blank to derive from name. */
  slug:              z.string().max(80).optional(),
  description:       z.string().max(300).optional(),
  externalCompanyId: z.string().max(120).optional(),
  jobSourceMode:        z.enum(['HYBRID', 'EXTERNAL_ONLY', 'INTERNAL_ONLY']).optional(),
  customerSourceMode:   z.enum(['HYBRID', 'EXTERNAL_ONLY', 'INTERNAL_ONLY']).optional(),
  supplierSourceMode:   z.enum(['HYBRID', 'EXTERNAL_ONLY', 'INTERNAL_ONLY']).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);

  const body   = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const slugFromName = normalizeCompanySlug(parsed.data.name);
  const slugFromInput =
    parsed.data.slug !== undefined && parsed.data.slug.trim() !== ''
      ? normalizeCompanySlug(parsed.data.slug)
      : '';

  let slug: string;
  if (slugFromInput !== '') {
    slug = slugFromInput;
  } else if (slugFromName !== '') {
    slug = slugFromName;
  } else {
    slug = `company-${randomUUID().slice(0, 8)}`;
  }

  if (parsed.data.slug !== undefined && parsed.data.slug.trim() !== '' && slugFromInput === '') {
    return errorResponse(
      'Custom slug must contain at least one letter or digit (lowercase a–z, 0–9, hyphens only).',
      422
    );
  }

  const conflictOr = [{ slug }, { name: parsed.data.name }] as Array<Record<string, string>>;
  if (parsed.data.externalCompanyId) {
    conflictOr.push({ externalCompanyId: parsed.data.externalCompanyId });
  }
  const existing = await prisma.company.findFirst({ where: { OR: conflictOr } });
  if (existing) return errorResponse('Company with this name/slug/external id already exists', 409);

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        id: randomUUID(),
        name:        parsed.data.name,
        slug,
        description: parsed.data.description,
        externalCompanyId: parsed.data.externalCompanyId || null,
        jobSourceMode: parsed.data.jobSourceMode || 'HYBRID',
        customerSourceMode: parsed.data.customerSourceMode || 'HYBRID',
        supplierSourceMode: parsed.data.supplierSourceMode || 'HYBRID',
        warehouseMode: normalizeWarehouseMode(undefined),
        isActive:    true,
      },
    });

    await ensureCompanyFallbackWarehouse(tx, created.id);

    return tx.company.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        stockFallbackWarehouse: {
          select: { id: true, name: true },
        },
      },
    });
  });

  publishLiveUpdate({
    companyId: GLOBAL_LIVE_UPDATE_COMPANY_ID,
    channel: 'admin',
    entity: 'company',
    action: 'created',
  });
  return successResponse(company, 201);
}
