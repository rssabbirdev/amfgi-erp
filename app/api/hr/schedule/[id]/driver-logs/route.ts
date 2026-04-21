import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PutSchema = z.object({
  logs: z.array(
    z.object({
      driverEmployeeId: z.string().min(1),
      routeText: z.string().max(20000),
      sequence: z.number().int().min(0).optional(),
    })
  ),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: scheduleId } = await params;

  const sch = await prisma.workSchedule.findFirst({
    where: { id: scheduleId, companyId },
    select: { id: true, status: true },
  });
  if (!sch) return errorResponse('Not found', 404);
  if (sch.status === 'LOCKED') return errorResponse('Schedule is locked', 403);

  const body = await req.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const ids = [...new Set(parsed.data.logs.map((l) => l.driverEmployeeId))];
  const cnt = await prisma.employee.count({ where: { companyId, id: { in: ids } } });
  if (cnt !== ids.length) return errorResponse('Invalid driver employee id', 422);

  await prisma.$transaction(async (tx) => {
    await tx.driverRunLog.deleteMany({ where: { workScheduleId: scheduleId } });
    let seq = 0;
    for (const l of parsed.data.logs) {
      await tx.driverRunLog.create({
        data: {
          workScheduleId: scheduleId,
          driverEmployeeId: l.driverEmployeeId,
          routeText: l.routeText.trim(),
          sequence: l.sequence ?? seq++,
        },
      });
    }
  });

  const list = await prisma.driverRunLog.findMany({
    where: { workScheduleId: scheduleId },
    orderBy: { sequence: 'asc' },
    include: { driver: { select: { id: true, fullName: true } } },
  });
  return successResponse(list);
}
