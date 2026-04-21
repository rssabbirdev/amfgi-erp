export type AttendanceReportFieldKey =
  | 'attendance.workDate'
  | 'attendance.status'
  | 'attendance.workflowStatus'
  | 'attendance.checkIn'
  | 'attendance.checkOut'
  | 'attendance.breakHours'
  | 'attendance.totalHours'
  | 'attendance.basicHours'
  | 'attendance.overtimeHours'
  | 'attendance.lateMinutes'
  | 'attendance.earlyLeaveMinutes'
  | 'employee.code'
  | 'employee.fullName'
  | 'employee.preferredName'
  | 'employee.displayName'
  | 'employee.designation'
  | 'employee.department'
  | 'employee.employmentType'
  | 'assignment.groupLabel'
  | 'assignment.locationType'
  | 'assignment.factoryLabel'
  | 'assignment.siteName'
  | 'assignment.clientName'
  | 'assignment.projectDetails'
  | 'job.number'
  | 'job.siteName'
  | 'job.projectName'
  | 'customer.name';

export type AttendanceReportFieldKind = 'text' | 'date' | 'time' | 'hours' | 'number' | 'status';

export type AttendanceReportColumnFormat = 'auto' | 'long' | 'short' | 'decimal' | '24h' | 'label';

export type AttendanceReportBuilderColumn = {
  id: string;
  label: string;
  fieldKey: AttendanceReportFieldKey;
  format?: AttendanceReportColumnFormat;
};

export type AttendanceReportBuilderRow = {
  workDate: string;
  status: string;
  workflowStatus: string;
  checkInMinutes: number | null;
  checkOutMinutes: number | null;
  breakHours: number;
  totalHours: number;
  basicHours: number;
  overtimeHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  employeeCode: string;
  employeeFullName: string;
  employeePreferredName: string;
  employeeDisplayName: string;
  employeeDesignation: string;
  employeeDepartment: string;
  employeeEmploymentType: string;
  assignmentGroupLabel: string;
  assignmentLocationType: string;
  assignmentFactoryLabel: string;
  assignmentSiteName: string;
  assignmentClientName: string;
  assignmentProjectDetails: string;
  jobNumber: string;
  jobSiteName: string;
  jobProjectName: string;
  customerName: string;
};

export const ATTENDANCE_REPORT_BUILDER_FIELDS: Array<{
  key: AttendanceReportFieldKey;
  label: string;
  group: string;
  kind: AttendanceReportFieldKind;
}> = [
  { key: 'attendance.workDate', label: 'Work Date', group: 'Attendance', kind: 'date' },
  { key: 'attendance.status', label: 'Attendance Status', group: 'Attendance', kind: 'status' },
  { key: 'attendance.workflowStatus', label: 'Workflow Status', group: 'Attendance', kind: 'text' },
  { key: 'attendance.checkIn', label: 'Check In', group: 'Attendance', kind: 'time' },
  { key: 'attendance.checkOut', label: 'Check Out', group: 'Attendance', kind: 'time' },
  { key: 'attendance.breakHours', label: 'Break Hours', group: 'Attendance', kind: 'hours' },
  { key: 'attendance.totalHours', label: 'Total Hours', group: 'Attendance', kind: 'hours' },
  { key: 'attendance.basicHours', label: 'Basic Hours', group: 'Attendance', kind: 'hours' },
  { key: 'attendance.overtimeHours', label: 'Overtime Hours', group: 'Attendance', kind: 'hours' },
  { key: 'attendance.lateMinutes', label: 'Late Minutes', group: 'Attendance', kind: 'number' },
  { key: 'attendance.earlyLeaveMinutes', label: 'Early Leave Minutes', group: 'Attendance', kind: 'number' },
  { key: 'employee.code', label: 'Employee Code', group: 'Employee', kind: 'text' },
  { key: 'employee.fullName', label: 'Full Name', group: 'Employee', kind: 'text' },
  { key: 'employee.preferredName', label: 'Preferred Name', group: 'Employee', kind: 'text' },
  { key: 'employee.displayName', label: 'Display Name', group: 'Employee', kind: 'text' },
  { key: 'employee.designation', label: 'Designation', group: 'Employee', kind: 'text' },
  { key: 'employee.department', label: 'Department', group: 'Employee', kind: 'text' },
  { key: 'employee.employmentType', label: 'Employment Type', group: 'Employee', kind: 'text' },
  { key: 'assignment.groupLabel', label: 'Group Label', group: 'Assignment', kind: 'text' },
  { key: 'assignment.locationType', label: 'Location Type', group: 'Assignment', kind: 'text' },
  { key: 'assignment.factoryLabel', label: 'Factory Label', group: 'Assignment', kind: 'text' },
  { key: 'assignment.siteName', label: 'Assigned Site Name', group: 'Assignment', kind: 'text' },
  { key: 'assignment.clientName', label: 'Assigned Customer Name', group: 'Assignment', kind: 'text' },
  { key: 'assignment.projectDetails', label: 'Assignment Project Details', group: 'Assignment', kind: 'text' },
  { key: 'job.number', label: 'Job Number', group: 'Job', kind: 'text' },
  { key: 'job.siteName', label: 'Job Site Name', group: 'Job', kind: 'text' },
  { key: 'job.projectName', label: 'Project Name', group: 'Job', kind: 'text' },
  { key: 'customer.name', label: 'Customer Name', group: 'Customer', kind: 'text' },
];

const FIELD_MAP = new Map(ATTENDANCE_REPORT_BUILDER_FIELDS.map((field) => [field.key, field]));

export const DEFAULT_ATTENDANCE_REPORT_SCHEMA: AttendanceReportBuilderColumn[] = [
  { id: 'date', label: 'Date', fieldKey: 'attendance.workDate', format: 'long' },
  { id: 'location', label: 'Work Location', fieldKey: 'assignment.siteName', format: 'auto' },
  { id: 'jobNo', label: 'Job No', fieldKey: 'job.number', format: 'auto' },
  { id: 'in', label: 'In', fieldKey: 'attendance.checkIn', format: 'decimal' },
  { id: 'out', label: 'Out', fieldKey: 'attendance.checkOut', format: 'decimal' },
  { id: 'break', label: 'Break', fieldKey: 'attendance.breakHours', format: 'decimal' },
  { id: 'total', label: 'Total Hrs', fieldKey: 'attendance.totalHours', format: 'decimal' },
  { id: 'basic', label: 'Basic Hrs', fieldKey: 'attendance.basicHours', format: 'decimal' },
  { id: 'ot', label: 'OT Hrs', fieldKey: 'attendance.overtimeHours', format: 'decimal' },
  { id: 'status', label: 'Status', fieldKey: 'attendance.status', format: 'auto' },
];

export function attendanceReportFieldLabel(key: AttendanceReportFieldKey) {
  return FIELD_MAP.get(key)?.label ?? key;
}

export function attendanceReportFieldKind(key: AttendanceReportFieldKey) {
  return FIELD_MAP.get(key)?.kind ?? 'text';
}

export function attendanceStatusLabel(status: string) {
  if (status === 'ABSENT') return 'Absent';
  if (status === 'LEAVE') return 'Leave';
  if (status === 'HALF_DAY') return 'Half Day';
  if (status === 'MISSING_PUNCH') return 'Missing Punch';
  return '';
}

function formatDateValue(value: string, format: AttendanceReportColumnFormat) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    weekday: format === 'short' ? undefined : 'long',
    day: '2-digit',
    month: format === 'short' ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function formatTimeValue(value: number | null, format: AttendanceReportColumnFormat) {
  if (value == null || !Number.isFinite(value)) return '';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (format === '24h') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return (Math.round((hours + minutes / 60) * 10) / 10).toFixed(1);
}

function formatHoursValue(value: number, format: AttendanceReportColumnFormat) {
  const rounded = Math.round(value * 100) / 100;
  if (format === 'label') return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)} h`;
  return Number(rounded.toFixed(2));
}

function rawFieldValue(row: AttendanceReportBuilderRow, key: AttendanceReportFieldKey) {
  switch (key) {
    case 'attendance.workDate':
      return row.workDate;
    case 'attendance.status':
      return row.status;
    case 'attendance.workflowStatus':
      return row.workflowStatus;
    case 'attendance.checkIn':
      return row.checkInMinutes;
    case 'attendance.checkOut':
      return row.checkOutMinutes;
    case 'attendance.breakHours':
      return row.breakHours;
    case 'attendance.totalHours':
      return row.totalHours;
    case 'attendance.basicHours':
      return row.basicHours;
    case 'attendance.overtimeHours':
      return row.overtimeHours;
    case 'attendance.lateMinutes':
      return row.lateMinutes;
    case 'attendance.earlyLeaveMinutes':
      return row.earlyLeaveMinutes;
    case 'employee.code':
      return row.employeeCode;
    case 'employee.fullName':
      return row.employeeFullName;
    case 'employee.preferredName':
      return row.employeePreferredName;
    case 'employee.displayName':
      return row.employeeDisplayName;
    case 'employee.designation':
      return row.employeeDesignation;
    case 'employee.department':
      return row.employeeDepartment;
    case 'employee.employmentType':
      return row.employeeEmploymentType;
    case 'assignment.groupLabel':
      return row.assignmentGroupLabel;
    case 'assignment.locationType':
      return row.assignmentLocationType;
    case 'assignment.factoryLabel':
      return row.assignmentFactoryLabel;
    case 'assignment.siteName':
      return row.assignmentSiteName;
    case 'assignment.clientName':
      return row.assignmentClientName;
    case 'assignment.projectDetails':
      return row.assignmentProjectDetails;
    case 'job.number':
      return row.jobNumber;
    case 'job.siteName':
      return row.jobSiteName;
    case 'job.projectName':
      return row.jobProjectName;
    case 'customer.name':
      return row.customerName;
    default:
      return '';
  }
}

export function formatAttendanceReportBuilderCell(
  row: AttendanceReportBuilderRow,
  column: AttendanceReportBuilderColumn
) {
  const kind = attendanceReportFieldKind(column.fieldKey);
  const value = rawFieldValue(row, column.fieldKey);
  const format = column.format ?? 'auto';

  if (kind === 'date') return formatDateValue(String(value || ''), format === 'short' ? 'short' : 'long');
  if (kind === 'time') return formatTimeValue(typeof value === 'number' ? value : null, format === '24h' ? '24h' : 'decimal');
  if (kind === 'hours') return formatHoursValue(typeof value === 'number' ? value : 0, format === 'label' ? 'label' : 'decimal');
  if (kind === 'status') return attendanceStatusLabel(String(value || ''));
  return value ?? '';
}

export function normalizeAttendanceReportBuilderSchema(input: string | null | undefined) {
  if (!input) return [...DEFAULT_ATTENDANCE_REPORT_SCHEMA];
  try {
    const parsed = JSON.parse(input) as AttendanceReportBuilderColumn[];
    const normalized = parsed
      .filter((column) => column && typeof column.label === 'string' && typeof column.fieldKey === 'string')
      .map((column, index) => ({
        id: typeof column.id === 'string' && column.id.trim() ? column.id.trim() : `col-${index + 1}`,
        label: column.label.trim() || attendanceReportFieldLabel(column.fieldKey as AttendanceReportFieldKey),
        fieldKey: FIELD_MAP.has(column.fieldKey as AttendanceReportFieldKey)
          ? (column.fieldKey as AttendanceReportFieldKey)
          : DEFAULT_ATTENDANCE_REPORT_SCHEMA[0]!.fieldKey,
        format: column.format ?? 'auto',
      }));
    return normalized.length > 0 ? normalized : [...DEFAULT_ATTENDANCE_REPORT_SCHEMA];
  } catch {
    return [...DEFAULT_ATTENDANCE_REPORT_SCHEMA];
  }
}
