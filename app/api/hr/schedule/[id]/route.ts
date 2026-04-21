import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const scheduleInclude = {
  id: true,
  companyId: true,
  workDate: true,
  clientDisplayName: true,
  title: true,
  notes: true,
  status: true,
  publishedAt: true,
  lockedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    orderBy: { columnIndex: 'asc' as const },
    include: {
      members: { include: { employee: { select: { id: true, fullName: true, employeeCode: true } } } },
      job: {
        select: {
          id: true,
          jobNumber: true,
          site: true,
          description: true,
          projectDetails: true,
          customer: { select: { name: true } },
        },
      },
      teamLeader: { select: { id: true, fullName: true } },
      driver1: { select: { id: true, fullName: true } },
      driver2: { select: { id: true, fullName: true } },
    },
  },
  absences: { include: { employee: { select: { id: true, fullName: true } } } },
  driverLogs: { orderBy: { sequence: 'asc' as const }, include: { driver: { select: { id: true, fullName: true } } } },
} as const;

const PatchSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  clientDisplayName: z.string().max(200).optional().nullable(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_VIEW)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id, companyId },
    select: scheduleInclude,
  });
  if (!sch) return errorResponse('Not found', 404);
  return successResponse(sch);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.workSchedule.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });
  if (!existing) return errorResponse('Not found', 404);
  if (existing.status === 'LOCKED') return errorResponse('Schedule is locked', 403);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const data: Prisma.WorkScheduleUpdateInput = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title?.trim() || null;
  if (parsed.data.clientDisplayName !== undefined) {
    data.clientDisplayName = parsed.data.clientDisplayName?.trim() || null;
  }

  const sch = await prisma.workSchedule.update({
    where: { id },
    data,
    select: scheduleInclude,
  });
  return successResponse(sch);
}
