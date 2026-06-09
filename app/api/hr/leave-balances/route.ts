import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { getOrCreateLeaveBalance, remainingLeaveDays } from '@/lib/hr/leaveBalance';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UpsertSchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  entitlementDays: z.number().min(0).max(365),
  adjustedDays: z.number().min(-365).max(365).optional(),
});

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_LEAVE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year') ?? new Date().getFullYear());
  const employeeId = searchParams.get('employeeId');

  const rows = await prisma.leaveBalance.findMany({
    where: {
      companyId,
      year,
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
    },
    orderBy: { employee: { fullName: 'asc' } },
  });

  return successResponse(
    rows.map((row) => ({
      ...row,
      remainingDays: remainingLeaveDays(row),
    }))
  );
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_LEAVE_APPROVE)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const balance = await getOrCreateLeaveBalance(
    prisma,
    companyId,
    parsed.data.employeeId,
    parsed.data.year
  );

  const row = await prisma.leaveBalance.update({
    where: { id: balance.id },
    data: {
      entitlementDays: parsed.data.entitlementDays,
      ...(parsed.data.adjustedDays !== undefined ? { adjustedDays: parsed.data.adjustedDays } : {}),
    },
    include: {
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
    },
  });

  return successResponse({ ...row, remainingDays: remainingLeaveDays(row) });
}
