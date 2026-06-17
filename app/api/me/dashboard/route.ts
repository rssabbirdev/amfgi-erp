import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { readOnLeaveFrom } from '@/lib/hr/employeeLeavePeriod';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { getOrCreateLeaveBalance, remainingLeaveDays } from '@/lib/hr/leaveBalance';
import { countLeaveDaysInclusive } from '@/lib/hr/leaveTypes';
import { dateFromYmd } from '@/lib/hr/workDate';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function monthBoundsUtc(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { from, to };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const { from: monthStart, to: monthEnd } = monthBoundsUtc(year, month);
  const today = dateFromYmd(
    `${year}-${String(month).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  );

  const [employee, balance, requests, monthAttendance] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: emp.id, companyId: emp.companyId },
      select: {
        fullName: true,
        preferredName: true,
        employeeCode: true,
        designation: true,
        department: true,
        status: true,
        profileExtension: true,
      },
    }),
    getOrCreateLeaveBalance(prisma, emp.companyId, emp.id, year),
    prisma.leaveRequest.findMany({
      where: { companyId: emp.companyId, employeeId: emp.id },
      include: {
        leaveTypeRef: { select: { id: true, name: true, code: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    }),
    prisma.attendanceEntry.findMany({
      where: {
        companyId: emp.companyId,
        employeeId: emp.id,
        workDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        status: true,
        checkInAt: true,
        checkOutAt: true,
        breakStartAt: true,
        breakEndAt: true,
        overtimeMinutes: true,
      },
    }),
  ]);

  if (!employee) return errorResponse('Employee not found', 404);

  const attendanceSummary = monthAttendance.reduce(
    (acc, row) => {
      acc.days += 1;
      if (row.status === 'PRESENT') acc.present += 1;
      if (row.status === 'ABSENT') acc.absent += 1;
      if (row.status === 'LEAVE') acc.leave += 1;
      const dutyMs =
        row.checkInAt && row.checkOutAt
          ? Math.max(0, row.checkOutAt.getTime() - row.checkInAt.getTime())
          : 0;
      const breakMs =
        row.breakStartAt && row.breakEndAt
          ? Math.max(0, row.breakEndAt.getTime() - row.breakStartAt.getTime())
          : 0;
      acc.workedMinutes += Math.max(0, Math.round((dutyMs - breakMs) / 60000));
      acc.overtimeMinutes += row.overtimeMinutes ?? 0;
      return acc;
    },
    { days: 0, present: 0, absent: 0, leave: 0, workedMinutes: 0, overtimeMinutes: 0 }
  );

  const pendingRequests = requests.filter((row) => row.status === 'PENDING');
  const approvedRequests = requests.filter((row) => row.status === 'APPROVED');
  const approvedLeaveDaysYtd = approvedRequests.reduce(
    (sum, row) => sum + countLeaveDaysInclusive(row.startDate, row.endDate),
    0
  );

  const activeApprovedLeave = approvedRequests.find(
    (row) => row.startDate <= today && row.endDate >= today
  );

  const upcomingDocument = await prisma.employeeDocument.findFirst({
    where: {
      employeeId: emp.id,
      companyId: emp.companyId,
      expiryDate: { gte: today },
    },
    orderBy: { expiryDate: 'asc' },
    select: {
      expiryDate: true,
      documentType: { select: { name: true } },
    },
  });

  return successResponse({
    employee: {
      fullName: employee.fullName,
      preferredName: employee.preferredName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      status: employee.status,
      onLeaveFrom: readOnLeaveFrom(employee.profileExtension),
    },
    leaveBalance: {
      year,
      entitlementDays: Number(balance.entitlementDays),
      usedDays: Number(balance.usedDays),
      adjustedDays: Number(balance.adjustedDays),
      remainingDays: remainingLeaveDays(balance),
    },
    leaveSummary: {
      pendingCount: pendingRequests.length,
      approvedLeaveDaysYtd,
      activeApprovedLeave: activeApprovedLeave
        ? {
            id: activeApprovedLeave.id,
            leaveType: activeApprovedLeave.leaveTypeRef?.name ?? activeApprovedLeave.leaveType,
            startDate: activeApprovedLeave.startDate,
            endDate: activeApprovedLeave.endDate,
          }
        : null,
    },
    attendanceSummary: {
      month: `${year}-${String(month).padStart(2, '0')}`,
      ...attendanceSummary,
    },
    upcomingDocument: upcomingDocument
      ? {
          name: upcomingDocument.documentType.name,
          expiryDate: upcomingDocument.expiryDate,
        }
      : null,
    recentLeaveRequests: requests.slice(0, 8).map((row) => ({
      id: row.id,
      leaveType: row.leaveTypeRef?.name ?? row.leaveType,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      reason: row.reason,
      reviewNote: row.reviewNote,
      reviewedBy: row.reviewedBy?.name ?? null,
      reviewedAt: row.reviewedAt,
      submittedAt: row.submittedAt,
    })),
  });
}
