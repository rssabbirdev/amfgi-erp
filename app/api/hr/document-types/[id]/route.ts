import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i).optional(),
  requiresVisaPeriod: z.boolean().optional(),
  requiresExpiry: z.boolean().optional(),
  defaultAlertDaysBeforeExpiry: z.number().int().min(0).max(3650).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SETTINGS_DOC_TYPES)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeDocumentType.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const data: Prisma.EmployeeDocumentTypeUpdateInput = {};
  if (d.name !== undefined) data.name = d.name.trim();
  if (d.slug !== undefined) data.slug = d.slug.trim().toLowerCase();
  if (d.requiresVisaPeriod !== undefined) data.requiresVisaPeriod = d.requiresVisaPeriod;
  if (d.requiresExpiry !== undefined) data.requiresExpiry = d.requiresExpiry;
  if (d.defaultAlertDaysBeforeExpiry !== undefined) data.defaultAlertDaysBeforeExpiry = d.defaultAlertDaysBeforeExpiry;
  if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder;
  if (d.isActive !== undefined) data.isActive = d.isActive;

  try {
    const row = await prisma.employeeDocumentType.update({ where: { id }, data });
    return successResponse(row);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Duplicate slug for this company', 409);
    }
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SETTINGS_DOC_TYPES)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeDocumentType.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const used = await prisma.employeeDocument.count({ where: { documentTypeId: id } });
  if (used > 0) {
    return errorResponse(
      `Cannot delete: ${used} employee document(s) still use this type. Remove or reassign them first, or deactivate the type instead.`,
      409,
    );
  }

  await prisma.employeeDocumentType.delete({ where: { id } });
  return successResponse({ ok: true });
}
