import { prisma } from '@/lib/db/prisma';
import { LeaveTypeRulesSchema } from '@/lib/hr/leaveTypeRules';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_]+$/i),
  description: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  rules: LeaveTypeRulesSchema.optional(),
});

function canViewLeaveTypes(user: { isSuperAdmin?: boolean; permissions?: string[] }) {
  if (user.isSuperAdmin) return true;
  const perms = user.permissions ?? [];
  return (
    perms.includes(P.HR_PAYROLL_SETTINGS) ||
    perms.includes(P.HR_ATTENDANCE_VIEW) ||
    perms.includes(P.HR_ATTENDANCE_EDIT)
  );
}

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId, session } = ctx;
  if (!canViewLeaveTypes(session.user)) return errorResponse('Forbidden', 403);

  await ensureLeaveTypesReady(prisma, companyId);

  const rows = await prisma.leaveType.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return successResponse(rows);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const code = parsed.data.code.trim().toUpperCase();
  const duplicate = await prisma.leaveType.findFirst({ where: { companyId, code } });
  if (duplicate) return errorResponse(`Leave type code "${code}" already exists`, 409);

  const row = await prisma.leaveType.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      code,
      description: parsed.data.description?.trim() || null,
      sortOrder: parsed.data.sortOrder ?? 100,
      isActive: parsed.data.isActive ?? true,
      rules: parsed.data.rules ?? {},
    },
  });
  return successResponse(row, 201);
}
