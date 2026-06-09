import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm, hasPerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!hasPerm(session.user, P.HR_LEAVE_VIEW) && !hasPerm(session.user, P.HR_LEAVE_APPROVE)) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const employeeId = searchParams.get('employeeId');
  const workDateRaw = searchParams.get('workDate');

  let workDateFilter: { startDate?: { lte: Date }; endDate?: { gte: Date } } = {};
  if (workDateRaw) {
    try {
      const d = dateFromYmd(ymdFromInput(workDateRaw));
      workDateFilter = { startDate: { lte: d }, endDate: { gte: d } };
    } catch {
      return errorResponse('Invalid workDate', 400);
    }
  }

  const rows = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      ...workDateFilter,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
      reviewedBy: { select: { id: true, name: true } },
      leaveTypeRef: { select: { id: true, name: true, code: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
  });
  return successResponse(rows);
}
