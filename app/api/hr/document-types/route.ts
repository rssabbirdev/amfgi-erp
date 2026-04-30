import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { ensureDefaultEmployeeDocumentTypes } from '@/lib/hr/defaultDocumentTypes';
import { hasPerm, requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i, 'Slug: letters, numbers, hyphen'),
  requiresVisaPeriod: z.boolean().optional(),
  requiresExpiry: z.boolean().optional(),
  defaultAlertDaysBeforeExpiry: z.number().int().min(0).max(3650).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!hasPerm(session.user, P.HR_SETTINGS_DOC_TYPES) && !hasPerm(session.user, P.HR_DOCUMENT_VIEW)) {
    return errorResponse('Forbidden', 403);
  }

  const list = await prisma.employeeDocumentType.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return successResponse(list);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SETTINGS_DOC_TYPES)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  try {
    const row = await prisma.employeeDocumentType.create({
      data: {
        companyId,
        name: d.name.trim(),
        slug: d.slug.trim().toLowerCase(),
        requiresVisaPeriod: d.requiresVisaPeriod ?? false,
        requiresExpiry: d.requiresExpiry ?? true,
        defaultAlertDaysBeforeExpiry: d.defaultAlertDaysBeforeExpiry ?? 30,
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive ?? true,
      },
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'document-type',
      action: 'created',
    });
    return successResponse(row, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Duplicate slug for this company', 409);
    }
    throw e;
  }
}

/** Idempotent: upserts catalog types from `lib/hr/defaultDocumentTypes`. */
export async function PUT() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SETTINGS_DOC_TYPES)) return errorResponse('Forbidden', 403);

  await ensureDefaultEmployeeDocumentTypes(prisma, companyId);
  const list = await prisma.employeeDocumentType.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'document-type',
    action: 'changed',
  });
  return successResponse(list);
}
