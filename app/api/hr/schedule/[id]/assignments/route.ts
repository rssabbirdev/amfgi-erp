import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { nullableDecimalToNumber } from '@/lib/utils/decimal';
import { z } from 'zod';

const MemberSchema = z.object({
  employeeId: z.string().min(1),
  role: z.enum(['WORKER', 'HELPER', 'TEAM_LEADER']).default('WORKER'),
  slot: z.number().int().min(0).max(99).optional(),
});

const AssignmentSchema = z.object({
  columnIndex: z.number().int().min(1).max(99),
  label: z.string().min(1).max(80),
  locationType: z.enum(['SITE_JOB', 'FACTORY', 'OTHER']),
  jobId: z.string().optional().nullable(),
  factoryCode: z.string().max(120).optional().nullable(),
  factoryLabel: z.string().max(200).optional().nullable(),
  jobNumberSnapshot: z.string().max(120).optional().nullable(),
  siteNameSnapshot: z.string().max(200).optional().nullable(),
  clientNameSnapshot: z.string().max(200).optional().nullable(),
  projectDetailsSnapshot: z.string().max(5000).optional().nullable(),
  teamLeaderEmployeeId: z.string().optional().nullable(),
  driver1EmployeeId: z.string().optional().nullable(),
  driver2EmployeeId: z.string().optional().nullable(),
  shiftStart: z.string().max(40).optional().nullable(),
  shiftEnd: z.string().max(40).optional().nullable(),
  breakWindow: z.string().max(80).optional().nullable(),
  targetQty: z.number().optional().nullable(),
  achievedQty: z.number().optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  remarks: z.string().max(5000).optional().nullable(),
  members: z.array(MemberSchema).default([]),
});

const PutSchema = z.object({
  notes: z.string().max(5000).optional().nullable(),
  assignments: z.array(AssignmentSchema),
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

  const incoming = parsed.data.assignments;
  const colSet = new Set(incoming.map((a) => a.columnIndex));
  if (colSet.size !== incoming.length) return errorResponse('Duplicate columnIndex', 422);

  for (const a of incoming) {
    if (a.jobId) {
      const job = await prisma.job.findFirst({ where: { id: a.jobId, companyId } });
      if (!job) return errorResponse(`Invalid jobId for column ${a.columnIndex}`, 422);
    }
    const empIds = new Set<string>();
    if (a.teamLeaderEmployeeId) empIds.add(a.teamLeaderEmployeeId);
    if (a.driver1EmployeeId) empIds.add(a.driver1EmployeeId);
    if (a.driver2EmployeeId) empIds.add(a.driver2EmployeeId);
    for (const m of a.members) empIds.add(m.employeeId);
    if (empIds.size) {
      const count = await prisma.employee.count({
        where: { companyId, id: { in: [...empIds] } },
      });
      if (count !== empIds.size) return errorResponse(`Invalid employee reference in column ${a.columnIndex}`, 422);
    }
  }

  const existingAssignments = await prisma.workAssignment.findMany({
    where: { workScheduleId: scheduleId },
    select: { id: true },
  });
  const existingAssignmentIds = existingAssignments.map((row) => row.id);

  const assignmentRows = incoming.map((a) => ({
    id: crypto.randomUUID(),
    companyId,
    workScheduleId: scheduleId,
    columnIndex: a.columnIndex,
    label: a.label.trim(),
    locationType: a.locationType,
    jobId: a.jobId ?? null,
    factoryCode: a.factoryCode?.trim() || null,
    factoryLabel: a.factoryLabel?.trim() || null,
    jobNumberSnapshot: a.jobNumberSnapshot?.trim() || null,
    siteNameSnapshot: a.siteNameSnapshot?.trim() || null,
    clientNameSnapshot: a.clientNameSnapshot?.trim() || null,
    projectDetailsSnapshot: a.projectDetailsSnapshot?.trim() || null,
    teamLeaderEmployeeId: a.teamLeaderEmployeeId ?? null,
    driver1EmployeeId: a.driver1EmployeeId ?? null,
    driver2EmployeeId: a.driver2EmployeeId ?? null,
    shiftStart: a.shiftStart?.trim() || null,
    shiftEnd: a.shiftEnd?.trim() || null,
    breakWindow: a.breakWindow?.trim() || null,
    targetQty: nullableDecimalToNumber(a.targetQty),
    achievedQty: nullableDecimalToNumber(a.achievedQty),
    unit: a.unit?.trim() || null,
    remarks: a.remarks?.trim() || null,
  }));

  const assignmentIdByColumn = new Map(assignmentRows.map((row) => [row.columnIndex, row.id]));
  const memberRows = incoming.flatMap((a) => {
    const seen = new Set<string>();
    const workAssignmentId = assignmentIdByColumn.get(a.columnIndex);
    if (!workAssignmentId) return [];
    return a.members.flatMap((m) => {
      if (seen.has(m.employeeId)) return [];
      seen.add(m.employeeId);
      return {
        companyId,
        workAssignmentId,
        employeeId: m.employeeId,
        role: m.role,
        slot: m.slot ?? 0,
      };
    });
  });

  const writes = [];
  if (existingAssignmentIds.length) {
    writes.push(
      prisma.workAssignmentMember.deleteMany({ where: { workAssignmentId: { in: existingAssignmentIds } } })
    );
  }
  writes.push(prisma.workAssignment.deleteMany({ where: { workScheduleId: scheduleId } }));
  if (assignmentRows.length) {
    writes.push(prisma.workAssignment.createMany({ data: assignmentRows }));
  }
  if (memberRows.length) {
    writes.push(prisma.workAssignmentMember.createMany({ data: memberRows }));
  }

  await prisma.$transaction(writes);

  if (parsed.data.notes !== undefined) {
    await prisma.workSchedule.update({
      where: { id: scheduleId },
      data: { notes: parsed.data.notes?.trim() || null } as never,
      select: { id: true },
    });
  }

  const full = await prisma.workSchedule.findFirst({
    where: { id: scheduleId },
    select: {
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
        orderBy: { columnIndex: 'asc' },
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
      driverLogs: {
        orderBy: { sequence: 'asc' },
        include: { driver: { select: { id: true, fullName: true } } },
      },
    },
  });
  return successResponse(full);
}
