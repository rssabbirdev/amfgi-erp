import { prisma } from '@/lib/db/prisma';
import {
  basicHoursForProfileExtension,
  employeeTypeFromProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';
import { Prisma } from '@prisma/client';
import { attendanceReportStatusLabel } from '@/lib/hr/attendanceReportFormatting';
import type { AttendanceReportBuilderRow } from '@/lib/hr/attendanceReportBuilder';

export type AttendanceReportRow = AttendanceReportBuilderRow & {
  workLocation: string;
  jobNumber: string;
  groupLabel: string;
  workedMinutes: number;
  overtimeMinutes: number;
};

export type AttendanceEmployeeReport = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  attendanceDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDayDays: number;
  missingPunchDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  entries: AttendanceReportRow[];
};

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month, expected YYYY-MM');
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

function diffMinutes(start: Date | null | undefined, end: Date | null | undefined) {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

function minutesOfDay(date: Date | null | undefined) {
  if (!date) return null;
  const parts = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Dubai',
  });
  const [hours, minutes] = parts.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isoDay(date: Date | null | undefined) {
  if (!date) return '';
  return date.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Dubai',
  });
}

export function formatHoursFromMinutes(minutes: number) {
  const hours = minutes / 60;
  return Math.round(hours * 100) / 100;
}

function locationLabel(
  employeeType: string,
  workAssignment:
    | {
        locationType?: string | null;
        factoryCode?: string | null;
        factoryLabel?: string | null;
        siteNameSnapshot?: string | null;
      }
    | null
) {
  if (workAssignment?.locationType === 'FACTORY') {
    return workAssignment.factoryLabel || workAssignment.factoryCode || 'FACTORY';
  }
  if (workAssignment?.locationType === 'SITE_JOB') {
    return workAssignment.siteNameSnapshot || '';
  }
  if (workAssignment?.locationType === 'OTHER') {
    return workAssignment.siteNameSnapshot || 'OTHER';
  }
  if (employeeType === 'OFFICE_STAFF') return 'Office';
  if (employeeType === 'DRIVER') return 'Driver';
  if (employeeType === 'HYBRID_STAFF') return 'Office';
  return '';
}

export function exportStatusLabel(status: string) {
  return attendanceReportStatusLabel(status);
}

function exportWorkLocation(status: string, resolvedLocation: string) {
  const statusLabel = exportStatusLabel(status);
  if (statusLabel && !resolvedLocation) return statusLabel;
  if (status === 'ABSENT') return statusLabel;
  return resolvedLocation;
}

const attendanceReportEmployeeSelect = {
  id: true,
  employeeCode: true,
  fullName: true,
  preferredName: true,
  designation: true,
  department: true,
  employmentType: true,
  profileExtension: true,
} as const;

const attendanceReportWorkAssignmentSelect = {
  label: true,
  jobNumberSnapshot: true,
  locationType: true,
  factoryCode: true,
  factoryLabel: true,
  siteNameSnapshot: true,
  clientNameSnapshot: true,
  projectDetailsSnapshot: true,
  job: {
    select: {
      jobNumber: true,
      site: true,
      projectName: true,
      customer: {
        select: { name: true },
      },
    },
  },
} as const;

async function findMonthlyAttendanceRows(companyId: string, start: Date, end: Date) {
  const baseArgs = {
    where: { companyId, workDate: { gte: start, lt: end } },
    orderBy: [
      { employee: { fullName: 'asc' } },
      { workDate: 'asc' },
    ] as Prisma.AttendanceEntryOrderByWithRelationInput[],
  };

  try {
    return await prisma.attendanceEntry.findMany({
      ...baseArgs,
      select: {
        employeeId: true,
        workDate: true,
        status: true,
        workflowStatus: true,
        checkInAt: true,
        checkOutAt: true,
        breakStartAt: true,
        breakEndAt: true,
        overtimeMinutes: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        employee: { select: attendanceReportEmployeeSelect },
        workAssignment: { select: attendanceReportWorkAssignmentSelect },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingBreakColumns =
      message.includes('attendanceentry.breakstartat') ||
      message.includes('attendanceentry.breakendat') ||
      message.includes('The column `amfgi.attendanceentry.breakstartat` does not exist') ||
      message.includes('The column `amfgi.attendanceentry.breakendat` does not exist');

    if (!missingBreakColumns) throw error;

    const legacyRows = await prisma.attendanceEntry.findMany({
      ...baseArgs,
      select: {
        employeeId: true,
        workDate: true,
        status: true,
        workflowStatus: true,
        checkInAt: true,
        checkOutAt: true,
        overtimeMinutes: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        employee: { select: attendanceReportEmployeeSelect },
        workAssignment: { select: attendanceReportWorkAssignmentSelect },
      },
    });

    return legacyRows.map((row) => ({
      ...row,
      breakStartAt: null,
      breakEndAt: null,
    }));
  }
}

export async function getMonthlyAttendanceReports(companyId: string, month: string) {
  const { start, end } = monthBounds(month);
  const [company, rawRows] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, hrEmployeeTypeSettings: true, printTemplates: true } }),
    findMonthlyAttendanceRows(companyId, start, end),
  ]);

  const rows = rawRows as Array<{
    employeeId: string;
    workDate: Date;
    status: string;
    workflowStatus: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakStartAt?: Date | null;
    breakEndAt?: Date | null;
    overtimeMinutes: number;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    employee: {
      employeeCode: string;
      fullName: string;
      preferredName: string | null;
      designation?: string | null;
      department?: string | null;
      employmentType?: string | null;
      profileExtension: unknown;
    };
    workAssignment: {
      label: string | null;
      jobNumberSnapshot: string | null;
      locationType?: string | null;
      factoryCode?: string | null;
      factoryLabel?: string | null;
      siteNameSnapshot?: string | null;
      clientNameSnapshot?: string | null;
      projectDetailsSnapshot?: string | null;
      job?: {
        jobNumber?: string | null;
        site?: string | null;
        projectName?: string | null;
        customer?: {
          name?: string | null;
        } | null;
      } | null;
    } | null;
  }>;

  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);
  const grouped = new Map<string, AttendanceEmployeeReport>();

  for (const row of rows) {
    const employeeName = row.employee.preferredName || row.employee.fullName;
    const employeeType = employeeTypeFromProfileExtension(row.employee.profileExtension);
    const basicHours = basicHoursForProfileExtension(row.employee.profileExtension, typeSettings);
    const breakMinutes = diffMinutes(row.breakStartAt, row.breakEndAt);
    const workedMinutes = Math.max(0, diffMinutes(row.checkInAt, row.checkOutAt) - breakMinutes);
    const resolvedLocation = locationLabel(employeeType, row.workAssignment);
    const siteName = row.workAssignment?.siteNameSnapshot || row.workAssignment?.job?.site || '';
    const clientName = row.workAssignment?.clientNameSnapshot || row.workAssignment?.job?.customer?.name || '';
    const jobNumber = row.workAssignment?.jobNumberSnapshot || row.workAssignment?.job?.jobNumber || '';

    const reportRow: AttendanceReportRow = {
      workDate: isoDay(row.workDate),
      workLocation: exportWorkLocation(row.status, resolvedLocation),
      status: row.status,
      workflowStatus: row.workflowStatus,
      jobNumber,
      groupLabel: row.workAssignment?.label || '',
      checkInMinutes: minutesOfDay(row.checkInAt),
      checkOutMinutes: minutesOfDay(row.checkOutAt),
      breakHours: formatHoursFromMinutes(breakMinutes),
      basicHours,
      totalHours: formatHoursFromMinutes(workedMinutes),
      workedMinutes,
      overtimeHours: formatHoursFromMinutes(row.overtimeMinutes),
      overtimeMinutes: row.overtimeMinutes,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      employeeCode: row.employee.employeeCode,
      employeeFullName: row.employee.fullName,
      employeePreferredName: row.employee.preferredName || '',
      employeeDisplayName: row.employee.preferredName || row.employee.fullName,
      employeeDesignation: row.employee.designation || '',
      employeeDepartment: row.employee.department || '',
      employeeEmploymentType: row.employee.employmentType || '',
      assignmentGroupLabel: row.workAssignment?.label || '',
      assignmentLocationType: row.workAssignment?.locationType || '',
      assignmentFactoryLabel: row.workAssignment?.factoryLabel || row.workAssignment?.factoryCode || '',
      assignmentSiteName: siteName,
      assignmentClientName: clientName,
      assignmentProjectDetails: row.workAssignment?.projectDetailsSnapshot || '',
      jobSiteName: row.workAssignment?.job?.site || '',
      jobProjectName: row.workAssignment?.job?.projectName || '',
      customerName: row.workAssignment?.job?.customer?.name || clientName,
    };

    const current = grouped.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      employeeCode: row.employee.employeeCode,
      employeeName,
      attendanceDays: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      halfDayDays: 0,
      missingPunchDays: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      entries: [],
    };

    current.attendanceDays += 1;
    if (row.status === 'PRESENT') current.presentDays += 1;
    if (row.status === 'ABSENT') current.absentDays += 1;
    if (row.status === 'LEAVE') current.leaveDays += 1;
    if (row.status === 'HALF_DAY') current.halfDayDays += 1;
    if (row.status === 'MISSING_PUNCH') current.missingPunchDays += 1;
    current.workedMinutes += workedMinutes;
    current.overtimeMinutes += row.overtimeMinutes;
    current.lateMinutes += row.lateMinutes;
    current.earlyLeaveMinutes += row.earlyLeaveMinutes;
    current.entries.push(reportRow);
    grouped.set(row.employeeId, current);
  }

  return {
    companyName: company?.name || 'Company',
    month,
    employees: [...grouped.values()],
  };
}
