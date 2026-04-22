import { prisma } from '@/lib/db/prisma';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { computePolygonCenter, normalizePolygonPoints } from '@/lib/hr/geofence';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const ZoneInputSchema = z.object({
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

const zoneListSelect = {
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
  _count: {
    select: {
      events: true,
    },
  },
} as const;

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_GEOFENCE_VIEW)) return errorResponse('Forbidden', 403);

  const zones = await prisma.geofenceZone.findMany({
    where: { companyId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: zoneListSelect,
  });

  return successResponse(zones);
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { session, companyId } = ctx;
    if (!requirePerm(session.user, P.HR_GEOFENCE_EDIT)) return errorResponse('Forbidden', 403);

    const body = await req.json();
    const parsed = ZoneInputSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

    const polygonPoints = normalizePolygonPoints(parsed.data.polygonPoints);
    if (polygonPoints.length < 3) return errorResponse('Draw at least 3 polygon points', 422);

    const center = computePolygonCenter(polygonPoints);

    const zone = await prisma.geofenceZone.create({
      data: {
        companyId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        isActive: parsed.data.isActive ?? true,
        gateLat: parsed.data.gateLat,
        gateLng: parsed.data.gateLng,
        gateRadiusMeters: parsed.data.gateRadiusMeters ?? 30,
        centerLat: center?.lat ?? null,
        centerLng: center?.lng ?? null,
        polygonPoints: polygonPoints as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
      select: zoneListSelect,
    });

    return successResponse(zone, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return errorResponse('A geofence with this name already exists', 409);
    }
    console.error('Failed to create geofence zone', error);
    return errorResponse('Failed to save geofence zone', 500);
  }
}
