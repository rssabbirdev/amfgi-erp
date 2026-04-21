import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function monthBoundsFromYmd(workDateYmd: string) {
  const [y, m] = workDateYmd.split('-').map((x) => Number(x));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  if (!workDateRaw) return errorResponse('workDate query required (YYYY-MM-DD)', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);
  const { start, end } = monthBoundsFromYmd(workDateYmd);

  const [publishedSchedules, attendanceRowsInMonth, pendingPublished, previousAttendanceDays, selectedSchedule, selectedDayAttendanceRows] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { companyId, status: 'PUBLISHED', workDate: { gte: start, lt: end } },
      select: { id: true, workDate: true, _count: { select: { assignments: true } } },
      orderBy: { workDate: 'asc' },
    }),
    prisma.attendanceEntry.groupBy({
      by: ['workDate'],
      where: { companyId, workDate: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.workSchedule.findMany({
      where: { companyId, status: 'PUBLISHED', workDate: { lte: workDate } },
      select: {
        id: true,
        workDate: true,
        title: true,
        status: true,
        _count: { select: { assignments: true } },
      },
      orderBy: { workDate: 'desc' },
      take: 30,
    }),
    prisma.attendanceEntry.groupBy({
      by: ['workDate'],
      where: { companyId, workDate: { lt: workDate } },
      _count: { _all: true },
      orderBy: { workDate: 'desc' },
      take: 7,
    }),
    prisma.workSchedule.findFirst({
      where: { companyId, workDate },
      select: {
        id: true,
        workDate: true,
        title: true,
        clientDisplayName: true,
        status: true,
        publishedAt: true,
        lockedAt: true,
        _count: { select: { assignments: true, absences: true } },
      },
    }),
    prisma.attendanceEntry.count({
      where: { companyId, workDate },
    }),
  ]);

  const attendanceCountByDate = new Map(attendanceRowsInMonth.map((r) => [r.workDate.toISOString().slice(0, 10), r._count._all]));
  const fulfilledScheduleDays = publishedSchedules.filter((s) => (attendanceCountByDate.get(s.workDate.toISOString().slice(0, 10)) ?? 0) > 0).length;

  const pendingWithCounts = await Promise.all(
    pendingPublished.map(async (s) => {
      const count = await prisma.attendanceEntry.count({
        where: { companyId, workDate: s.workDate },
      });
      return {
        id: s.id,
        workDate: s.workDate,
        title: s.title,
        assignmentCount: s._count.assignments,
        attendanceRows: count,
      };
    })
  );
  const pendingSchedules = pendingWithCounts.filter((x) => x.attendanceRows === 0);

  return successResponse({
    selectedDay: {
      workDate: workDateYmd,
      attendanceRows: selectedDayAttendanceRows,
      hasAttendance: selectedDayAttendanceRows > 0,
      schedule: selectedSchedule
        ? {
            ...selectedSchedule,
            needsAttendance: selectedSchedule.status === 'PUBLISHED' && selectedDayAttendanceRows === 0,
          }
        : null,
    },
    monthStats: {
      month: workDateYmd.slice(0, 7),
      publishedScheduleDays: publishedSchedules.length,
      fulfilledScheduleDays,
      pendingScheduleDays: Math.max(0, publishedSchedules.length - fulfilledScheduleDays),
      attendanceRowCount: attendanceRowsInMonth.reduce((sum, x) => sum + x._count._all, 0),
    },
    pendingSchedules,
    previousAttendanceDays: previousAttendanceDays.map((d) => ({
      workDate: d.workDate,
      rows: d._count._all,
    })),
  });
}
