import { regenerateAttendanceBoilerplate } from '@/lib/hr/generateAttendanceFromSchedule';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

/** Rebuilds draft boilerplate rows from the current published schedule. */
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

  try {
    await regenerateAttendanceBoilerplate(prisma, id);
    const count = await prisma.attendanceEntry.count({
      where: { companyId, workDate: sch.workDate },
    });
    return successResponse({ ok: true, attendanceRows: count });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Failed', 500);
  }
}
