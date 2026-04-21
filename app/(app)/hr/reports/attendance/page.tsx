'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import {
  DEFAULT_ATTENDANCE_REPORT_COLUMNS,
  DEFAULT_ATTENDANCE_REPORT_FORMATS,
  type AttendanceReportColumnKey,
  type AttendanceReportFormatOptions,
  attendanceReportColumnLabel,
  formatAttendanceReportCell,
} from '@/lib/hr/attendanceReportFormatting';
import {
  formatAttendanceReportBuilderCell,
  type AttendanceReportBuilderColumn,
} from '@/lib/hr/attendanceReportBuilder';
import {
  readAttendanceReportPresets,
  type AttendanceReportPreset,
} from '@/lib/hr/attendanceReportPresets';

type EmployeeSummary = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  attendanceDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDayDays: number;
  workedHours: number;
  overtimeHours: number;
};

type EmployeeEntry = {
  workDate: string;
  workLocation: string;
  status: string;
  workflowStatus: string;
  jobNumber: string;
  groupLabel: string;
  checkInMinutes: number | null;
  checkOutMinutes: number | null;
  breakHours: number;
  basicHours: number;
  totalHours: number;
  workedMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
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
  jobSiteName: string;
  jobProjectName: string;
  customerName: string;
};

type SelectedEmployeeReport = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  attendanceDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDayDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  entries: EmployeeEntry[];
};

type MonthlyReportPayload = {
  companyName: string;
  month: string;
  selectedColumns: AttendanceReportColumnKey[];
  selectedFormats: AttendanceReportFormatOptions;
  employeeSummaries: EmployeeSummary[];
  selectedEmployee: SelectedEmployeeReport | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatHours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)} h`;
}

async function downloadFile(url: string, filenameFallback: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const maybeJson = await res.json().catch(() => null);
    throw new Error(maybeJson?.error ?? 'Download failed');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filenameFallback;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function buildBaseQuery(
  month: string,
  selectedColumns: AttendanceReportColumnKey[],
  selectedFormats: AttendanceReportFormatOptions,
  employeeId?: string,
  format?: 'json' | 'xlsx'
) {
  const query = new URLSearchParams({
    month,
    columns: selectedColumns.join(','),
    dateFormat: selectedFormats.dateFormat,
    timeFormat: selectedFormats.timeFormat,
    hoursFormat: selectedFormats.hoursFormat,
  });

  if (employeeId) query.set('employeeId', employeeId);
  if (format) query.set('format', format);
  return query;
}

function buildQueryString(
  month: string,
  selectedColumns: AttendanceReportColumnKey[],
  selectedFormats: AttendanceReportFormatOptions,
  schema: AttendanceReportBuilderColumn[] | null,
  employeeId?: string,
  format?: 'json' | 'xlsx'
) {
  const query = buildBaseQuery(month, selectedColumns, selectedFormats, employeeId, format);
  if (schema && schema.length > 0) {
    query.set('schema', JSON.stringify(schema));
  }
  return query.toString();
}

export default function HrAttendanceReportPage() {
  const { data: session } = useSession();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyReportPayload | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingEmployee, setRefreshingEmployee] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingEmployee, setDownloadingEmployee] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedColumns] = useState<AttendanceReportColumnKey[]>(DEFAULT_ATTENDANCE_REPORT_COLUMNS);
  const [selectedFormats] = useState<AttendanceReportFormatOptions>(DEFAULT_ATTENDANCE_REPORT_FORMATS);
  const [savedPresets, setSavedPresets] = useState<AttendanceReportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [selectedPresetSchema, setSelectedPresetSchema] = useState<AttendanceReportBuilderColumn[] | null>(null);
  const hasReportRef = useRef(false);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const companyStorageKey = String(session?.user?.activeCompanyId ?? report?.companyName ?? 'default-company');

  useEffect(() => {
    hasReportRef.current = !!report;
  }, [report]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) {
        if (hasReportRef.current) setRefreshingEmployee(true);
        else setLoading(true);
      }
      const query = buildQueryString(
        month,
        selectedColumns,
        selectedFormats,
        selectedPresetSchema,
        selectedEmployeeId || undefined,
        'json'
      );
      const res = await fetch(`/api/hr/attendance/monthly-report?${query}`, { cache: 'no-store' });
      const json = await res.json();
      if (!cancelled && res.ok && json?.success) {
        const data = json.data as MonthlyReportPayload;
        setReport(data);
        if (!selectedEmployeeId && data.employeeSummaries.length > 0) {
          setSelectedEmployeeId(data.employeeSummaries[0].employeeId);
        }
      }
      if (!cancelled) {
        setLoading(false);
        setRefreshingEmployee(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, month, selectedEmployeeId, selectedColumns, selectedFormats, selectedPresetSchema]);

  useEffect(() => {
    setSavedPresets(readAttendanceReportPresets(companyStorageKey));
  }, [companyStorageKey]);

  useEffect(() => {
    if (!report) return;
    if (selectedEmployeeId && report.selectedEmployee) return;
    if (report.employeeSummaries.length === 0) return;
    const hasSelectedSummary = report.employeeSummaries.some((employee) => employee.employeeId === selectedEmployeeId);
    if (!hasSelectedSummary) {
      setSelectedEmployeeId(report.employeeSummaries[0]!.employeeId);
    }
  }, [report, selectedEmployeeId]);

  const visibleEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !report) return report?.employeeSummaries ?? [];
    return report.employeeSummaries.filter((employee) =>
      [employee.employeeName, employee.employeeCode].join(' ').toLowerCase().includes(q)
    );
  }, [report, search]);

  if (!canView) return <div className="text-slate-400">Forbidden</div>;

  const selectedEmployee = report?.selectedEmployee ?? null;
  const usingSavedPreset = !!selectedPresetSchema;
  const showEmployeeListLoading = loading && !report;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">HR Reports</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Monthly attendance report</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Review monthly attendance with either the standard layout controls or any saved preset from the dedicated builder.
            </p>
            <div className="mt-4">
              <Link href="/hr/reports/attendance/builder" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
                Open dedicated report builder
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-300">
              <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Saved preset</span>
              <select
                value={selectedPresetId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedPresetId(nextId);
                  if (!nextId) {
                    setSelectedPresetSchema(null);
                    return;
                  }
                  const preset = savedPresets.find((item) => item.id === nextId);
                  setSelectedPresetSchema(preset?.schema ?? null);
                }}
                className="min-w-[14rem] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white shadow-sm"
              >
                <option value="">Standard report</option>
                {savedPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white shadow-sm"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  setDownloadingAll(true);
                  await downloadFile(
                    `/api/hr/attendance/monthly-report?${buildQueryString(month, selectedColumns, selectedFormats, selectedPresetSchema, undefined, 'xlsx')}`,
                    `attendance-${month}-all-employees.xlsx`
                  );
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Download failed');
                } finally {
                  setDownloadingAll(false);
                }
              }}
              loading={downloadingAll}
            >
              Download full workbook
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!selectedEmployeeId) return;
                try {
                  setDownloadingEmployee(true);
                  await downloadFile(
                    `/api/hr/attendance/monthly-report?${buildQueryString(month, selectedColumns, selectedFormats, selectedPresetSchema, selectedEmployeeId, 'xlsx')}`,
                    `attendance-${month}-employee.xlsx`
                  );
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Download failed');
                } finally {
                  setDownloadingEmployee(false);
                }
              }}
              disabled={!selectedEmployeeId}
              loading={downloadingEmployee}
            >
              Download selected employee
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            {!selectedEmployee ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">
                Select an employee to review monthly attendance details.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{selectedEmployee.employeeName}</h2>
                    <p className="mt-1 text-sm text-slate-400">{selectedEmployee.employeeCode} · {report?.month}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {refreshingEmployee ? 'Refreshing' : 'Worked hours'}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">{formatHours(selectedEmployee.workedMinutes / 60)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Attendance days</p>
                    <p className="mt-2 text-xl font-semibold text-white">{selectedEmployee.attendanceDays}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Present</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">{selectedEmployee.presentDays}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Absent</p>
                    <p className="mt-2 text-xl font-semibold text-amber-300">{selectedEmployee.absentDays}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Leave</p>
                    <p className="mt-2 text-xl font-semibold text-white">{selectedEmployee.leaveDays}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Half day</p>
                    <p className="mt-2 text-xl font-semibold text-white">{selectedEmployee.halfDayDays}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Overtime</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">{formatHours(selectedEmployee.overtimeMinutes / 60)}</p>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-white">Monthly detail</h2>
              <p className="mt-1 text-sm text-slate-400">The preview and Excel download always use the same selected columns and format rules.</p>
            </div>
            {!selectedEmployee ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">
                No employee selected.
              </div>
            ) : selectedEmployee.entries.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">
                No attendance rows found for this employee in the selected month.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/45">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {usingSavedPreset
                        ? selectedPresetSchema?.map((column) => (
                            <th key={column.id} className="px-4 py-3">{column.label}</th>
                          ))
                        : selectedColumns.map((column) => (
                            <th key={column} className="px-4 py-3">{attendanceReportColumnLabel(column)}</th>
                          ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {selectedEmployee.entries.map((entry) => (
                      <tr key={`${entry.workDate}-${entry.jobNumber}-${entry.groupLabel}-${entry.checkInMinutes ?? 'na'}`} className="hover:bg-white/5">
                        {usingSavedPreset
                          ? selectedPresetSchema?.map((column) => (
                              <td key={column.id} className="px-4 py-3 align-top text-slate-300 first:text-white">
                                {String(formatAttendanceReportBuilderCell(entry, column) ?? '')}
                              </td>
                            ))
                          : selectedColumns.map((column) => (
                              <td key={column} className="px-4 py-3 align-top text-slate-300 first:text-white">
                                {String(formatAttendanceReportCell(entry, column, selectedFormats) ?? '')}
                              </td>
                            ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-white">Employees with attendance</h2>
              <p className="mt-1 text-sm text-slate-400">Pick an employee to review the month and export their sheet.</p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or code"
              className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {showEmployeeListLoading ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">Loading report...</div>
              ) : visibleEmployees.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">No attendance found for this month.</div>
              ) : (
                visibleEmployees.map((employee) => (
                  <button
                    key={employee.employeeId}
                    type="button"
                    onClick={() => setSelectedEmployeeId(employee.employeeId)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      selectedEmployeeId === employee.employeeId
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-white/10 bg-slate-950/50 hover:bg-white/5'
                    }`}
                  >
                    <p className="text-sm font-medium text-white">{employee.employeeName}</p>
                    <p className="mt-1 text-xs text-slate-500">{employee.employeeCode}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                      <span>{employee.attendanceDays} days</span>
                      <span>{formatHours(employee.workedHours)}</span>
                      <span>{formatHours(employee.overtimeHours)} OT</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
