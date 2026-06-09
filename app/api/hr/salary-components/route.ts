import { prisma } from '@/lib/db/prisma';
import { ensureDefaultAllowanceTypes } from '@/lib/hr/payroll/seedAllowanceTypes';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ComponentKindSchema = z.enum(['EARNING', 'DEDUCTION']);
const ApplicationModeSchema = z.enum(['FIXED_MONTHLY', 'ATTENDANCE_PRESENT']);

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_]+$/i),
  description: z.string().max(500).optional().nullable(),
  componentKind: ComponentKindSchema.optional(),
  applicationMode: ApplicationModeSchema.optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  await ensureDefaultAllowanceTypes(prisma, companyId);

  const rows = await prisma.allowanceType.findMany({
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
  const duplicate = await prisma.allowanceType.findFirst({ where: { companyId, code } });
  if (duplicate) return errorResponse(`Salary component code "${code}" already exists`, 409);

  const row = await prisma.allowanceType.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      code,
      description: parsed.data.description?.trim() || null,
      componentKind: parsed.data.componentKind ?? 'EARNING',
      applicationMode: parsed.data.applicationMode ?? 'ATTENDANCE_PRESENT',
      sortOrder: parsed.data.sortOrder ?? 100,
      isActive: parsed.data.isActive ?? true,
    },
  });
  return successResponse(row, 201);
}
