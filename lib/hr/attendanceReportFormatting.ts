export type AttendanceReportColumnKey =
  | 'workDate'
  | 'workLocation'
  | 'jobNumber'
  | 'checkInAt'
  | 'checkOutAt'
  | 'breakHours'
  | 'totalHours'
  | 'basicHours'
  | 'overtimeHours'
  | 'status';

export type AttendanceReportFormatOptions = {
  dateFormat: 'long' | 'short';
  timeFormat: 'decimal' | '24h';
  hoursFormat: 'decimal' | 'label';
};

export type AttendanceReportEntryLike = {
  workDate: string;
  workLocation: string;
  status: string;
  jobNumber: string;
  checkInMinutes: number | null;
  checkOutMinutes: number | null;
  breakHours: number;
  totalHours: number;
  basicHours: number;
  overtimeHours: number;
};

export const ATTENDANCE_REPORT_COLUMN_OPTIONS: Array<{
  key: AttendanceReportColumnKey;
  label: string;
}> = [
  { key: 'workDate', label: 'Date' },
  { key: 'workLocation', label: 'Work Location' },
  { key: 'jobNumber', label: 'Job No' },
  { key: 'checkInAt', label: 'In' },
  { key: 'checkOutAt', label: 'Out' },
  { key: 'breakHours', label: 'Break' },
  { key: 'totalHours', label: 'Total Hrs' },
  { key: 'basicHours', label: 'Basic Hrs' },
  { key: 'overtimeHours', label: 'OT Hrs' },
  { key: 'status', label: 'Status' },
];

export const DEFAULT_ATTENDANCE_REPORT_COLUMNS: AttendanceReportColumnKey[] =
  ATTENDANCE_REPORT_COLUMN_OPTIONS.map((column) => column.key);

export const DEFAULT_ATTENDANCE_REPORT_FORMATS: AttendanceReportFormatOptions = {
  dateFormat: 'long',
  timeFormat: 'decimal',
  hoursFormat: 'decimal',
};

const VALID_COLUMN_KEYS = new Set<AttendanceReportColumnKey>(DEFAULT_ATTENDANCE_REPORT_COLUMNS);

export function normalizeAttendanceReportColumns(value: string | string[] | null | undefined) {
  const rawList = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const filtered = rawList
    .map((item) => item.trim())
    .filter((item): item is AttendanceReportColumnKey => VALID_COLUMN_KEYS.has(item as AttendanceReportColumnKey));

  return filtered.length > 0 ? filtered : [...DEFAULT_ATTENDANCE_REPORT_COLUMNS];
}

export function normalizeAttendanceReportFormats(value: Partial<Record<keyof AttendanceReportFormatOptions, string>>) {
  return {
    dateFormat: value.dateFormat === 'short' ? 'short' : DEFAULT_ATTENDANCE_REPORT_FORMATS.dateFormat,
    timeFormat: value.timeFormat === '24h' ? '24h' : DEFAULT_ATTENDANCE_REPORT_FORMATS.timeFormat,
    hoursFormat: value.hoursFormat === 'label' ? 'label' : DEFAULT_ATTENDANCE_REPORT_FORMATS.hoursFormat,
  } satisfies AttendanceReportFormatOptions;
}

export function attendanceReportColumnLabel(key: AttendanceReportColumnKey) {
  return ATTENDANCE_REPORT_COLUMN_OPTIONS.find((column) => column.key === key)?.label ?? key;
}

export function attendanceReportStatusLabel(status: string) {
  if (status === 'ABSENT') return 'Absent';
  if (status === 'LEAVE') return 'Leave';
  if (status === 'HALF_DAY') return 'Half Day';
  if (status === 'MISSING_PUNCH') return 'Missing Punch';
  return '';
}

export function formatAttendanceReportDate(value: string, format: AttendanceReportFormatOptions['dateFormat']) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-GB', {
    weekday: format === 'long' ? 'long' : undefined,
    day: '2-digit',
    month: format === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

export function formatAttendanceReportTime(
  minutes: number | null | undefined,
  format: AttendanceReportFormatOptions['timeFormat']
) {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (format === '24h') {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  return (Math.round(((hours + mins / 60) * 10)) / 10).toFixed(1);
}

export function formatAttendanceReportHours(
  value: number | null | undefined,
  format: AttendanceReportFormatOptions['hoursFormat']
) {
  if (value == null || !Number.isFinite(value)) return format === 'label' ? '' : 0;
  const rounded = Math.round(value * 100) / 100;
  if (format === 'label') return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)} h`;
  return Number(rounded.toFixed(2));
}

export function formatAttendanceReportCell(
  entry: AttendanceReportEntryLike,
  column: AttendanceReportColumnKey,
  formats: AttendanceReportFormatOptions
) {
  switch (column) {
    case 'workDate':
      return formatAttendanceReportDate(entry.workDate, formats.dateFormat);
    case 'workLocation':
      return entry.workLocation || '';
    case 'jobNumber':
      return entry.jobNumber || '';
    case 'checkInAt':
      return formatAttendanceReportTime(entry.checkInMinutes, formats.timeFormat);
    case 'checkOutAt':
      return formatAttendanceReportTime(entry.checkOutMinutes, formats.timeFormat);
    case 'breakHours':
      return formatAttendanceReportHours(entry.breakHours, formats.hoursFormat);
    case 'totalHours':
      return formatAttendanceReportHours(entry.totalHours, formats.hoursFormat);
    case 'basicHours':
      return formatAttendanceReportHours(entry.basicHours, formats.hoursFormat);
    case 'overtimeHours':
      return formatAttendanceReportHours(entry.overtimeHours, formats.hoursFormat);
    case 'status':
      return attendanceReportStatusLabel(entry.status);
    default:
      return '';
  }
}
