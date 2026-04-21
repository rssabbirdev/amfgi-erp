import { prisma } from '@/lib/db/prisma';
import { runScheduleCsvImport } from '@/lib/hr/runScheduleCsvImport';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  csvText: z.string().min(10),
  workDateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: scheduleId } = await params;

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const result = await runScheduleCsvImport(prisma, {
    companyId,
    scheduleId,
    csvText: parsed.data.csvText,
    workDateYmdOverride: parsed.data.workDateYmd,
  });

  if (result.error === 'NOT_FOUND') return errorResponse('Not found', 404);
  if (result.error === 'LOCKED') return errorResponse('Schedule is locked', 403);
  if (result.error === 'PARSE') return errorResponse(result.message ?? 'CSV parse failed', 422);
  if (result.error === 'DATE_MISMATCH') return errorResponse('CSV date does not match this schedule work date', 422);

  return successResponse({ schedule: result.schedule, warnings: result.warnings });
}
