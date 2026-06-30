import type { AssignmentLocationType, PrismaClient } from '@prisma/client';

import { parseBreakWindow } from '@/lib/hr/attendanceSheetModel';
import { dateFromYmd } from '@/lib/hr/workDate';
import { formatScheduleTimeForPrint } from '@/lib/hr/scheduleTimeDisplay';

export type SignatureSheetLocationLabel = '' | 'WORK AT SITE' | 'ABSENT';

export type SignatureSheetEntry = {
  serial: number;
  employeeId: string;
  employeeName: string;
  dutyIn: string;
  breakOut: string;
  breakIn: string;
  dutyOut: string;
  locationLabel: SignatureSheetLocationLabel;
  signatureNote: string;
  noSignRequired: boolean;
};

export type SignatureSheetPayload = {
  workDate: string;
  groupName: string;
  companyName: string;
  entries: SignatureSheetEntry[];
  generatedAt: string;
};

export class SignatureSheetNoEmployeesError extends Error {
  constructor(groupName: string) {
    super(`No active employees found for signature group "${groupName}".`);
    this.name = 'SignatureSheetNoEmployeesError';
  }
}

type EmployeeRow = {
  id: string;
  fullName: string;
  preferredName: string | null;
};

type AssignmentRow = {
  shiftStart: string | null;
  shiftEnd: string | null;
  breakWindow: string | null;
  locationType: AssignmentLocationType;
  teamLeaderEmployeeId: string | null;
  driver1EmployeeId: string | null;
  driver2EmployeeId: string | null;
  members: Array<{ employeeId: string }>;
};

export type ScheduleSnapshot = {
  absences: Set<string>;
  assignmentByEmployee: Map<string, AssignmentRow>;
};

export function buildScheduleSnapshot(input: {
  absences: Array<{ employeeId: string }>;
  assignments: AssignmentRow[];
}): ScheduleSnapshot {
  const absences = new Set(input.absences.map((row) => row.employeeId));
  const assignmentByEmployee = new Map<string, AssignmentRow>();

  const register = (employeeId: string | null | undefined, assignment: AssignmentRow) => {
    if (!employeeId || assignmentByEmployee.has(employeeId)) return;
    assignmentByEmployee.set(employeeId, assignment);
  };

  for (const assignment of input.assignments) {
    for (const member of assignment.members) {
      register(member.employeeId, assignment);
    }
    register(assignment.teamLeaderEmployeeId, assignment);
    register(assignment.driver1EmployeeId, assignment);
    register(assignment.driver2EmployeeId, assignment);
  }

  return { absences, assignmentByEmployee };
}

function employeeDisplayName(employee: EmployeeRow): string {
  return (employee.preferredName || employee.fullName).trim();
}

export function formatSignatureSheetDateLabel(workDateYmd: string): string {
  const date = new Date(`${workDateYmd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return workDateYmd;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function breakTimesForDisplay(breakWindow: string | null | undefined): { breakOut: string; breakIn: string } {
  const parsed = parseBreakWindow(breakWindow);
  // parseBreakWindow stores the first segment in breakInAt and the second in breakOutAt.
  return {
    breakOut: formatScheduleTimeForPrint(parsed.breakInAt),
    breakIn: formatScheduleTimeForPrint(parsed.breakOutAt),
  };
}

export function buildSignatureSheetEntries(input: {
  workDateYmd: string;
  employees: EmployeeRow[];
  schedule: ScheduleSnapshot;
}): SignatureSheetEntry[] {
  const signatureDateLabel = formatSignatureSheetDateLabel(input.workDateYmd);
  const signatureNote = `Sign: ${signatureDateLabel}`;

  return input.employees.map((employee, index) => {
    const assignment = input.schedule.assignmentByEmployee.get(employee.id);
    const onAbsenceList = input.schedule.absences.has(employee.id);
    const assigned = Boolean(assignment) && !onAbsenceList;

    const dutyIn = assigned ? formatScheduleTimeForPrint(assignment?.shiftStart) : '';
    const dutyOut = assigned ? formatScheduleTimeForPrint(assignment?.shiftEnd) : '';
    const { breakOut, breakIn } = assigned
      ? breakTimesForDisplay(assignment?.breakWindow)
      : { breakOut: '', breakIn: '' };

    let locationLabel: SignatureSheetLocationLabel = '';
    if (!assigned) {
      locationLabel = 'ABSENT';
    } else if (assignment?.locationType !== 'FACTORY') {
      locationLabel = 'WORK AT SITE';
    }

    return {
      serial: index + 1,
      employeeId: employee.id,
      employeeName: employeeDisplayName(employee),
      dutyIn,
      breakOut,
      breakIn,
      dutyOut,
      locationLabel,
      signatureNote,
      noSignRequired: locationLabel === 'WORK AT SITE',
    };
  });
}

export async function loadAttendanceSignatureSheet(
  prisma: PrismaClient,
  companyId: string,
  workDateYmd: string,
  groupName: string
): Promise<SignatureSheetPayload> {
  const trimmedGroup = groupName.trim();
  if (!trimmedGroup) {
    throw new Error('Signature group is required');
  }

  const workDate = dateFromYmd(workDateYmd);

  const [company, employees, schedule] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE', signatureGroup: trimmedGroup },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, preferredName: true },
    }),
    prisma.workSchedule.findFirst({
      where: { companyId, workDate },
      include: {
        assignments: {
          orderBy: { columnIndex: 'asc' },
          include: { members: { select: { employeeId: true } } },
        },
        absences: { select: { employeeId: true } },
      },
    }),
  ]);

  if (employees.length === 0) {
    throw new SignatureSheetNoEmployeesError(trimmedGroup);
  }

  const scheduleSnapshot = schedule
    ? buildScheduleSnapshot({
        absences: schedule.absences,
        assignments: schedule.assignments,
      })
    : { absences: new Set<string>(), assignmentByEmployee: new Map<string, AssignmentRow>() };

  const entries = buildSignatureSheetEntries({
    workDateYmd,
    employees,
    schedule: scheduleSnapshot,
  });

  return {
    workDate: workDateYmd,
    groupName: trimmedGroup,
    companyName: company?.name ?? '',
    entries,
    generatedAt: new Date().toISOString(),
  };
}
