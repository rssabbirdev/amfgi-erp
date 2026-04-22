import { prisma } from '@/lib/db/prisma';
import { normalizePolygonPoints, validateGeofencePoint } from '@/lib/hr/geofence';
import { requireEmployeeApiAuth } from '@/lib/hr/mobileAccess';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const EventSchema = z.object({
  zoneId: z.string().min(1),
  eventType: z.enum(['CHECK_IN', 'CHECK_OUT', 'LOCATION_PING']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  devicePlatform: z.string().max(80).optional().nullable(),
  deviceIdentifier: z.string().max(160).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  metadata: z.unknown().optional(),
});

function workDateFromDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function POST(req: Request) {
  const authCtx = await requireEmployeeApiAuth(req);
  if (!authCtx.ok) return errorResponse(authCtx.error, authCtx.status);

  const body = await req.json();
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const zone = await prisma.geofenceZone.findFirst({
    where: {
      id: parsed.data.zoneId,
      companyId: authCtx.companyId,
      isActive: true,
    },
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

  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  const validation = validateGeofencePoint({
    point: { lat: parsed.data.latitude, lng: parsed.data.longitude },
    polygon: normalizePolygonPoints(zone.polygonPoints),
    gate: { lat: zone.gateLat, lng: zone.gateLng },
    gateRadiusMeters: zone.gateRadiusMeters,
  });

  const event = await prisma.geofenceAttendanceEvent.create({
    data: {
      companyId: authCtx.companyId,
      zoneId: zone.id,
      employeeId: authCtx.employeeId,
      workDate: workDateFromDate(occurredAt),
      eventType: parsed.data.eventType,
      validationStatus: validation.status,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracyMeters: parsed.data.accuracyMeters ?? null,
      distanceToGateMeters: validation.distanceToGateMeters,
      insidePolygon: validation.insidePolygon,
      withinGateRadius: validation.withinGateRadius,
      devicePlatform: parsed.data.devicePlatform?.trim() || null,
      deviceIdentifier: parsed.data.deviceIdentifier?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      metadata:
        parsed.data.metadata === undefined
          ? undefined
          : (parsed.data.metadata as Prisma.InputJsonValue),
      occurredAt,
    },
    select: {
      id: true,
      zoneId: true,
      employeeId: true,
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
    },
  });

  return successResponse(
    {
      employee: {
        id: authCtx.employee.id,
        fullName: authCtx.employee.fullName,
        employeeCode: authCtx.employee.employeeCode,
      },
      zone: {
        id: zone.id,
        name: zone.name,
      },
      ...event,
      validation,
    },
    201
  );
}
