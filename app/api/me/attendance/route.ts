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

  const rows = await prisma.attendanceEntry.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      employeeId: emp.id,
      workDate: { gte: dateFromYmd(fromY), lte: dateFromYmd(toY) },
    },
    include: {
      workAssignment: {
        select: {
          label: true,
          jobNumberSnapshot: true,
          locationType: true,
          factoryCode: true,
          factoryLabel: true,
          siteNameSnapshot: true,
          clientNameSnapshot: true,
          job: {
            select: {
              jobNumber: true,
              site: true,
              projectName: true,
              customer: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { workDate: 'desc' },
    take: 500,
  });

  return successResponse(rows);
}
