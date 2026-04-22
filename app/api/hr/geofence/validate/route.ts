import { prisma } from '@/lib/db/prisma';
import { normalizePolygonPoints, validateGeofencePoint } from '@/lib/hr/geofence';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ValidateSchema = z.object({
  zoneId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_GEOFENCE_VIEW)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = ValidateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const zone = await prisma.geofenceZone.findFirst({
    where: { id: parsed.data.zoneId, companyId, isActive: true },
    select: {
      id: true,
      name: true,
      polygonPoints: true,
      gateLat: true,
      gateLng: true,
      gateRadiusMeters: true,
    },
  });
  if (!zone) return errorResponse('Active geofence zone not found', 404);

  const result = validateGeofencePoint({
    point: { lat: parsed.data.latitude, lng: parsed.data.longitude },
    polygon: normalizePolygonPoints(zone.polygonPoints),
    gate: { lat: zone.gateLat, lng: zone.gateLng },
    gateRadiusMeters: zone.gateRadiusMeters,
  });

  return successResponse({
    zoneId: zone.id,
    zoneName: zone.name,
    ...result,
  });
}
