import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  workDate: z.string().min(1),
  action: z.enum(['submit', 'approve']),
});

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  if (parsed.data.action === 'submit') {
    if (!requirePerm(session.user, P.HR_ATTENDANCE_EDIT)) return errorResponse('Forbidden', 403);
    const result = await prisma.attendanceEntry.updateMany({
      where: { companyId, workDate, workflowStatus: 'DRAFT' },
      data: { workflowStatus: 'SUBMITTED' },
    });
    return successResponse({ updated: result.count });
  }

  if (!requirePerm(session.user, P.HR_ATTENDANCE_APPROVE)) return errorResponse('Forbidden', 403);
  const result = await prisma.attendanceEntry.updateMany({
    where: {
      companyId,
      workDate,
      workflowStatus: { in: ['DRAFT', 'SUBMITTED'] },
    },
    data: {
      workflowStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedById: session.user.id,
    },
  });
  return successResponse({ updated: result.count });
}
