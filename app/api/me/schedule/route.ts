import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company', 400);

  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee for this company', 403);

  const { searchParams } = new URL(req.url);
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');
  if (!fromRaw || !toRaw) return errorResponse('from and to query params required (YYYY-MM-DD)', 400);

  let fromY: string;
  let toY: string;
  try {
    fromY = ymdFromInput(fromRaw);
    toY = ymdFromInput(toRaw);
  } catch {
    return errorResponse('Invalid date', 400);
  }

  const employeeId = emp.id;
  const companyId = session.user.activeCompanyId;

  const schedules = await prisma.workSchedule.findMany({
    where: {
      companyId,
      workDate: { gte: dateFromYmd(fromY), lte: dateFromYmd(toY) },
      OR: [
        { assignments: { some: { members: { some: { employeeId } } } } },
        { assignments: { some: { teamLeaderEmployeeId: employeeId } } },
        { assignments: { some: { driver1EmployeeId: employeeId } } },
        { assignments: { some: { driver2EmployeeId: employeeId } } },
        { absences: { some: { employeeId } } },
      ],
    },
    orderBy: { workDate: 'asc' },
    include: {
      assignments: {
        orderBy: { columnIndex: 'asc' },
        include: {
          members: { where: { employeeId } },
          job: { select: { jobNumber: true, site: true } },
        },
      },
      absences: { where: { employeeId } },
    },
  });

  return successResponse(schedules);
}
