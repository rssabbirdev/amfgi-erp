'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import {
  ATTENDANCE_REPORT_BUILDER_FIELDS,
  DEFAULT_ATTENDANCE_REPORT_SCHEMA,
  attendanceReportFieldKind,
  formatAttendanceReportBuilderCell,
  type AttendanceReportBuilderColumn,
  type AttendanceReportBuilderRow,
  type AttendanceReportColumnFormat,
  type AttendanceReportFieldKey,
} from '@/lib/hr/attendanceReportBuilder';
import {
  readAttendanceReportPresets,
  writeAttendanceReportPresets,
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
  missingPunchDays: number;
  workedHours: number;
  overtimeHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
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
  missingPunchDays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  entries: AttendanceReportBuilderRow[];
};

type MonthlyReportPayload = {
  companyName: string;
  month: string;
  employeeSummaries: EmployeeSummary[];
  selectedEmployee: SelectedEmployeeReport | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatHours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)} h`;
}

function makeColumn(fieldKey: AttendanceReportFieldKey, index: number): AttendanceReportBuilderColumn {
  const field = ATTENDANCE_REPORT_BUILDER_FIELDS.find((item) => item.key === fieldKey) ?? ATTENDANCE_REPORT_BUILDER_FIELDS[0]!;
  return {
    id: `custom-${index}-${Date.now()}`,
    label: field.label,
    fieldKey: field.key,
    format: 'auto',
  };
}

function availableFormats(fieldKey: AttendanceReportFieldKey) {
  const kind = attendanceReportFieldKind(fieldKey);
  if (kind === 'date') {
    return [
      { value: 'auto', label: 'Long date' },
      { value: 'short', label: 'Short date' },
    ] as Array<{ value: AttendanceReportColumnFormat; label: string }>;
  }
  if (kind === 'time') {
    return [
      { value: 'decimal', label: 'Decimal hour' },
      { value: '24h', label: '24-hour' },
    ] as Array<{ value: AttendanceReportColumnFormat; label: string }>;
  }
  if (kind === 'hours') {
    return [
      { value: 'decimal', label: 'Numeric' },
      { value: 'label', label: 'With h label' },
    ] as Array<{ value: AttendanceReportColumnFormat; label: string }>;
  }
  return [{ value: 'auto', label: 'Default' }] as Array<{ value: AttendanceReportColumnFormat; label: string }>;
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

function buildQuery(month: string, employeeId: string, schema: AttendanceReportBuilderColumn[], format?: 'json' | 'xlsx') {
  const query = new URLSearchParams({ month, schema: JSON.stringify(schema) });
  if (employeeId) query.set('employeeId', employeeId);
  if (format) query.set('format', format);
  return query.toString();
}

export default function AttendanceReportBuilderPage() {
  const { data: session } = useSession();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyReportPayload | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [schema, setSchema] = useState<AttendanceReportBuilderColumn[]>(DEFAULT_ATTENDANCE_REPORT_SCHEMA);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingEmployee, setDownloadingEmployee] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<AttendanceReportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetsLoaded, setPresetsLoaded] = useState(false);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.attendance.view');
  const companyStorageKey = String(session?.user?.activeCompanyId ?? report?.companyName ?? 'default-company');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setLoading(true);
      const res = await fetch(
        `/api/hr/attendance/monthly-report?month=${encodeURIComponent(month)}${selectedEmployeeId ? `&employeeId=${encodeURIComponent(selectedEmployeeId)}` : ''}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!cancelled && res.ok && json?.success) {
        const data = json.data as MonthlyReportPayload;
        setReport(data);
        if (!selectedEmployeeId && data.employeeSummaries.length > 0) {
          setSelectedEmployeeId(data.employeeSummaries[0].employeeId);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, month, selectedEmployeeId]);

  useEffect(() => {
    if (!report) return;
    if (selectedEmployeeId && report.selectedEmployee) return;
    if (report.employeeSummaries.length === 0) return;
    if (!report.employeeSummaries.some((employee) => employee.employeeId === selectedEmployeeId)) {
      setSelectedEmployeeId(report.employeeSummaries[0]!.employeeId);
    }
  }, [report, selectedEmployeeId]);

  const selectedEmployee = report?.selectedEmployee ?? null;

  const visibleEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !report) return report?.employeeSummaries ?? [];
    return report.employeeSummaries.filter((employee) =>
      [employee.employeeName, employee.employeeCode].join(' ').toLowerCase().includes(q)
    );
  }, [report, search]);

  const groupedFields = useMemo(() => {
    return ATTENDANCE_REPORT_BUILDER_FIELDS.reduce<Record<string, typeof ATTENDANCE_REPORT_BUILDER_FIELDS>>((acc, field) => {
      acc[field.group] = [...(acc[field.group] ?? []), field];
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    setSavedPresets(readAttendanceReportPresets(companyStorageKey));
    setPresetsLoaded(true);
  }, [companyStorageKey]);

  useEffect(() => {
    if (!presetsLoaded) return;
    writeAttendanceReportPresets(companyStorageKey, savedPresets);
  }, [companyStorageKey, presetsLoaded, savedPresets]);

  if (!canView) return <div className="text-slate-400">Forbidden</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">HR Reports</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Attendance report builder</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Design the attendance sheet your way. Rename columns, point them to job, customer, assignment, employee, or attendance values, and export the exact same structure to Excel.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link href="/hr/reports/attendance" className="text-emerald-300 hover:text-emerald-200">
                Open monthly summary
              </Link>
              <span className="text-slate-500">Best for payroll, site registers, and client-wise attendance sheets.</span>
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
                  if (!nextId) return;
                  const preset = savedPresets.find((item) => item.id === nextId);
                  if (!preset) return;
                  setSchema(preset.schema);
                  setPresetName(preset.name);
                }}
                className="min-w-[14rem] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white shadow-sm"
              >
                <option value="">Select preset</option>
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
                  await downloadFile(`/api/hr/attendance/monthly-report?${buildQuery(month, '', schema, 'xlsx')}`, `attendance-${month}-custom-all.xlsx`);
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
                  await downloadFile(`/api/hr/attendance/monthly-report?${buildQuery(month, selectedEmployeeId, schema, 'xlsx')}`, `attendance-${month}-custom-employee.xlsx`);
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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_21rem]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <h2 className="text-xl font-semibold text-white">Report layout</h2>
                <p className="mt-1 text-sm text-slate-400">
                  This is your main design canvas. Each row below controls one exported column, with its own label, data source, and display format.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="min-w-[15rem] text-sm text-slate-300">
                  <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Preset name</span>
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Payroll layout"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const name = presetName.trim();
                    if (!name) {
                      toast.error('Enter a preset name');
                      return;
                    }
                    const id = selectedPresetId || `preset-${Date.now()}`;
                    const nextPreset: AttendanceReportPreset = { id, name, schema };
                    setSavedPresets((current) => {
                      const exists = current.some((item) => item.id === id);
                      return exists ? current.map((item) => (item.id === id ? nextPreset : item)) : [...current, nextPreset];
                    });
                    setSelectedPresetId(id);
                    toast.success(selectedPresetId ? 'Preset updated' : 'Preset saved');
                  }}
                >
                  Save preset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!selectedPresetId) {
                      toast.error('Select a preset to delete');
                      return;
                    }
                    setSavedPresets((current) => current.filter((item) => item.id !== selectedPresetId));
                    setSelectedPresetId('');
                    setPresetName('');
                    toast.success('Preset removed');
                  }}
                >
                  Delete preset
                </Button>
                <Button type="button" variant="outline" onClick={() => setSchema(DEFAULT_ATTENDANCE_REPORT_SCHEMA)}>
                  Reset layout
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSchema([
                      { id: 'site-date', label: 'Date', fieldKey: 'attendance.workDate', format: 'long' },
                      { id: 'site-name', label: 'Work Location', fieldKey: 'job.siteName', format: 'auto' },
                      { id: 'site-customer', label: 'Customer', fieldKey: 'customer.name', format: 'auto' },
                      { id: 'site-job', label: 'Job No', fieldKey: 'job.number', format: 'auto' },
                      { id: 'site-in', label: 'In', fieldKey: 'attendance.checkIn', format: 'decimal' },
                      { id: 'site-out', label: 'Out', fieldKey: 'attendance.checkOut', format: 'decimal' },
                    ])
                  }
                >
                  Site/customer preset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSchema((current) => [...current, makeColumn('attendance.workDate', current.length + 1)])}
                >
                  Add column
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {schema.map((column, index) => {
                const formats = availableFormats(column.fieldKey);
                return (
                  <div key={column.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">Column {index + 1}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Export mapping</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSchema((current) => {
                              if (index === 0) return current;
                              const next = [...current];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              return next;
                            })
                          }
                          className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSchema((current) => {
                              if (index === current.length - 1) return current;
                              const next = [...current];
                              [next[index + 1], next[index]] = [next[index], next[index + 1]];
                              return next;
                            })
                          }
                          className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchema((current) => (current.length > 1 ? current.filter((item) => item.id !== column.id) : current))}
                          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_12rem]">
                      <label className="text-sm text-slate-300">
                        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Column name</span>
                        <input
                          value={column.label}
                          onChange={(e) =>
                            setSchema((current) => current.map((item) => (item.id === column.id ? { ...item, label: e.target.value } : item)))
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Data key</span>
                        <select
                          value={column.fieldKey}
                          onChange={(e) => {
                            const nextKey = e.target.value as AttendanceReportFieldKey;
                            const nextFormats = availableFormats(nextKey);
                            setSchema((current) =>
                              current.map((item) =>
                                item.id === column.id ? { ...item, fieldKey: nextKey, format: nextFormats[0]?.value ?? 'auto' } : item
                              )
                            );
                          }}
                          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                        >
                          {Object.entries(groupedFields).map(([group, fields]) => (
                            <optgroup key={group} label={group}>
                              {fields.map((field) => (
                                <option key={field.key} value={field.key}>
                                  {field.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm text-slate-300">
                        <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Format</span>
                        <select
                          value={column.format ?? 'auto'}
                          onChange={(e) =>
                            setSchema((current) =>
                              current.map((item) => (item.id === column.id ? { ...item, format: e.target.value as AttendanceReportColumnFormat } : item))
                            )
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                        >
                          {formats.map((formatOption) => (
                            <option key={formatOption.value} value={formatOption.value}>
                              {formatOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Live preview</h2>
                <p className="mt-1 text-sm text-slate-400">This preview uses the same column order, names, keys, and formats as the Excel export.</p>
              </div>
              {selectedEmployee ? (
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Employee</p>
                    <p className="mt-2 text-sm font-medium text-white">{selectedEmployee.employeeName}</p>
                    <p className="text-xs text-slate-500">{selectedEmployee.employeeCode}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Rows</p>
                    <p className="mt-2 text-xl font-semibold text-white">{selectedEmployee.entries.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Present</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">{selectedEmployee.presentDays}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Worked</p>
                    <p className="mt-2 text-xl font-semibold text-white">{formatHours(selectedEmployee.workedMinutes / 60)}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {!selectedEmployee ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">Select an employee from the right panel to preview the builder output.</div>
            ) : selectedEmployee.entries.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">No attendance rows found for this employee in the selected month.</div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/45">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {schema.map((column) => (
                        <th key={column.id} className="px-4 py-3">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {selectedEmployee.entries.map((entry, rowIndex) => (
                      <tr key={`${entry.workDate}-${rowIndex}`} className="hover:bg-white/5">
                        {schema.map((column, colIndex) => (
                          <td key={column.id} className={`px-4 py-3 align-top ${colIndex === 0 ? 'text-white' : 'text-slate-300'}`}>
                            {String(formatAttendanceReportBuilderCell(entry, column) ?? '')}
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
          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-white">Preview employee</h2>
            <p className="mt-1 text-sm text-slate-400">Use this panel to pick whose monthly attendance you want to inspect while designing the sheet.</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or code"
              className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-500">Loading employees...</div>
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
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
