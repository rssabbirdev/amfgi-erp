import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ComponentKindSchema = z.enum(['EARNING', 'DEDUCTION']);
const ApplicationModeSchema = z.enum(['FIXED_MONTHLY', 'ATTENDANCE_PRESENT']);

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  componentKind: ComponentKindSchema.optional(),
  applicationMode: ApplicationModeSchema.optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const existing = await prisma.allowanceType.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const row = await prisma.allowanceType.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description?.trim() || null }
        : {}),
      ...(parsed.data.componentKind !== undefined
        ? { componentKind: parsed.data.componentKind }
        : {}),
      ...(parsed.data.applicationMode !== undefined
        ? { applicationMode: parsed.data.applicationMode }
        : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });
  return successResponse(row);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.allowanceType.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const inUse = await prisma.employeeAllowance.count({
    where: { companyId, allowanceTypeId: id },
  });
  if (inUse > 0) {
    return errorResponse(
      `Cannot delete: ${inUse} employee record(s) use this component. Deactivate instead.`,
      409
    );
  }

  await prisma.allowanceType.delete({ where: { id } });
  return successResponse({ deleted: true });
}
