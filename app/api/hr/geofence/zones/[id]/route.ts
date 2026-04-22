import { prisma } from '@/lib/db/prisma';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { computePolygonCenter, normalizePolygonPoints } from '@/lib/hr/geofence';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const ZoneUpdateSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(10000).optional().nullable(),
  isActive: z.boolean().optional(),
  gateLat: z.number().min(-90).max(90),
  gateLng: z.number().min(-180).max(180),
  gateRadiusMeters: z.number().positive().max(500).optional(),
  polygonPoints: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .min(3),
});

const zoneDetailSelect = {
  id: true,
  companyId: true,
  name: true,
  description: true,
  isActive: true,
  polygonPoints: true,
  gateLat: true,
  gateLng: true,
  gateRadiusMeters: true,
  centerLat: true,
  centerLng: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  events: {
    orderBy: { occurredAt: 'desc' as const },
    take: 20,
    select: {
      id: true,
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
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          status: true,
        },
      },
    },
  },
  _count: {
    select: {
      events: true,
    },
  },
} as const;

async function readZone(companyId: string, id: string) {
  return prisma.geofenceZone.findFirst({
    where: { id, companyId },
    select: zoneDetailSelect,
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_GEOFENCE_VIEW)) return errorResponse('Forbidden', 403);

  const { id } = await params;
  const zone = await readZone(companyId, id);
  if (!zone) return errorResponse('Geofence zone not found', 404);
  return successResponse(zone);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { companyId, session } = ctx;
    if (!requirePerm(session.user, P.HR_GEOFENCE_EDIT)) return errorResponse('Forbidden', 403);

    const { id } = await params;
    const existing = await prisma.geofenceZone.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse('Geofence zone not found', 404);

    const body = await req.json();
    const parsed = ZoneUpdateSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

    const polygonPoints = normalizePolygonPoints(parsed.data.polygonPoints);
    if (polygonPoints.length < 3) return errorResponse('Draw at least 3 polygon points', 422);

    const center = computePolygonCenter(polygonPoints);

    const zone = await prisma.geofenceZone.update({
      where: { id },
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        isActive: parsed.data.isActive ?? true,
        gateLat: parsed.data.gateLat,
        gateLng: parsed.data.gateLng,
        gateRadiusMeters: parsed.data.gateRadiusMeters ?? 30,
        centerLat: center?.lat ?? null,
        centerLng: center?.lng ?? null,
        polygonPoints: polygonPoints as Prisma.InputJsonValue,
      },
      select: zoneDetailSelect,
    });
    return successResponse(zone);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return errorResponse('A geofence with this name already exists', 409);
    }
    console.error('Failed to update geofence zone', error);
    return errorResponse('Failed to save geofence zone', 500);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { companyId, session } = ctx;
    if (!requirePerm(session.user, P.HR_GEOFENCE_EDIT)) return errorResponse('Forbidden', 403);

    const { id } = await params;
    const existing = await prisma.geofenceZone.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse('Geofence zone not found', 404);

    await prisma.geofenceZone.delete({ where: { id } });
    return successResponse({ ok: true });
  } catch (error) {
    console.error('Failed to delete geofence zone', error);
    return errorResponse('Failed to delete geofence zone', 500);
  }
}
