import { prisma } from '@/lib/db/prisma';
import { requireEmployeeApiAuth } from '@/lib/hr/mobileAccess';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const authCtx = await requireEmployeeApiAuth(req);
  if (!authCtx.ok) return errorResponse(authCtx.error, authCtx.status);

  const zones = await prisma.geofenceZone.findMany({
    where: {
      companyId: authCtx.companyId,
      isActive: true,
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      polygonPoints: true,
      gateLat: true,
      gateLng: true,
      gateRadiusMeters: true,
      centerLat: true,
      centerLng: true,
      updatedAt: true,
    },
  });

  return successResponse({
    employee: {
      id: authCtx.employee.id,
      fullName: authCtx.employee.fullName,
      employeeCode: authCtx.employee.employeeCode,
    },
    zones,
  });
}
