import type { PrismaClient } from '@prisma/client';
import { findEmployeeByNameInsensitive } from '@/lib/hr/matchEmployee';
import type { ParsedDailySheet } from '@/lib/hr/parseDailyWorkScheduleCsv';
import { parseDailyWorkScheduleCsv } from '@/lib/hr/parseDailyWorkScheduleCsv';
export async function runScheduleCsvImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    scheduleId: string;
    csvText: string;
    workDateYmdOverride?: string;
  }
) {
  const { companyId, scheduleId, csvText, workDateYmdOverride } = opts;

  const sch = await prisma.workSchedule.findFirst({ where: { id: scheduleId, companyId } });
  if (!sch) return { error: 'NOT_FOUND' as const };
  if (sch.status === 'LOCKED') return { error: 'LOCKED' as const };

  let sheet: ParsedDailySheet;
  try {
    sheet = parseDailyWorkScheduleCsv(csvText);
  } catch (e) {
    return { error: 'PARSE', message: e instanceof Error ? e.message : 'parse failed' } as const;
  }

  const workDateYmd = workDateYmdOverride ?? sheet.workDateYmd;
  const schYmd = sch.workDate.toISOString().slice(0, 10);
  if (schYmd !== workDateYmd) {
    return { error: 'DATE_MISMATCH' as const };
  }

  const warnings: string[] = [];
  type Member = { employeeId: string; role: 'WORKER' | 'HELPER' | 'TEAM_LEADER'; slot: number };
  const assignmentsPayload: Array<{
    columnIndex: number;
    label: string;
    locationType: 'SITE_JOB' | 'FACTORY' | 'OTHER';
    jobId: string | null;
    factoryCode: string | null;
    factoryLabel: string | null;
    jobNumberSnapshot: string | null;
    teamLeaderEmployeeId: string | null;
    driver1EmployeeId: string | null;
    driver2EmployeeId: string | null;
    shiftStart: string | null;
    shiftEnd: string | null;
    breakWindow: string | null;
    members: Member[];
  }> = [];

  for (const col of sheet.columns) {
    let jobId: string | null = null;
    if (col.locationType === 'SITE_JOB' && col.jobNumberSnapshot) {
      const job = await prisma.job.findFirst({
        where: { companyId, jobNumber: col.jobNumberSnapshot.trim() },
        select: { id: true },
      });
      if (job) jobId = job.id;
      else warnings.push(`Column ${col.columnIndex}: job number "${col.jobNumberSnapshot}" not found`);
    }

    const members: Member[] = [];
    let slot = 1;
    for (const name of col.workerNames) {
      const hit = await findEmployeeByNameInsensitive(prisma, companyId, name);
      if (!hit) {
        warnings.push(`Column ${col.columnIndex}: worker "${name}" not matched to an employee`);
        continue;
      }
      members.push({ employeeId: hit.id, role: 'WORKER', slot: slot++ });
    }

    let teamLeaderEmployeeId: string | null = null;
    if (col.teamLeaderName) {
      const tl = await findEmployeeByNameInsensitive(prisma, companyId, col.teamLeaderName);
      if (tl) teamLeaderEmployeeId = tl.id;
      else warnings.push(`Column ${col.columnIndex}: team leader "${col.teamLeaderName}" not matched`);
    }

    let driver1EmployeeId: string | null = null;
    let driver2EmployeeId: string | null = null;
    if (col.driver1Name) {
      const d1 = await findEmployeeByNameInsensitive(prisma, companyId, col.driver1Name);
      if (d1) driver1EmployeeId = d1.id;
      else warnings.push(`Column ${col.columnIndex}: driver "${col.driver1Name}" not matched`);
    }
    if (col.driver2Name) {
      const d2 = await findEmployeeByNameInsensitive(prisma, companyId, col.driver2Name);
      if (d2) driver2EmployeeId = d2.id;
      else warnings.push(`Column ${col.columnIndex}: driver "${col.driver2Name}" not matched`);
    }

    assignmentsPayload.push({
      columnIndex: col.columnIndex,
      label: col.label,
      locationType: col.locationType,
      jobId,
      factoryCode: col.factoryCode ?? null,
      factoryLabel: col.factoryLabel ?? null,
      jobNumberSnapshot: col.jobNumberSnapshot ?? null,
      teamLeaderEmployeeId,
      driver1EmployeeId,
      driver2EmployeeId,
      shiftStart: col.shiftStart ?? null,
      shiftEnd: col.shiftEnd ?? null,
      breakWindow: col.breakWindow ?? null,
      members,
    });
  }

  await prisma.$transaction(async (tx) => {
    const oldIds = await tx.workAssignment.findMany({
      where: { workScheduleId: scheduleId },
      select: { id: true },
    });
    const oldIdList = oldIds.map((x) => x.id);
    if (oldIdList.length) {
      await tx.workAssignmentMember.deleteMany({ where: { workAssignmentId: { in: oldIdList } } });
      await tx.workAssignment.deleteMany({ where: { workScheduleId: scheduleId } });
    }

    for (const a of assignmentsPayload) {
      const asg = await tx.workAssignment.create({
        data: {
          companyId,
          workScheduleId: scheduleId,
          columnIndex: a.columnIndex,
          label: a.label,
          locationType: a.locationType,
          jobId: a.jobId,
          factoryCode: a.factoryCode,
          factoryLabel: a.factoryLabel,
          jobNumberSnapshot: a.jobNumberSnapshot,
          teamLeaderEmployeeId: a.teamLeaderEmployeeId,
          driver1EmployeeId: a.driver1EmployeeId,
          driver2EmployeeId: a.driver2EmployeeId,
          shiftStart: a.shiftStart,
          shiftEnd: a.shiftEnd,
          breakWindow: a.breakWindow,
        },
      });
      const seen = new Set<string>();
      for (const m of a.members) {
        if (seen.has(m.employeeId)) continue;
        seen.add(m.employeeId);
        await tx.workAssignmentMember.create({
          data: {
            companyId,
            workAssignmentId: asg.id,
            employeeId: m.employeeId,
            role: m.role,
            slot: m.slot,
          },
        });
      }
    }

    await tx.scheduleAbsence.deleteMany({ where: { workScheduleId: scheduleId } });
    for (const name of sheet.onLeaveNames) {
      const hit = await findEmployeeByNameInsensitive(tx, companyId, name);
      if (!hit) {
        warnings.push(`On leave: "${name}" not matched`);
        continue;
      }
      await tx.scheduleAbsence.create({
        data: { companyId, workScheduleId: scheduleId, employeeId: hit.id, reason: 'ON_LEAVE' },
      });
    }

    await tx.driverRunLog.deleteMany({ where: { workScheduleId: scheduleId } });
    let seq = 0;
    for (const row of sheet.driverRoutes) {
      const hit = await findEmployeeByNameInsensitive(tx, companyId, row.driverName);
      if (!hit) {
        warnings.push(`Driver route: "${row.driverName}" not matched`);
        continue;
      }
      await tx.driverRunLog.create({
        data: {
          companyId,
          workScheduleId: scheduleId,
          driverEmployeeId: hit.id,
          routeText: row.routeText,
          sequence: seq++,
        },
      });
    }

    await tx.workSchedule.update({
      where: { id: scheduleId },
      data: {
        clientDisplayName: sheet.clientDisplayName ?? sch.clientDisplayName,
      },
    });
  });

  const full = await prisma.workSchedule.findFirst({
    where: { id: scheduleId },
    include: {
      assignments: {
        orderBy: { columnIndex: 'asc' },
        include: {
          members: { include: { employee: { select: { id: true, fullName: true } } } },
          job: { select: { id: true, jobNumber: true } },
        },
      },
      absences: { include: { employee: true } },
      driverLogs: true,
    },
  });

  return { schedule: full, warnings };
}
