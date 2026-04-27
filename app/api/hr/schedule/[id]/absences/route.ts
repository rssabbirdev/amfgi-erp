import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PutSchema = z.object({
  absences: z.array(
    z.object({
      employeeId: z.string().min(1),
      reason: z.string().max(200).optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
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

  const ids = [...new Set(parsed.data.absences.map((a) => a.employeeId))];
  const cnt = await prisma.employee.count({ where: { companyId, id: { in: ids } } });
  if (cnt !== ids.length) return errorResponse('Invalid employee in absences list', 422);

  await prisma.$transaction(async (tx) => {
    await tx.scheduleAbsence.deleteMany({ where: { workScheduleId: scheduleId } });
    for (const a of parsed.data.absences) {
      await tx.scheduleAbsence.create({
        data: {
          companyId,
          workScheduleId: scheduleId,
          employeeId: a.employeeId,
          reason: a.reason?.trim() || null,
          notes: a.notes?.trim() || null,
        },
      });
    }
  });

  const list = await prisma.scheduleAbsence.findMany({
    where: { workScheduleId: scheduleId },
    include: { employee: { select: { id: true, fullName: true, employeeCode: true } } },
  });
  return successResponse(list);
}
