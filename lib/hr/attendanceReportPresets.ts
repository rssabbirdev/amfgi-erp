import type { AttendanceReportBuilderColumn } from '@/lib/hr/attendanceReportBuilder';

export type AttendanceReportPreset = {
  id: string;
  name: string;
  schema: AttendanceReportBuilderColumn[];
};

export function attendanceReportPresetStorageKey(companyKey: string) {
  return `attendance-report-builder-presets:${companyKey}`;
}

export function readAttendanceReportPresets(companyKey: string) {
  if (typeof window === 'undefined') return [] as AttendanceReportPreset[];
  try {
    const raw = window.localStorage.getItem(attendanceReportPresetStorageKey(companyKey));
    const parsed = raw ? (JSON.parse(raw) as AttendanceReportPreset[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAttendanceReportPresets(companyKey: string, presets: AttendanceReportPreset[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(attendanceReportPresetStorageKey(companyKey), JSON.stringify(presets));
}
