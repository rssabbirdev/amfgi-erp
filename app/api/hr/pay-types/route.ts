import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { ensureDefaultPayTypes } from '@/lib/hr/payroll/seedPayTypes';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_]+$/i),
  config: z.record(z.string(), z.unknown()),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  await ensureDefaultPayTypes(prisma, companyId);

  const rows = await prisma.payType.findMany({
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

  try {
    parsePayTypeConfig(parsed.data.config);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Invalid pay type config', 422);
  }

  const code = parsed.data.code.trim().toUpperCase();
  const duplicate = await prisma.payType.findFirst({ where: { companyId, code } });
  if (duplicate) return errorResponse(`Pay type code "${code}" already exists`, 409);

  const row = await prisma.payType.create({
    data: {
      companyId,
      name: parsed.data.name.trim(),
      code,
      config: parsed.data.config as Prisma.InputJsonValue,
      sortOrder: parsed.data.sortOrder ?? 100,
      isSystem: false,
    },
  });
  return successResponse(row, 201);
}
