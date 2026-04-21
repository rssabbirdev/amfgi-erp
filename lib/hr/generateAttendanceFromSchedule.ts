import type { Prisma, PrismaClient } from '@prisma/client';
import { dubaiWallTimeToUtc, parseTimeCell } from '@/lib/hr/dubaiShift';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import { readEmployeeTypeSettingsFromCompanyData } from '@/lib/hr/employeeTypeSettings';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseBreakWindow(workDateYmd: string, raw: string | null | undefined) {
  if (!raw) return { breakStartAt: null as Date | null, breakEndAt: null as Date | null };
  const match = raw.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!match) return { breakStartAt: null, breakEndAt: null };
  const start = parseTimeCell(match[1] ?? undefined);
  const end = parseTimeCell(match[2] ?? undefined);
  return {
    breakStartAt: start ? dubaiWallTimeToUtc(workDateYmd, start.hour, start.minute) : null,
    breakEndAt: end ? dubaiWallTimeToUtc(workDateYmd, end.hour, end.minute) : null,
  };
}

/**
 * Deletes existing boilerplate draft rows for this company+date and inserts fresh rows
 * from a published schedule (members + leader + drivers; deduped per employee).
 */
export async function regenerateAttendanceBoilerplate(
  prisma: PrismaClient,
  scheduleId: string
) {
  const sch = await prisma.workSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      assignments: {
        include: { members: true },
      },
      absences: true,
      company: { select: { hrEmployeeTypeSettings: true, printTemplates: true } },
    },
  });
  if (!sch) throw new Error('Schedule not found');
  if (sch.status !== 'PUBLISHED') throw new Error('Schedule must be published');

  const workDateYmd = ymd(sch.workDate);
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(sch.company);
  const absent = new Set(sch.absences.map((a) => a.employeeId));
  const activeEmployees = await prisma.employee.findMany({
    where: { companyId: sch.companyId, status: 'ACTIVE' },
    select: { id: true, profileExtension: true },
    orderBy: { fullName: 'asc' },
  });

  const assignedByEmployee = new Map<string, string>();

  const pushEmp = (employeeId: string | null | undefined, assignmentId: string) => {
    if (!employeeId) return;
    if (assignedByEmployee.has(employeeId)) return;
    assignedByEmployee.set(employeeId, assignmentId);
  };

  for (const asg of sch.assignments.sort((a, b) => a.columnIndex - b.columnIndex)) {
    for (const m of asg.members) {
      pushEmp(m.employeeId, asg.id);
    }
    pushEmp(asg.teamLeaderEmployeeId, asg.id);
    pushEmp(asg.driver1EmployeeId, asg.id);
    pushEmp(asg.driver2EmployeeId, asg.id);
  }

  const asgById = new Map(sch.assignments.map((a) => [a.id, a]));
  const createRows: Record<string, unknown>[] = [];
  for (const emp of activeEmployees) {
    const employeeId = emp.id;
    const assignmentId = assignedByEmployee.get(employeeId) ?? null;
    const asg = assignmentId ? asgById.get(assignmentId) : null;
    const onLeave = absent.has(employeeId);
    const workforce = parseWorkforceProfile(emp.profileExtension);

    let expectedShiftStart: Date | null = null;
    let expectedShiftEnd: Date | null = null;
    let breakStartAt: Date | null = null;
    let breakEndAt: Date | null = null;

    if (asg?.shiftStart || asg?.shiftEnd || asg?.breakWindow) {
      const st = parseTimeCell(asg.shiftStart ?? undefined);
      const en = parseTimeCell(asg.shiftEnd ?? undefined);
      const breakWindow = parseBreakWindow(workDateYmd, asg.breakWindow);
      if (st) expectedShiftStart = dubaiWallTimeToUtc(workDateYmd, st.hour, st.minute);
      if (en) expectedShiftEnd = dubaiWallTimeToUtc(workDateYmd, en.hour, en.minute);
      breakStartAt = breakWindow.breakStartAt;
      breakEndAt = breakWindow.breakEndAt;
    } else {
      const setting = typeSettings[workforce.employeeType];
      const useDefaultTiming =
        workforce.employeeType === 'OFFICE_STAFF' ||
        workforce.employeeType === 'DRIVER' ||
        workforce.employeeType === 'HYBRID_STAFF';
      if (useDefaultTiming) {
        const st = parseTimeCell(setting?.dutyStart);
        const en = parseTimeCell(setting?.dutyEnd);
        const bs = parseTimeCell(setting?.breakStart);
        const be = parseTimeCell(setting?.breakEnd);
        if (st) expectedShiftStart = dubaiWallTimeToUtc(workDateYmd, st.hour, st.minute);
        if (en) expectedShiftEnd = dubaiWallTimeToUtc(workDateYmd, en.hour, en.minute);
        if (bs) breakStartAt = dubaiWallTimeToUtc(workDateYmd, bs.hour, bs.minute);
        if (be) breakEndAt = dubaiWallTimeToUtc(workDateYmd, be.hour, be.minute);
      }
    }

    const defaultStatus: Prisma.AttendanceEntryCreateManyInput['status'] =
      assignmentId ||
      workforce.employeeType === 'OFFICE_STAFF' ||
      workforce.employeeType === 'DRIVER' ||
      workforce.employeeType === 'HYBRID_STAFF'
        ? 'PRESENT'
        : 'ABSENT';
    createRows.push({
      companyId: sch.companyId,
      employeeId,
      workDate: sch.workDate,
      workAssignmentId: assignmentId,
      expectedShiftStart: onLeave ? null : expectedShiftStart,
      expectedShiftEnd: onLeave ? null : expectedShiftEnd,
      breakStartAt: onLeave ? null : breakStartAt,
      breakEndAt: onLeave ? null : breakEndAt,
      status: onLeave ? 'LEAVE' : defaultStatus,
      workflowStatus: 'DRAFT',
      source: 'SCHEDULE_BOILERPLATE',
    });
  }

  const deleteWhere = {
    companyId: sch.companyId,
    workDate: sch.workDate,
    source: 'SCHEDULE_BOILERPLATE',
    workflowStatus: 'DRAFT',
  } satisfies Prisma.AttendanceEntryDeleteManyArgs['where'];

  const createWithoutBreakFields = createRows.map((row) => {
    const nextRow = { ...row };
    delete nextRow.breakStartAt;
    delete nextRow.breakEndAt;
    return nextRow;
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceEntry.deleteMany({ where: deleteWhere });
      if (createRows.length) {
        await tx.attendanceEntry.createMany({ data: createRows as Prisma.AttendanceEntryCreateManyInput[] });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isBreakFieldClientMismatch =
      message.includes('Unknown argument `breakStartAt`') ||
      message.includes('Unknown argument `breakEndAt`');

    if (!isBreakFieldClientMismatch) throw error;

    await prisma.$transaction(async (tx) => {
      await tx.attendanceEntry.deleteMany({ where: deleteWhere });
      if (createWithoutBreakFields.length) {
        await tx.attendanceEntry.createMany({
          data: createWithoutBreakFields as Prisma.AttendanceEntryCreateManyInput[],
        });
      }
    });
  }
}
