import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_PUBLISH)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  if (sch.status !== 'DRAFT') return errorResponse('Only draft schedules can be published', 400);

  const updated = await prisma.workSchedule.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    select: {
      id: true,
      workDate: true,
      status: true,
      title: true,
      clientDisplayName: true,
      publishedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'schedule',
    action: 'updated',
  });

  return successResponse(updated);
}
