import { daysInMonth } from '@/lib/hr/payroll/calendar';
import { formatPayMoney } from '@/lib/hr/payroll/payslipFormatting';
import { downloadWorkbook, sanitizeSheetName } from '@/lib/import-export/xlsx';

export type PayPreviewExportDayDetail = {
  date: string;
  status: string;
  totalHours: number;
  basicHours: number;
  otHours: number;
  basicHourRate: number;
  basicHourSalary: number;
  otHourRate: number;
  otHourSalary: number;
  allowance: number;
  componentEarning?: number;
  componentDeduction?: number;
  totalSalary: number;
  amount: number;
  detail?: string;
};

export type PayPreviewExportEmployee = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeFullName?: string;
  employeePreferredName?: string | null;
  payTypeName: string | null;
  payTypeCode: string | null;
  workforceRoleTypeShort?: string;
  visaHoldingLabel?: string;
  wpsTransferAmount?: number | null;
  visaSponsorName?: string | null;
  gross: number;
  breakdown: Record<string, number>;
  salaryComponentEarnings?: number;
  salaryComponentDeductions?: number;
  dayDetails?: PayPreviewExportDayDetail[];
  healthCheck?: {
    ok: boolean;
    issues: string[];
    basicPaid: number;
    basicCap: number;
    allowancePaid: number;
    allowanceCap: number;
    componentEarningsPaid: number;
    componentEarningsCap: number;
    componentDeductionsPaid: number;
    componentDeductionsCap: number;
  } | null;
  approvedAttendanceRows: number;
  draftAttendanceRows: number;
  skipped: boolean;
  skipReason: string | null;
};

export type PayPreviewExportPayload = {
  month: string;
  totalGross: number;
  employees: PayPreviewExportEmployee[];
};

const HIDDEN_BREAKDOWN_KEYS = new Set(['salaryComponentsFixed', 'salaryComponentsAttendance']);

const BREAKDOWN_LABELS: Record<string, string> = {
  monthlyBasic: 'Monthly basic',
  deductions: 'Absence deductions',
  deductDays: 'Absent days deducted',
  deductDaysInMonth: 'Deduct days in month',
  earnedDays: 'Earned days',
  unpaidAbsentDays: 'Unpaid absent days',
  dailyRate: 'Daily rate',
  dailyWageTotal: 'Daily wage total',
  hourlyTotal: 'Hourly total',
  outsideCapOt: 'Outside-cap OT',
  holidayWorkedOt: 'Holiday worked OT',
  excludedWeekdayOt: 'Weekly off OT',
};

function formatHours(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function breakdownLabel(key: string) {
  return BREAKDOWN_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function resolveDisplayFullName(row: PayPreviewExportEmployee): string {
  return row.employeeFullName?.trim() || row.employeeName;
}

function resolveAllowanceTotal(row: PayPreviewExportEmployee): number {
  if (row.salaryComponentEarnings != null) return row.salaryComponentEarnings;
  if (row.healthCheck?.componentEarningsPaid != null) return row.healthCheck.componentEarningsPaid;
  if (row.healthCheck) return row.healthCheck.allowancePaid;
  const days = row.dayDetails ?? [];
  return (
    days.reduce((sum, day) => sum + (day.componentEarning ?? Math.max(0, day.allowance)), 0) +
    (row.breakdown.salaryComponentsFixed ?? 0) +
    (row.breakdown.salaryComponentsAttendance ?? 0)
  );
}

function resolveDeductionTotal(row: PayPreviewExportEmployee): number {
  if (row.salaryComponentDeductions != null) return row.salaryComponentDeductions;
  if (row.healthCheck?.componentDeductionsPaid != null) return row.healthCheck.componentDeductionsPaid;
  const days = row.dayDetails ?? [];
  return days.reduce((sum, day) => sum + (day.componentDeduction ?? 0), 0);
}

function summarizeEmployeeRow(row: PayPreviewExportEmployee) {
  const days = row.dayDetails ?? [];
  const activeDays = days.filter((day) => day.totalHours > 0 || day.totalSalary > 0).length;
  return {
    totalHours: days.reduce((sum, day) => sum + day.totalHours, 0),
    totalOt: days.reduce((sum, day) => sum + day.otHours, 0),
    basicSalary: days.reduce((sum, day) => sum + day.basicHourSalary, 0),
    otSalary: days.reduce((sum, day) => sum + day.otHourSalary, 0),
    allowance: resolveAllowanceTotal(row),
    deduction: resolveDeductionTotal(row),
    activeDays,
  };
}

function attendanceOutOfLabel(row: PayPreviewExportEmployee, month: string): string {
  const monthDays = daysInMonth(month);
  const saved = row.approvedAttendanceRows;
  if (saved > 0) {
    const summary = summarizeEmployeeRow(row);
    return `${summary.activeDays} / ${saved}`;
  }
  return `0 / ${monthDays}`;
}

function summarizeDayComponentTotals(rows: PayPreviewExportDayDetail[]) {
  return rows.reduce(
    (acc, day) => {
      acc.earnings += day.componentEarning ?? Math.max(0, day.allowance);
      acc.deductions += day.componentDeduction ?? 0;
      acc.basicSalary += day.basicHourSalary;
      acc.otSalary += day.otHourSalary;
      acc.totalSalary += day.totalSalary;
      return acc;
    },
    { earnings: 0, deductions: 0, basicSalary: 0, otSalary: 0, totalSalary: 0 }
  );
}

function resolveSalaryComponentBreakdown(row: PayPreviewExportEmployee, dayRows: PayPreviewExportDayDetail[]) {
  const dayTotals = summarizeDayComponentTotals(dayRows);
  const totalEarnings = resolveAllowanceTotal(row);
  const totalDeductions = resolveDeductionTotal(row);
  return {
    fixedEarnings: Math.max(0, totalEarnings - dayTotals.earnings),
    fixedDeductions: Math.max(0, totalDeductions - dayTotals.deductions),
    attendanceEarnings: dayTotals.earnings,
    attendanceDeductions: dayTotals.deductions,
    totalEarnings,
    totalDeductions,
  };
}

function visibleBreakdownEntries(breakdown: Record<string, number>) {
  return Object.entries(breakdown).filter(([key]) => !HIDDEN_BREAKDOWN_KEYS.has(key));
}

function formatBreakdownValue(key: string, value: number) {
  if (key === 'deductDays' || key === 'earnedDays' || key === 'deductDaysInMonth' || key === 'unpaidAbsentDays') {
    return String(value);
  }
  return formatPayMoney(value);
}

function buildSummarySheet(payload: PayPreviewExportPayload): Array<Array<string | number>> {
  const included = payload.employees.filter((row) => !row.skipped);
  const skipped = payload.employees.filter((row) => row.skipped);
  const rows: Array<Array<string | number>> = [
    ['Payroll preview', payload.month],
    ['Total gross (AED)', payload.totalGross],
    ['Employees included', included.length],
    [],
    [
      'Employee',
      'Employee code',
      'Role',
      'Visa holding',
      'Visa sponsor',
      'Pay type',
      'Attendance (active / saved)',
      'Health',
      'Total hours',
      'Total OT',
      'Basic salary',
      'OT salary',
      'Allowance',
      'Deduction',
      'WPS (AED)',
      'Gross (AED)',
    ],
  ];

  for (const row of included) {
    const summary = summarizeEmployeeRow(row);
    rows.push([
      resolveDisplayFullName(row),
      row.employeeCode,
      row.workforceRoleTypeShort ?? '',
      row.visaHoldingLabel ?? '',
      row.visaSponsorName ?? '',
      row.payTypeName ?? '',
      attendanceOutOfLabel(row, payload.month),
      row.healthCheck ? (row.healthCheck.ok ? 'OK' : 'Check') : '',
      formatHours(summary.totalHours),
      formatHours(summary.totalOt),
      summary.basicSalary,
      summary.otSalary,
      summary.allowance,
      summary.deduction,
      row.wpsTransferAmount ?? '',
      row.gross,
    ]);
  }

  if (skipped.length > 0) {
    rows.push([]);
    rows.push(['Skipped employees']);
    rows.push(['Employee', 'Employee code', 'Skip reason']);
    for (const row of skipped) {
      rows.push([resolveDisplayFullName(row), row.employeeCode, row.skipReason ?? '']);
    }
  }

  return rows;
}

function buildEmployeeDetailSheet(
  row: PayPreviewExportEmployee,
  month: string
): Array<Array<string | number | null>> {
  const summary = summarizeEmployeeRow(row);
  const dayRows = row.dayDetails ?? [];
  const dayTotals = summarizeDayComponentTotals(dayRows);
  const componentSplit = resolveSalaryComponentBreakdown(row, dayRows);
  const breakdownEntries = visibleBreakdownEntries(row.breakdown);
  const preferred = row.employeePreferredName?.trim() || '';

  const rows: Array<Array<string | number | null>> = [
    ['Payroll breakdown', resolveDisplayFullName(row)],
    [],
    ['Full name', resolveDisplayFullName(row)],
    ['Preferred name', preferred || null],
    ['Employee code', row.employeeCode],
    ['Workforce role', row.workforceRoleTypeShort ?? null],
    ['Visa holding', row.visaHoldingLabel ?? null],
    ['Visa sponsor', row.visaSponsorName ?? null],
    ['Pay type', row.payTypeName ?? null],
    ['Month', month],
    ['Attendance (active / saved)', attendanceOutOfLabel(row, month)],
    ['WPS transfer (AED)', row.wpsTransferAmount ?? null],
    ['Gross (AED)', row.gross],
    [],
    [
      'Total hours',
      'Total OT',
      'Basic salary',
      'OT salary',
      'Allowance',
      'Deduction',
      'Gross (AED)',
    ],
    [
      formatHours(summary.totalHours),
      formatHours(summary.totalOt),
      summary.basicSalary,
      summary.otSalary,
      summary.allowance,
      summary.deduction,
      row.gross,
    ],
  ];

  if (componentSplit.totalEarnings > 0 || componentSplit.totalDeductions > 0) {
    rows.push([]);
    rows.push(['Salary components']);
    if (componentSplit.fixedEarnings > 0) rows.push(['Fixed earnings', componentSplit.fixedEarnings]);
    if (componentSplit.fixedDeductions > 0) rows.push(['Fixed deductions', componentSplit.fixedDeductions]);
    if (componentSplit.attendanceEarnings > 0) rows.push(['Attendance earnings', componentSplit.attendanceEarnings]);
    if (componentSplit.attendanceDeductions > 0) {
      rows.push(['Attendance deductions', componentSplit.attendanceDeductions]);
    }
    rows.push(['Total earnings', componentSplit.totalEarnings]);
    rows.push(['Total deductions', componentSplit.totalDeductions]);
  }

  if (breakdownEntries.length > 0) {
    rows.push([]);
    rows.push(['Pay calculation breakdown']);
    for (const [key, value] of breakdownEntries) {
      rows.push([breakdownLabel(key), formatBreakdownValue(key, value)]);
    }
  }

  if (row.healthCheck) {
    const health = row.healthCheck;
    rows.push([]);
    rows.push(['Health check', health.ok ? 'OK' : 'Check']);
    rows.push(['Basic paid / cap', `${formatPayMoney(health.basicPaid)} / ${formatPayMoney(health.basicCap)}`]);
    rows.push([
      'Allowance paid / cap',
      `${formatPayMoney(health.componentEarningsPaid)} / ${formatPayMoney(health.componentEarningsCap)}`,
    ]);
    rows.push([
      'Deduction paid / cap',
      `${formatPayMoney(health.componentDeductionsPaid)} / ${formatPayMoney(health.componentDeductionsCap)}`,
    ]);
    if (!health.ok) {
      rows.push(['Issues', health.issues.join('; ')]);
    }
  }

  rows.push([]);
  rows.push(['Daily breakdown']);
  rows.push([
    'Date',
    'Total h',
    'Basic h',
    'OT h',
    'Basic salary',
    'OT rate',
    'OT salary',
    'Allowance',
    'Deduction',
    'Total',
    'Status',
  ]);

  if (dayRows.length === 0) {
    rows.push(['No saved attendance rows for this month.']);
  } else {
    for (const day of dayRows) {
      rows.push([
        day.date,
        day.totalHours,
        day.basicHours,
        day.otHours,
        day.basicHourSalary,
        day.otHourRate,
        day.otHourSalary,
        day.componentEarning ?? Math.max(0, day.allowance),
        day.componentDeduction ?? 0,
        day.totalSalary,
        day.status,
      ]);
    }
    rows.push([
      'Day totals',
      null,
      null,
      null,
      dayTotals.basicSalary,
      null,
      dayTotals.otSalary,
      dayTotals.earnings,
      dayTotals.deductions,
      dayTotals.totalSalary,
      null,
    ]);
    if (summary.allowance > dayTotals.earnings || summary.deduction > dayTotals.deductions) {
      rows.push([
        `Month allowance (${formatPayMoney(summary.allowance)}) and deduction (${formatPayMoney(summary.deduction)}) include fixed monthly salary components not listed per day.`,
      ]);
    }
  }

  return rows;
}

export function buildPayPreviewWorkbookSheets(payload: PayPreviewExportPayload) {
  const usedNames = new Set<string>();
  const sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }> = [
    {
      name: sanitizeSheetName('Summary', usedNames),
      rows: buildSummarySheet(payload),
    },
  ];

  for (const employee of payload.employees.filter((row) => !row.skipped)) {
    sheets.push({
      name: sanitizeSheetName(resolveDisplayFullName(employee), usedNames),
      rows: buildEmployeeDetailSheet(employee, payload.month),
    });
  }

  return sheets;
}

export function downloadPayPreviewXlsx(payload: PayPreviewExportPayload) {
  const sheets = buildPayPreviewWorkbookSheets(payload);
  downloadWorkbook(`payroll-preview-${payload.month}.xlsx`, sheets);
}
