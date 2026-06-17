import type { PrismaClient } from '@prisma/client';
import { datesInRangeInclusive } from '@/lib/hr/leaveTypes';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';

/**
 * Marks schedule absences when leave is approved. Attendance rows are not modified —
 * leave and attendance stay separate and are combined in payroll.
 */
export async function syncApprovedLeaveToScheduleAbsences(
  prisma: PrismaClient,
  leaveRequestId: string
) {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
  });
  if (!req || req.status !== 'APPROVED') return { synced: 0 };

  await ensureLeaveTypesReady(prisma, req.companyId);

  const dates = datesInRangeInclusive(req.startDate, req.endDate);
  let synced = 0;

  for (const workDate of dates) {
    const schedule = await prisma.workSchedule.findFirst({
      where: { companyId: req.companyId, workDate },
      select: { id: true },
    });
    if (!schedule) continue;

    await prisma.scheduleAbsence.upsert({
      where: {
        workScheduleId_employeeId: {
          workScheduleId: schedule.id,
          employeeId: req.employeeId,
        },
      },
      create: {
        companyId: req.companyId,
        workScheduleId: schedule.id,
        employeeId: req.employeeId,
        reason: `LEAVE_REQUEST:${req.leaveType}`,
        notes: req.reason,
      },
      update: {
        reason: `LEAVE_REQUEST:${req.leaveType}`,
        notes: req.reason,
      },
    });
    synced += 1;
  }

  return { synced };
}

/** Removes schedule absences created when leave was approved. */
export async function removeApprovedLeaveFromScheduleAbsences(
  prisma: PrismaClient,
  req: {
    companyId: string;
    employeeId: string;
    startDate: Date;
    endDate: Date;
  }
) {
  const dates = datesInRangeInclusive(req.startDate, req.endDate);
  let removed = 0;

  for (const workDate of dates) {
    const schedule = await prisma.workSchedule.findFirst({
      where: { companyId: req.companyId, workDate },
      select: { id: true },
    });
    if (!schedule) continue;

    const result = await prisma.scheduleAbsence.deleteMany({
      where: {
        workScheduleId: schedule.id,
        employeeId: req.employeeId,
        reason: { startsWith: 'LEAVE_REQUEST:' },
      },
    });
    removed += result.count;
  }

  return { removed };
}

/** Backward-compatible alias — does not write attendance rows. */
export async function syncApprovedLeaveToAttendance(
  prisma: PrismaClient,
  leaveRequestId: string
) {
  return syncApprovedLeaveToScheduleAbsences(prisma, leaveRequestId);
}

/** Removes legacy attendance rows created before leave/attendance separation. */
export async function removeSyncedLeaveAttendance(
  prisma: PrismaClient,
  leaveRequestId: string
) {
  const deleted = await prisma.attendanceEntry.deleteMany({
    where: {
      leaveRequestId,
      source: 'LEAVE_REQUEST',
    },
  });
  return deleted.count;
}
