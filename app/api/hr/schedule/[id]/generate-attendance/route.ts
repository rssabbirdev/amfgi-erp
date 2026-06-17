import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

/** Legacy endpoint — attendance rows are created only when saving the day sheet. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id, companyId },
    select: { id: true, status: true, workDate: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  if (sch.status !== 'PUBLISHED') return errorResponse('Schedule must be published', 400);

  return successResponse({
    ok: true,
    workDate: sch.workDate,
    message: 'Open the attendance day sheet and save to create rows. This endpoint no longer writes attendance automatically.',
  });
}
