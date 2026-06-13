import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { EMPLOYEE_META_KINDS, parseEmployeeMetaKind } from '@/lib/hr/employeeMetaOptions';
import { P } from '@/lib/permissions';
import { hasPerm, requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  kind: z.enum(EMPLOYEE_META_KINDS),
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!hasPerm(session.user, P.HR_EMPLOYEE_VIEW) && !hasPerm(session.user, P.HR_EMPLOYEE_EDIT)) {
    return errorResponse('Forbidden', 403);
  }

  const kind = parseEmployeeMetaKind(new URL(req.url).searchParams.get('kind'));
  const activeOnly = new URL(req.url).searchParams.get('activeOnly') === '1';

  const rows = await prisma.employeeMetaOption.findMany({
    where: {
      companyId,
      ...(kind ? { kind } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  return successResponse(rows);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const row = await prisma.employeeMetaOption.create({
      data: {
        companyId,
        kind: parsed.data.kind,
        name: parsed.data.name.trim(),
        sortOrder: parsed.data.sortOrder ?? 0,
        isActive: parsed.data.isActive ?? true,
      },
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'employee_meta_option',
      action: 'created',
    });
    return successResponse(row, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Option already exists for this category', 409);
    }
    throw e;
  }
}
