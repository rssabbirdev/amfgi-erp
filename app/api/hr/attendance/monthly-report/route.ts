import * as XLSX from 'xlsx';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { formatHoursFromMinutes, getMonthlyAttendanceReports } from '@/lib/hr/attendanceReports';
import {
  attendanceReportColumnLabel,
  formatAttendanceReportCell,
  normalizeAttendanceReportColumns,
  normalizeAttendanceReportFormats,
} from '@/lib/hr/attendanceReportFormatting';
import {
  DEFAULT_ATTENDANCE_REPORT_SCHEMA,
  formatAttendanceReportBuilderCell,
  normalizeAttendanceReportBuilderSchema,
} from '@/lib/hr/attendanceReportBuilder';

function sanitizeSheetName(name: string, used: Set<string>) {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, ' ').trim() || 'Employee';
  let candidate = cleaned.slice(0, 31);
  let counter = 1;
  while (used.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const month = String(searchParams.get('month') ?? '').trim();
  if (!month) return errorResponse('month query required (YYYY-MM)', 400);

  const employeeId = String(searchParams.get('employeeId') ?? '').trim() || null;
  const format = String(searchParams.get('format') ?? 'json').trim();
  const builderSchema = normalizeAttendanceReportBuilderSchema(searchParams.get('schema'));
  const selectedColumns = normalizeAttendanceReportColumns(searchParams.get('columns'));
  const selectedFormats = normalizeAttendanceReportFormats({
    dateFormat: String(searchParams.get('dateFormat') ?? ''),
    timeFormat: String(searchParams.get('timeFormat') ?? ''),
    hoursFormat: String(searchParams.get('hoursFormat') ?? ''),
  });

  let report;
  try {
    report = await getMonthlyAttendanceReports(companyId, month);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to build report', 400);
  }

  const employees = employeeId
    ? report.employees.filter((employee) => employee.employeeId === employeeId)
    : report.employees;

  if (format === 'xlsx') {
    if (employees.length === 0) return errorResponse('No attendance rows found for the selected month', 404);

    const workbook = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    for (const employee of employees) {
      const activeSchema = searchParams.get('schema') ? builderSchema : null;
      const rows = [
        activeSchema
          ? activeSchema.map((column) => column.label)
          : selectedColumns.map((column) => attendanceReportColumnLabel(column)),
        ...employee.entries.map((entry) =>
          activeSchema
            ? activeSchema.map((column) => formatAttendanceReportBuilderCell(entry, column))
            : selectedColumns.map((column) => formatAttendanceReportCell(entry, column, selectedFormats))
        ),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = (activeSchema ?? DEFAULT_ATTENDANCE_REPORT_SCHEMA).map((column) => {
        if ('fieldKey' in column) {
          if (column.fieldKey === 'attendance.workDate') return { wch: column.format === 'short' ? 16 : 28 };
          if (column.fieldKey === 'assignment.siteName' || column.fieldKey === 'job.siteName' || column.fieldKey === 'assignment.projectDetails') return { wch: 42 };
          return { wch: 16 };
        }
        if (column === 'workDate') return { wch: selectedFormats.dateFormat === 'long' ? 28 : 16 };
        if (column === 'workLocation') return { wch: 42 };
        if (column === 'jobNumber') return { wch: 16 };
        if (column === 'status') return { wch: 16 };
        return { wch: 12 };
      });
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(employee.employeeName, usedNames));
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = employeeId
      ? `attendance-${report.month}-${employees[0]?.employeeCode || 'employee'}.xlsx`
      : `attendance-${report.month}-all-employees.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const selectedEmployee = employeeId ? employees[0] ?? null : null;

  return successResponse({
    companyName: report.companyName,
    month: report.month,
    builderSchema,
    selectedColumns,
    selectedFormats,
    employeeSummaries: report.employees.map((employee) => ({
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.employeeName,
      attendanceDays: employee.attendanceDays,
      presentDays: employee.presentDays,
      absentDays: employee.absentDays,
      leaveDays: employee.leaveDays,
      halfDayDays: employee.halfDayDays,
      workedHours: formatHoursFromMinutes(employee.workedMinutes),
      overtimeHours: formatHoursFromMinutes(employee.overtimeMinutes),
    })),
    selectedEmployee,
  });
}
