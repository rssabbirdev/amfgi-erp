import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const scheduleDetailSelect = {
  id: true,
  companyId: true,
  workDate: true,
  clientDisplayName: true,
  title: true,
  notes: true,
  status: true,
  publishedAt: true,
  lockedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    orderBy: { columnIndex: 'asc' as const },
    include: {
      members: { include: { employee: { select: { id: true, fullName: true, employeeCode: true } } } },
      job: {
        select: {
          id: true,
          jobNumber: true,
          site: true,
          description: true,
          projectDetails: true,
          customer: { select: { name: true } },
        },
      },
      teamLeader: { select: { id: true, fullName: true } },
      driver1: { select: { id: true, fullName: true } },
      driver2: { select: { id: true, fullName: true } },
    },
  },
  absences: { include: { employee: { select: { id: true, fullName: true } } } },
  driverLogs: { orderBy: { sequence: 'asc' as const }, include: { driver: { select: { id: true, fullName: true } } } },
} as const;

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');

  if (!workDateRaw) {
    const rows = await prisma.workSchedule.findMany({
      where: { companyId },
      orderBy: { workDate: 'desc' },
      select: {
        id: true,
        workDate: true,
        status: true,
        title: true,
        clientDisplayName: true,
        createdAt: true,
        publishedAt: true,
        lockedAt: true,
        _count: { select: { assignments: true, absences: true } },
      },
      take: 100,
    });
    const attendanceByDate = new Map<string, number>();
    if (rows.length > 0) {
      const attendanceRows = await prisma.attendanceEntry.groupBy({
        by: ['workDate'],
        where: {
          companyId,
          workDate: { in: rows.map((row) => row.workDate) },
        },
        _count: { _all: true },
      });
      for (const row of attendanceRows) {
        attendanceByDate.set(row.workDate.toISOString().slice(0, 10), row._count._all);
      }
    }

    return successResponse(
      rows.map((row) => ({
        ...row,
        attendanceRows: attendanceByDate.get(row.workDate.toISOString().slice(0, 10)) ?? 0,
      }))
    );
  }

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }

  const sch = await prisma.workSchedule.findFirst({
    where: { companyId, workDate: dateFromYmd(workDateYmd) },
    select: scheduleDetailSelect,
  });
  return successResponse(sch);
}

const PostSchema = z.object({
  workDate: z.string().min(1),
  title: z.string().max(200).optional().nullable(),
  clientDisplayName: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const existing = await prisma.workSchedule.findFirst({
    where: { companyId, workDate },
    select: { id: true },
  });
  if (existing) return errorResponse('Schedule already exists for this date', 409);

  const sch = await prisma.workSchedule.create({
    data: {
      companyId,
      workDate,
      title: parsed.data.title?.trim() || null,
      clientDisplayName: parsed.data.clientDisplayName?.trim() || null,
      status: 'DRAFT',
      createdById: session.user.id,
    },
    select: scheduleDetailSelect,
  });
  return successResponse(sch, 201);
}
