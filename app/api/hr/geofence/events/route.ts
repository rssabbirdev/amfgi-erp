import { prisma } from '@/lib/db/prisma';
import { normalizePolygonPoints, validateGeofencePoint } from '@/lib/hr/geofence';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const EventCreateSchema = z.object({
  zoneId: z.string().min(1),
  employeeId: z.string().optional().nullable(),
  workDate: z.string().optional().nullable(),
  eventType: z.enum(['CHECK_IN', 'CHECK_OUT', 'LOCATION_PING', 'MANUAL_OVERRIDE']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  devicePlatform: z.string().max(80).optional().nullable(),
  deviceIdentifier: z.string().max(160).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  metadata: z.unknown().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_GEOFENCE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const zoneId = (searchParams.get('zoneId') ?? '').trim();
  const workDateRaw = (searchParams.get('workDate') ?? '').trim();

  let workDate: Date | undefined;
  if (workDateRaw) {
    try {
      workDate = dateFromYmd(ymdFromInput(workDateRaw));
    } catch {
      return errorResponse('Invalid workDate', 400);
    }
  }

  const events = await prisma.geofenceAttendanceEvent.findMany({
    where: {
      companyId,
      ...(zoneId ? { zoneId } : {}),
      ...(workDate ? { workDate } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take: 100,
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
      zone: { select: { id: true, name: true } },
      employee: { select: { id: true, fullName: true, employeeCode: true, status: true } },
    },
  });

  return successResponse(events);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_GEOFENCE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = EventCreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDate: Date | null = null;
  if (parsed.data.workDate) {
    try {
      workDate = dateFromYmd(ymdFromInput(parsed.data.workDate));
    } catch {
      return errorResponse('Invalid workDate', 422);
    }
  }

  if (parsed.data.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, companyId },
      select: { id: true },
    });
    if (!employee) return errorResponse('Employee not found', 404);
  }

  const zone = await prisma.geofenceZone.findFirst({
    where: { id: parsed.data.zoneId, companyId },
    select: {
      id: true,
      name: true,
      polygonPoints: true,
      gateLat: true,
      gateLng: true,
      gateRadiusMeters: true,
    },
  });
  if (!zone) return errorResponse('Geofence zone not found', 404);

  const validation = validateGeofencePoint({
    point: { lat: parsed.data.latitude, lng: parsed.data.longitude },
    polygon: normalizePolygonPoints(zone.polygonPoints),
    gate: { lat: zone.gateLat, lng: zone.gateLng },
    gateRadiusMeters: zone.gateRadiusMeters,
  });

  const event = await prisma.geofenceAttendanceEvent.create({
    data: {
      companyId,
      zoneId: zone.id,
      employeeId: parsed.data.employeeId || null,
      workDate,
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
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
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
      ...event,
      zoneName: zone.name,
      validation,
    },
    201
  );
}
