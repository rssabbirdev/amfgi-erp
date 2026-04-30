import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  basicHoursForProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';
import { z } from 'zod';

const PatchSchema = z.object({
  checkInAt: z.string().optional().nullable(),
  checkOutAt: z.string().optional().nullable(),
  breakStartAt: z.string().optional().nullable(),
  breakEndAt: z.string().optional().nullable(),
  status: z.enum(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'MISSING_PUNCH']).optional(),
  workflowStatus: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED']).optional(),
  lateMinutes: z.number().int().min(0).optional(),
  earlyLeaveMinutes: z.number().int().min(0).optional(),
  overtimeMinutes: z.number().int().min(0).optional(),
});

function parseDt(s: string | null): Date | null {
  if (s === null || s === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffMinutes(start: Date | null | undefined, end: Date | null | undefined): number {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.attendanceEntry.findFirst({
    where: { id, companyId },
    include: {
      employee: { select: { profileExtension: true } },
    },
  });
  if (!existing) return errorResponse('Not found', 404);
  if (existing.workflowStatus === 'APPROVED') return errorResponse('Attendance row is approved', 403);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.checkInAt !== undefined) data.checkInAt = parseDt(d.checkInAt);
  if (d.checkOutAt !== undefined) data.checkOutAt = parseDt(d.checkOutAt);
  if (d.breakStartAt !== undefined) data.breakStartAt = parseDt(d.breakStartAt);
  if (d.breakEndAt !== undefined) data.breakEndAt = parseDt(d.breakEndAt);
  if (d.status !== undefined) data.status = d.status;

  const nextCheckIn = d.checkInAt !== undefined ? parseDt(d.checkInAt) : existing.checkInAt;
  const nextCheckOut = d.checkOutAt !== undefined ? parseDt(d.checkOutAt) : existing.checkOutAt;
  const nextBreakStart =
    d.breakStartAt !== undefined ? parseDt(d.breakStartAt) : (existing as typeof existing & { breakStartAt?: Date | null }).breakStartAt;
  const nextBreakEnd =
    d.breakEndAt !== undefined ? parseDt(d.breakEndAt) : (existing as typeof existing & { breakEndAt?: Date | null }).breakEndAt;
  const nextStatus = d.status ?? existing.status;
  const expectedStart = existing.expectedShiftStart;
  const expectedEnd = existing.expectedShiftEnd;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { hrEmployeeTypeSettings: true, printTemplates: true },
  });
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);
  const basicHoursPerDay = basicHoursForProfileExtension(existing.employee.profileExtension, typeSettings);
  const basicMinutes = Math.round(basicHoursPerDay * 60);

  const calculatedLate = expectedStart && nextCheckIn ? Math.max(0, diffMinutes(expectedStart, nextCheckIn)) : 0;
  const calculatedEarly = expectedEnd && nextCheckOut ? Math.max(0, diffMinutes(nextCheckOut, expectedEnd)) : 0;
  const workedMinutes = Math.max(0, diffMinutes(nextCheckIn, nextCheckOut) - diffMinutes(nextBreakStart, nextBreakEnd));
  const calculatedOvertime =
    nextStatus === 'ABSENT' || nextStatus === 'LEAVE' ? 0 : Math.max(0, workedMinutes - basicMinutes);

  data.lateMinutes = d.lateMinutes ?? calculatedLate;
  data.earlyLeaveMinutes = d.earlyLeaveMinutes ?? calculatedEarly;
  data.overtimeMinutes = d.overtimeMinutes ?? calculatedOvertime;

  if (d.workflowStatus !== undefined) {
    if (d.workflowStatus === 'SUBMITTED' && existing.workflowStatus === 'DRAFT') {
    data.workflowStatus = 'SUBMITTED';
    } else if (d.workflowStatus === 'APPROVED') {
      if (!requirePerm(session.user, P.HR_ATTENDANCE_APPROVE)) {
        return errorResponse('Forbidden', 403);
      }
      data.workflowStatus = 'APPROVED';
      data.approvedAt = new Date();
      data.approvedById = session.user.id;
    } else if (d.workflowStatus === 'DRAFT') {
      data.workflowStatus = 'DRAFT';
      data.approvedAt = null;
      data.approvedById = null;
    }
  }

  const row = await prisma.attendanceEntry.update({
    where: { id },
    data: data as Prisma.AttendanceEntryUpdateInput,
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      workAssignment: true,
    },
  });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'attendance',
    action: 'updated',
  });
  return successResponse(row);
}
