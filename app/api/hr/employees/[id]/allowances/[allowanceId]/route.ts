import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  amount: z.number().min(0).optional(),
  effectiveFrom: z.string().min(1).optional(),
  effectiveTo: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; allowanceId: string }> }
) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) return errorResponse('Forbidden', 403);
  const { id: employeeId, allowanceId } = await params;

  const existing = await prisma.employeeAllowance.findFirst({
    where: { id: allowanceId, companyId, employeeId },
  });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let effectiveFrom = existing.effectiveFrom;
  let effectiveTo = existing.effectiveTo;
  try {
    if (parsed.data.effectiveFrom) effectiveFrom = dateFromYmd(ymdFromInput(parsed.data.effectiveFrom));
    if (parsed.data.effectiveTo !== undefined) {
      effectiveTo = parsed.data.effectiveTo
        ? dateFromYmd(ymdFromInput(parsed.data.effectiveTo))
        : null;
    }
  } catch {
    return errorResponse('Invalid date', 400);
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return errorResponse('Effective to must be on or after effective from', 422);
  }

  const row = await prisma.employeeAllowance.update({
    where: { id: allowanceId },
    data: {
      ...(parsed.data.amount !== undefined ? { amount: parsed.data.amount } : {}),
      effectiveFrom,
      effectiveTo,
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes?.trim() || null } : {}),
    },
    include: {
      allowanceType: { select: { id: true, name: true, code: true, isActive: true } },
    },
  });

  return successResponse({
    id: row.id,
    allowanceTypeId: row.allowanceTypeId,
    allowanceType: row.allowanceType,
    amount: Number(row.amount),
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    notes: row.notes,
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; allowanceId: string }> }
) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) return errorResponse('Forbidden', 403);
  const { id: employeeId, allowanceId } = await params;

  const existing = await prisma.employeeAllowance.findFirst({
    where: { id: allowanceId, companyId, employeeId },
  });
  if (!existing) return errorResponse('Not found', 404);

  await prisma.employeeAllowance.delete({ where: { id: allowanceId } });
  return successResponse({ deleted: true });
}
