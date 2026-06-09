import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  allowanceTypeId: z.string().min(1),
  amount: z.number().min(0),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const rows = await prisma.employeeAllowance.findMany({
    where: { companyId, employeeId },
    include: {
      allowanceType: { select: { id: true, name: true, code: true, isActive: true } },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });

  return successResponse(
    rows.map((row) => ({
      id: row.id,
      allowanceTypeId: row.allowanceTypeId,
      allowanceType: row.allowanceType,
      amount: Number(row.amount),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
      notes: row.notes,
    }))
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const allowanceType = await prisma.allowanceType.findFirst({
    where: { id: parsed.data.allowanceTypeId, companyId, isActive: true },
  });
  if (!allowanceType) return errorResponse('Allowance type not found or inactive', 404);

  let effectiveFrom: Date;
  let effectiveTo: Date | null = null;
  try {
    effectiveFrom = dateFromYmd(ymdFromInput(parsed.data.effectiveFrom));
    if (parsed.data.effectiveTo) effectiveTo = dateFromYmd(ymdFromInput(parsed.data.effectiveTo));
  } catch {
    return errorResponse('Invalid date', 400);
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return errorResponse('Effective to must be on or after effective from', 422);
  }

  const row = await prisma.employeeAllowance.create({
    data: {
      companyId,
      employeeId,
      allowanceTypeId: allowanceType.id,
      amount: parsed.data.amount,
      effectiveFrom,
      effectiveTo,
      notes: parsed.data.notes?.trim() || null,
    },
    include: {
      allowanceType: { select: { id: true, name: true, code: true, isActive: true } },
    },
  });

  return successResponse(
    {
      id: row.id,
      allowanceTypeId: row.allowanceTypeId,
      allowanceType: row.allowanceType,
      amount: Number(row.amount),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
      notes: row.notes,
    },
    201
  );
}
