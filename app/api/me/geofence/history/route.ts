import { prisma } from '@/lib/db/prisma';
import { requireEmployeeApiAuth } from '@/lib/hr/mobileAccess';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const authCtx = await requireEmployeeApiAuth(req);
  if (!authCtx.ok) return errorResponse(authCtx.error, authCtx.status);

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 50;
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');

  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (fromRaw) {
    try {
      fromDate = dateFromYmd(ymdFromInput(fromRaw));
    } catch {
      return errorResponse('Invalid from date', 400);
    }
  }
  if (toRaw) {
    try {
      toDate = dateFromYmd(ymdFromInput(toRaw));
    } catch {
      return errorResponse('Invalid to date', 400);
    }
  }

  const events = await prisma.geofenceAttendanceEvent.findMany({
    where: {
      companyId: authCtx.companyId,
      employeeId: authCtx.employeeId,
      ...(fromDate || toDate
        ? {
            workDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    select: {
      id: true,
      workDate: true,
      eventType: true,
      validationStatus: true,
      latitude: true,
      longitude: true,
      accuracyMeters: true,
      distanceToGateMeters: true,
      insidePolygon: true,
      withinGateRadius: true,
      devicePlatform: true,
      deviceIdentifier: true,
      notes: true,
      occurredAt: true,
      zone: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return successResponse({
    employee: authCtx.employee,
    events,
  });
}
