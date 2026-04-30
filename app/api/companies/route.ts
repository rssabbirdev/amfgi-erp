import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID, publishLiveUpdate } from '@/lib/live-updates/server';
import { ensureCompanyFallbackWarehouse, normalizeWarehouseMode } from '@/lib/warehouses/companyWarehouseMode';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                from 'zod';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      stockFallbackWarehouse: {
        select: { id: true, name: true },
      },
    },
  });

  return successResponse(companies);
}

const CreateSchema = z.object({
  name:              z.string().min(1).max(100),
  description:       z.string().max(300).optional(),
  externalCompanyId: z.string().max(120).optional(),
  jobSourceMode:     z.enum(['HYBRID', 'EXTERNAL_ONLY']).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);

  const body   = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const slug = parsed.data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const conflictOr = [{ slug }, { name: parsed.data.name }] as Array<Record<string, string>>;
  if (parsed.data.externalCompanyId) {
    conflictOr.push({ externalCompanyId: parsed.data.externalCompanyId });
  }
  const existing = await prisma.company.findFirst({ where: { OR: conflictOr } });
  if (existing) return errorResponse('Company with this name/slug/external id already exists', 409);

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name:        parsed.data.name,
        slug,
        description: parsed.data.description,
        externalCompanyId: parsed.data.externalCompanyId || null,
        jobSourceMode: parsed.data.jobSourceMode || 'HYBRID',
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
