import { prisma } from '@/lib/db/prisma';
import { getLeaveManagementStats } from '@/lib/hr/leaveRequestService';
import { P } from '@/lib/permissions';
import { hasPerm, requireCompanySession } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (
    !hasPerm(session.user, P.HR_LEAVE_VIEW) &&
    !hasPerm(session.user, P.HR_LEAVE_APPROVE) &&
    !hasPerm(session.user, P.HR_LEAVE_EDIT) &&
    !hasPerm(session.user, P.HR_LEAVE_DELETE)
  ) {
    return errorResponse('Forbidden', 403);
  }

  const stats = await getLeaveManagementStats(prisma, companyId);
  return successResponse(stats);
}
