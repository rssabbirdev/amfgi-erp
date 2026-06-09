import type { PrismaClient } from '@prisma/client';
import { datesInRangeInclusive } from '@/lib/hr/leaveTypes';
import { resolveBasicHoursFromCompany } from '@/lib/hr/attendanceBasicHours';
import { resolveAttendanceFieldsFromLeaveType, loadLeaveTypeForRequest } from '@/lib/hr/resolveLeaveTypeSelection';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';

/**
 * Creates or updates DRAFT attendance rows for an approved leave request.
 */
export async function syncApprovedLeaveToAttendance(
  prisma: PrismaClient,
  leaveRequestId: string
) {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      employee: { select: { profileExtension: true } },
      company: { select: { hrEmployeeTypeSettings: true, printTemplates: true } },
    },
  });
  if (!req || req.status !== 'APPROVED') return { synced: 0 };

  await ensureLeaveTypesReady(prisma, req.companyId);

  const basicHours = resolveBasicHoursFromCompany(req.employee.profileExtension, req.company);
  let leaveTypeRecord =
    req.leaveTypeId != null
      ? await loadLeaveTypeForRequest(prisma, req.companyId, req.leaveTypeId)
      : null;
  if (!leaveTypeRecord) {
    leaveTypeRecord = await prisma.leaveType.findFirst({
      where: {
        companyId: req.companyId,
        code: req.leaveType === 'SICK' ? 'SICK' : req.leaveType === 'ANNUAL' ? 'ANNUAL' : 'PAID',
      },
      select: { id: true, code: true, name: true, rules: true },
    });
  }
  const attendanceFields = leaveTypeRecord
    ? resolveAttendanceFieldsFromLeaveType(leaveTypeRecord)
    : { leaveTypeId: null, status: 'LEAVE' as const, leaveType: req.leaveType };
  const dates = datesInRangeInclusive(req.startDate, req.endDate);

  let synced = 0;
  for (const workDate of dates) {
    const schedule = await prisma.workSchedule.findFirst({
      where: { companyId: req.companyId, workDate },
      select: { id: true },
    });
    if (schedule) {
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
    }
    const existing = await prisma.attendanceEntry.findFirst({
      where: { companyId: req.companyId, employeeId: req.employeeId, workDate },
    });
    if (existing?.workflowStatus === 'APPROVED') continue;

    const data = {
      status: attendanceFields.status,
      leaveType: attendanceFields.leaveType,
      leaveTypeId: attendanceFields.leaveTypeId,
      basicHours,
      checkInAt: null,
      checkOutAt: null,
      breakStartAt: null,
      breakEndAt: null,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      workflowStatus: 'DRAFT' as const,
      source: 'LEAVE_REQUEST' as const,
      leaveRequestId: req.id,
    };

    if (existing) {
      await prisma.attendanceEntry.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.attendanceEntry.create({
        data: {
          companyId: req.companyId,
          employeeId: req.employeeId,
          workDate,
          ...data,
        },
      });
    }
    synced += 1;
  }
  return { synced };
}

export async function removeSyncedLeaveAttendance(
  prisma: PrismaClient,
  leaveRequestId: string
) {
  const deleted = await prisma.attendanceEntry.deleteMany({
    where: {
      leaveRequestId,
      source: 'LEAVE_REQUEST',
      workflowStatus: 'DRAFT',
    },
  });
  return deleted.count;
}
