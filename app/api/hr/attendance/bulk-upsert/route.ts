import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { readEmployeeTypeSettingsFromCompanyData } from '@/lib/hr/employeeTypeSettings';
import {
  calculateOvertimeMinutes,
  resolveBasicHoursForEmployee,
} from '@/lib/hr/attendanceBasicHours';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { dubaiWallTimeToUtc, parseTimeCell } from '@/lib/hr/dubaiShift';
import { z } from 'zod';

const RowSchema = z.object({
  employeeId: z.string().min(1),
  workAssignmentId: z.string().optional().nullable(),
  status: z.enum(['PRESENT', 'ABSENT']),
  leaveTypeId: z.string().optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
  checkInAt: z.string().optional().nullable(),
  checkOutAt: z.string().optional().nullable(),
  breakInAt: z.string().optional().nullable(),
  breakOutAt: z.string().optional().nullable(),
});

const BodySchema = z.object({
  workDate: z.string().min(1),
  rows: z.array(RowSchema).min(1),
  refreshBasicHoursFromTypeSettings: z.boolean().optional(),
});

function parseDt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffMinutes(start: Date | null | undefined, end: Date | null | undefined): number {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  await ensureLeaveTypesReady(prisma, companyId);

  const employeeIds = [...new Set(parsed.data.rows.map((r) => r.employeeId))];
  const assignmentIds = [
    ...new Set(parsed.data.rows.map((r) => r.workAssignmentId).filter((x): x is string => Boolean(x))),
  ];

  const [company, employees, assignments, existing, leaveTypes] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { hrEmployeeTypeSettings: true, printTemplates: true } }),
    prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: { id: true, profileExtension: true },
    }),
    assignmentIds.length
      ? prisma.workAssignment.findMany({
          where: {
            id: { in: assignmentIds },
            workSchedule: { companyId },
          },
          select: { id: true, shiftStart: true, shiftEnd: true },
        })
      : Promise.resolve([]),
    prisma.attendanceEntry.findMany({
      where: { companyId, workDate, employeeId: { in: employeeIds } },
      select: {
        id: true,
        employeeId: true,
        workflowStatus: true,
        basicHours: true,
        source: true,
      },
    }),
    prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, rules: true },
    }),
  ]);
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);

  const empById = new Map(employees.map((e) => [e.id, e]));
  const asgById = new Map(assignments.map((a) => [a.id, a]));
  const existingByEmployee = new Map(existing.map((e) => [e.employeeId, e]));
  const unpaidLeaveType = leaveTypes.find((t) => t.code.toUpperCase() === 'UNPAID') ?? null;

  const txOps: Prisma.PrismaPromise<unknown>[] = [];
  for (const row of parsed.data.rows) {
    const emp = empById.get(row.employeeId);
    if (!emp) continue;
    const existingRow = existingByEmployee.get(row.employeeId);

    let resolvedStatus: 'PRESENT' | 'ABSENT' = row.status === 'ABSENT' ? 'ABSENT' : 'PRESENT';
    let leaveTypeId: string | null = null;
    let legacyLeaveType: 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY' | null = null;
    const attendanceSource =
      existingRow?.source === 'SCHEDULE_BOILERPLATE' && resolvedStatus === 'PRESENT'
        ? existingRow.source
        : 'MANUAL';

    if (resolvedStatus === 'ABSENT' && unpaidLeaveType) {
      leaveTypeId = unpaidLeaveType.id;
    }

    const checkInAt = parseDt(row.checkInAt);
    const checkOutAt = parseDt(row.checkOutAt);
    const breakInAt = parseDt(row.breakInAt);
    const breakOutAt = parseDt(row.breakOutAt);
    const typeBasicHours = resolveBasicHoursForEmployee(emp.profileExtension, typeSettings);
    const basicHours =
      existingRow && !parsed.data.refreshBasicHoursFromTypeSettings
        ? Number(existingRow.basicHours)
        : typeBasicHours;
    const breakMinutes = diffMinutes(breakInAt, breakOutAt);
    const workedMinutes = Math.max(0, diffMinutes(checkInAt, checkOutAt) - breakMinutes);

    const asg = row.workAssignmentId ? asgById.get(row.workAssignmentId) : null;
    let dutyStart: Date | null = null;
    let dutyEnd: Date | null = null;
    if (asg?.shiftStart) {
      const st = parseTimeCell(asg.shiftStart);
      if (st) dutyStart = dubaiWallTimeToUtc(workDateYmd, st.hour, st.minute);
    }
    if (asg?.shiftEnd) {
      const en = parseTimeCell(asg.shiftEnd);
      if (en) dutyEnd = dubaiWallTimeToUtc(workDateYmd, en.hour, en.minute);
    }

    const lateMinutes = dutyStart && checkInAt ? Math.max(0, diffMinutes(dutyStart, checkInAt)) : 0;
    const earlyLeaveMinutes = dutyEnd && checkOutAt ? Math.max(0, diffMinutes(checkOutAt, dutyEnd)) : 0;
    const overtimeMinutes = calculateOvertimeMinutes(workedMinutes, basicHours, resolvedStatus);

    const data: Record<string, unknown> = {
      companyId,
      employeeId: row.employeeId,
      workDate,
      workAssignmentId: row.workAssignmentId || null,
      checkInAt,
      checkOutAt,
      breakStartAt: breakInAt,
      breakEndAt: breakOutAt,
      status: resolvedStatus,
      leaveType: legacyLeaveType,
      leaveTypeId,
      remarks: row.remarks?.trim() || null,
      basicHours,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      workflowStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedById: session.user.id,
      source: attendanceSource,
      leaveRequestId: null,
    };

    if (existingRow) {
      txOps.push(
        prisma.attendanceEntry.update({
          where: { id: existingRow.id },
          data: data as Prisma.AttendanceEntryUncheckedUpdateInput,
        })
      );
    } else {
      txOps.push(prisma.attendanceEntry.create({ data: data as Prisma.AttendanceEntryUncheckedCreateInput }));
    }
  }

  if (txOps.length) await prisma.$transaction(txOps);
  if (txOps.length > 0) {
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'attendance',
      action: 'changed',
    });
  }
  return successResponse({ ok: true, affectedRows: txOps.length });
}
