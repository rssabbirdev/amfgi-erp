'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';
import { daysInMonth } from '@/lib/hr/payroll/calendar';
import { downloadPayPreviewXlsx } from '@/lib/hr/payroll/exportPayPreviewXlsx';
import { readApiJson } from '@/lib/utils/readApiResponse';

type PreviewDayDetail = {
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

type PreviewEmployee = {
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
  dayDetails?: PreviewDayDetail[];
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

type PreviewPayload = {
  month: string;
  totalGross: number;
  employees: PreviewEmployee[];
};

type EmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
};

type EmployeeSummary = {
  totalHours: number;
  totalOt: number;
  basicSalary: number;
  otSalary: number;
  allowance: number;
  deduction: number;
  activeDays: number;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMoney(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatHours(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function resolveDisplayFullName(row: PreviewEmployee): string {
  return row.employeeFullName?.trim() || row.employeeName;
}

function resolveAllowanceTotal(row: PreviewEmployee): number {
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

function resolveDeductionTotal(row: PreviewEmployee): number {
  if (row.salaryComponentDeductions != null) return row.salaryComponentDeductions;
  if (row.healthCheck?.componentDeductionsPaid != null) return row.healthCheck.componentDeductionsPaid;
  const days = row.dayDetails ?? [];
  return days.reduce((sum, day) => sum + (day.componentDeduction ?? 0), 0);
}

function summarizeEmployeeRow(row: PreviewEmployee): EmployeeSummary {
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

function attendanceOutOfLabel(row: PreviewEmployee, month: string): string {
  const monthDays = daysInMonth(month);
  const saved = row.approvedAttendanceRows;
  if (saved > 0) {
    const summary = summarizeEmployeeRow(row);
    return `${summary.activeDays} / ${saved}`;
  }
  return `0 / ${monthDays}`;
}

function breakdownLabel(key: string) {
  const labels: Record<string, string> = {
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
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

const HIDDEN_BREAKDOWN_KEYS = new Set(['salaryComponentsFixed', 'salaryComponentsAttendance']);

function visibleBreakdownEntries(breakdown: Record<string, number>) {
  return Object.entries(breakdown).filter(([key]) => !HIDDEN_BREAKDOWN_KEYS.has(key));
}

function summarizeDayComponentTotals(rows: PreviewDayDetail[]) {
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

function resolveSalaryComponentBreakdown(row: PreviewEmployee, dayRows: PreviewDayDetail[]) {
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

function HealthBadge({ health }: { health: PreviewEmployee['healthCheck'] }) {
  if (!health) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        health.ok
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
      )}
      title={health.ok ? 'Payroll health check passed' : health.issues.join('; ')}
    >
      {health.ok ? 'OK' : 'Check'}
    </span>
  );
}

function PayHealthCheckPanel({
  health,
}: {
  health: NonNullable<PreviewEmployee['healthCheck']>;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5 text-sm',
        health.ok
          ? 'border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30'
          : 'border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <HealthBadge health={health} />
        <span className="text-xs text-muted-foreground">
          Basic, earnings, and deductions should not exceed assigned monthly values.
        </span>
      </div>
      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Basic paid / cap</dt>
          <dd className="font-medium tabular-nums">
            {formatMoney(health.basicPaid)} / {formatMoney(health.basicCap)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Allowance paid / cap</dt>
          <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatMoney(health.componentEarningsPaid)} / {formatMoney(health.componentEarningsCap)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Deduction paid / cap</dt>
          <dd className="font-medium tabular-nums text-rose-700 dark:text-rose-300">
            {formatMoney(health.componentDeductionsPaid)} / {formatMoney(health.componentDeductionsCap)}
          </dd>
        </div>
      </dl>
      {!health.ok ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-900 dark:text-amber-200">
          {health.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DayBreakdownTable({
  rows,
  summary,
}: {
  rows: PreviewDayDetail[];
  summary: EmployeeSummary;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No saved attendance rows for this month.</p>;
  }

  const dayTotals = summarizeDayComponentTotals(rows);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[1120px] text-xs">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-muted-foreground">
            <th className="px-2 py-1.5">Date</th>
            <th className="px-2 py-1.5 text-right">Total h</th>
            <th className="px-2 py-1.5 text-right">Basic h</th>
            <th className="px-2 py-1.5 text-right">OT h</th>
            <th className="px-2 py-1.5 text-right">Basic salary</th>
            <th className="px-2 py-1.5 text-right">OT rate</th>
            <th className="px-2 py-1.5 text-right">OT salary</th>
            <th className="px-2 py-1.5 text-right">Allowance</th>
            <th className="px-2 py-1.5 text-right">Deduction</th>
            <th className="px-2 py-1.5 text-right">Total</th>
            <th className="px-2 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => (
            <tr key={day.date} className="border-b border-border/50">
              <td className="px-2 py-1.5 whitespace-nowrap">{day.date}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(day.totalHours)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(day.basicHours)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(day.otHours)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(day.basicHourSalary)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(day.otHourRate)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(day.otHourSalary)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatMoney(day.componentEarning ?? Math.max(0, day.allowance))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-rose-700 dark:text-rose-300">
                {formatMoney(day.componentDeduction ?? 0)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatMoney(day.totalSalary)}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{day.status}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20 font-medium">
            <td className="px-2 py-2">Day totals</td>
            <td className="px-2 py-2" colSpan={3} />
            <td className="px-2 py-2 text-right tabular-nums">{formatMoney(dayTotals.basicSalary)}</td>
            <td className="px-2 py-2" />
            <td className="px-2 py-2 text-right tabular-nums">{formatMoney(dayTotals.otSalary)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoney(dayTotals.earnings)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums text-rose-700 dark:text-rose-300">
              {formatMoney(dayTotals.deductions)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{formatMoney(dayTotals.totalSalary)}</td>
            <td className="px-2 py-2" />
          </tr>
          {(summary.allowance > dayTotals.earnings || summary.deduction > dayTotals.deductions) && (
            <tr className="border-t bg-muted/10 text-muted-foreground">
              <td className="px-2 py-2" colSpan={11}>
                Month allowance ({formatMoney(summary.allowance)}) and deduction ({formatMoney(summary.deduction)})
                include fixed monthly salary components not listed per day.
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

function SalaryComponentBreakdownPanel({
  row,
  dayRows,
}: {
  row: PreviewEmployee;
  dayRows: PreviewDayDetail[];
}) {
  const split = resolveSalaryComponentBreakdown(row, dayRows);
  if (split.totalEarnings <= 0 && split.totalDeductions <= 0) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <h3 className="mb-2 text-sm font-medium">Salary components</h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {split.fixedEarnings > 0 ? (
          <div>
            <dt className="text-xs text-muted-foreground">Fixed earnings</dt>
            <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoney(split.fixedEarnings)}
            </dd>
          </div>
        ) : null}
        {split.fixedDeductions > 0 ? (
          <div>
            <dt className="text-xs text-muted-foreground">Fixed deductions</dt>
            <dd className="font-medium tabular-nums text-rose-700 dark:text-rose-300">
              {formatMoney(split.fixedDeductions)}
            </dd>
          </div>
        ) : null}
        {split.attendanceEarnings > 0 ? (
          <div>
            <dt className="text-xs text-muted-foreground">Attendance earnings</dt>
            <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoney(split.attendanceEarnings)}
            </dd>
          </div>
        ) : null}
        {split.attendanceDeductions > 0 ? (
          <div>
            <dt className="text-xs text-muted-foreground">Attendance deductions</dt>
            <dd className="font-medium tabular-nums text-rose-700 dark:text-rose-300">
              {formatMoney(split.attendanceDeductions)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Total earnings</dt>
          <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatMoney(split.totalEarnings)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total deductions</dt>
          <dd className="font-medium tabular-nums text-rose-700 dark:text-rose-300">
            {formatMoney(split.totalDeductions)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function EmployeeBreakdownModal({
  row,
  month,
  onClose,
}: {
  row: PreviewEmployee;
  month: string;
  onClose: () => void;
}) {
  const summary = summarizeEmployeeRow(row);
  const preferred = row.employeePreferredName?.trim();
  const dayRows = row.dayDetails ?? [];
  const breakdownEntries = visibleBreakdownEntries(row.breakdown);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={resolveDisplayFullName(row)}
      description={
        preferred
          ? `${preferred} · ${row.employeeCode}`
          : row.employeeCode
      }
      size="2xl"
    >
      <div className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Full name</dt>
            <dd className="font-medium">{resolveDisplayFullName(row)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Preferred name</dt>
            <dd className="font-medium">{preferred || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Employee code</dt>
            <dd className="font-medium">{row.employeeCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pay type</dt>
            <dd className="font-medium">{row.payTypeName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Workforce role</dt>
            <dd className="font-medium">{row.workforceRoleTypeShort ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Visa holding</dt>
            <dd className="font-medium">{row.visaHoldingLabel ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Visa sponsor</dt>
            <dd className="font-medium">{row.visaSponsorName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">WPS transfer</dt>
            <dd className="font-medium tabular-nums">
              {row.wpsTransferAmount != null ? `${formatMoney(row.wpsTransferAmount)} AED` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Month</dt>
            <dd className="font-medium">{month}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Attendance (active / saved)</dt>
            <dd className="font-medium">{attendanceOutOfLabel(row, month)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Gross</dt>
            <dd className="font-medium tabular-nums">{formatMoney(row.gross)} AED</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Profile</dt>
            <dd>
              <Link href={`/hr/employees/${row.employeeId}`} className="font-medium text-primary hover:underline">
                Open employee
              </Link>
            </dd>
          </div>
        </dl>

        <dl className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-3 lg:grid-cols-7">
          <div>
            <dt className="text-xs text-muted-foreground">Total hours</dt>
            <dd className="font-medium tabular-nums">{formatHours(summary.totalHours)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total OT</dt>
            <dd className="font-medium tabular-nums">{formatHours(summary.totalOt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Basic salary</dt>
            <dd className="font-medium tabular-nums">{formatMoney(summary.basicSalary)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">OT salary</dt>
            <dd className="font-medium tabular-nums">{formatMoney(summary.otSalary)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Allowance</dt>
            <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoney(summary.allowance)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Deduction</dt>
            <dd className="font-medium tabular-nums text-rose-700 dark:text-rose-300">
              {formatMoney(summary.deduction)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Gross</dt>
            <dd className="font-medium tabular-nums">{formatMoney(row.gross)}</dd>
          </div>
        </dl>

        <SalaryComponentBreakdownPanel row={row} dayRows={dayRows} />

        {breakdownEntries.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {breakdownEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{breakdownLabel(key)}</dt>
                <dd className="font-medium tabular-nums">
                  {typeof value === 'number' && key !== 'deductDays' && key !== 'earnedDays'
                    ? formatMoney(value)
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {row.healthCheck ? <PayHealthCheckPanel health={row.healthCheck} /> : null}

        <div>
          <h3 className="mb-2 text-sm font-medium">Daily breakdown</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Allowance shows earning-type salary components. Deduction shows deduction-type components.
            Fixed monthly components appear in the salary components section and month totals row.
          </p>
          <DayBreakdownTable rows={dayRows} summary={summary} />
        </div>
      </div>
    </Modal>
  );
}

export default function PayrollPreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = session?.user?.isSuperAdmin || perms.includes('hr.payroll.compensation');

  const [month, setMonth] = useState(() => searchParams.get('month') || currentMonth());
  const [filterEmployeeId, setFilterEmployeeId] = useState(() => searchParams.get('employeeId') ?? '');
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<PreviewEmployee | null>(null);
  const [finalizedRunId, setFinalizedRunId] = useState<string | null>(null);
  const [finalizeNote, setFinalizeNote] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!canView) return;
    void fetch('/api/hr/employees?limit=500', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data?.items)) {
          setEmployeeOptions(json.data.items as EmployeeOption[]);
        }
      })
      .catch(() => {});
  }, [canView]);

  const loadPreview = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ month });
      if (filterEmployeeId) q.set('employeeId', filterEmployeeId);
      const [previewRes, runsRes] = await Promise.all([
        fetch(`/api/hr/payroll/preview?${q}`, { cache: 'no-store' }),
        fetch(`/api/hr/payroll/runs?month=${encodeURIComponent(month)}`, { cache: 'no-store' }),
      ]);
      const json = await readApiJson<PreviewPayload>(previewRes);
      if (!json || !previewRes.ok || !json.success) {
        toast.error(json?.error ?? 'Failed to load preview');
        setPreview(null);
      } else {
        setPreview(json.data as PreviewPayload);
      }
      const runsJson = await readApiJson<Array<{ id: string }>>(runsRes);
      if (runsJson?.success && Array.isArray(runsJson.data) && runsJson.data[0]) {
        setFinalizedRunId(runsJson.data[0].id);
      } else {
        setFinalizedRunId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [month, filterEmployeeId]);

  useEffect(() => {
    if (!canView) return;
    void loadPreview();
  }, [canView, loadPreview]);

  const finalizePayRun = async () => {
    if (!month || finalizedRunId) return;
    if (
      !window.confirm(
        `Finalize pay run for ${month}? This saves a read-only snapshot and cannot be replaced for the same month.`
      )
    ) {
      return;
    }
    setFinalizing(true);
    try {
      const res = await fetch('/api/hr/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          note: finalizeNote.trim() || null,
        }),
      });
      const json = await readApiJson<{ id: string }>(res);
      if (!json || !res.ok || !json.success) {
        toast.error(json?.error ?? 'Failed to finalize pay run');
        return;
      }
      toast.success('Pay run finalized');
      const id = json.data?.id as string;
      setFinalizedRunId(id);
      router.push(`/hr/payroll/runs/${id}`);
    } finally {
      setFinalizing(false);
    }
  };

  useEffect(() => {
    const q = new URLSearchParams();
    if (month) q.set('month', month);
    if (filterEmployeeId) q.set('employeeId', filterEmployeeId);
    const next = q.toString();
    const current =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).toString() : '';
    if (next !== current) {
      router.replace(next ? `/hr/payroll/preview?${next}` : '/hr/payroll/preview', { scroll: false });
    }
  }, [month, filterEmployeeId, router]);

  const searchItems = useMemo(
    () =>
      employeeOptions.map((e) => ({
        id: e.id,
        label: `${e.preferredName || e.fullName} (${e.employeeCode})`,
        searchText: `${e.employeeCode} ${e.fullName} ${e.preferredName ?? ''}`,
      })),
    [employeeOptions]
  );

  const included = preview?.employees.filter((e) => !e.skipped) ?? [];
  const skipped = preview?.employees.filter((e) => e.skipped) ?? [];

  if (!canView) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.payroll.compensation permission.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Payroll preview</h1>
          <p className="text-sm text-muted-foreground">
            Estimate monthly gross from saved attendance and active compensation. Double-click a row for the daily
            breakdown.
          </p>
        </div>
        <Link
          href="/hr/settings/salary-structure"
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          Salary structure
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="text-xs text-muted-foreground">Month</label>
          <Input type="month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="min-w-[220px] flex-1 max-w-md">
          <label className="text-xs text-muted-foreground">Employee (optional)</label>
          <SearchSelect
            items={searchItems}
            value={filterEmployeeId}
            onChange={setFilterEmployeeId}
            placeholder="All with compensation…"
            minCharactersToSearch={0}
            openOnFocus
            dropdownInPortal
          />
        </div>
        <Button size="sm" onClick={() => void loadPreview()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!preview || preview.employees.filter((e) => !e.skipped).length === 0}
          onClick={() => {
            if (!preview) return;
            downloadPayPreviewXlsx(preview);
            toast.success('Excel downloaded');
          }}
        >
          Export Excel
        </Button>
        {!finalizedRunId ? (
          <div className="min-w-[180px] flex-1 max-w-xs">
            <label className="text-xs text-muted-foreground">Finalize note (optional)</label>
            <Input
              value={finalizeNote}
              onChange={(e) => setFinalizeNote(e.target.value)}
              placeholder="e.g. June payroll approved by HR"
            />
          </div>
        ) : null}
        <Button
          size="sm"
          disabled={!preview || finalizing || Boolean(finalizedRunId)}
          onClick={() => void finalizePayRun()}
        >
          {finalizing ? 'Finalizing…' : finalizedRunId ? 'Already finalized' : 'Finalize pay run'}
        </Button>
      </div>

      {finalizedRunId ? (
        <div className="mb-4 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-4 py-3 text-sm dark:bg-emerald-950/20">
          A pay run for {month} is already finalized.{' '}
          <Link href={`/hr/payroll/runs/${finalizedRunId}`} className="font-medium text-primary hover:underline">
            View pay run
          </Link>
        </div>
      ) : null}

      {detailEmployee && preview ? (
        <EmployeeBreakdownModal
          row={detailEmployee}
          month={preview.month}
          onClose={() => setDetailEmployee(null)}
        />
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Month</p>
              <p className="mt-1 text-xl font-semibold">{preview.month}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Employees included</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{included.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Total gross (preview)</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(preview.totalGross)} AED</p>
            </div>
          </div>

          {included.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calculable rows for this month. Assign compensation on employee profiles first.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1580px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Visa holding</th>
                    <th className="px-3 py-2">Visa sponsor</th>
                    <th className="px-3 py-2">Pay type</th>
                    <th className="px-3 py-2 text-right">Attendance out of</th>
                    <th className="px-3 py-2 text-center">Health</th>
                    <th className="px-3 py-2 text-right">Total hour</th>
                    <th className="px-3 py-2 text-right">Total OT</th>
                    <th className="px-3 py-2 text-right">Basic salary</th>
                    <th className="px-3 py-2 text-right">OT salary</th>
                    <th className="px-3 py-2 text-right">Allowance</th>
                    <th className="px-3 py-2 text-right">Deduction</th>
                    <th className="px-3 py-2 text-right">WPS</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {included.map((row) => {
                    const summary = summarizeEmployeeRow(row);
                    return (
                      <tr
                        key={row.employeeId}
                        className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                        onDoubleClick={() => setDetailEmployee(row)}
                        title="Double-click for breakdown"
                      >
                        <td className="px-3 py-2 font-medium text-foreground">
                          {resolveDisplayFullName(row)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.workforceRoleTypeShort ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.visaHoldingLabel ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.visaSponsorName ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.payTypeName ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {attendanceOutOfLabel(row, preview.month)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <HealthBadge health={row.healthCheck} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatHours(summary.totalHours)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatHours(summary.totalOt)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(summary.basicSalary)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(summary.otSalary)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(summary.allowance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {summary.deduction ? formatMoney(summary.deduction) : formatMoney(0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.wpsTransferAmount != null ? formatMoney(row.wpsTransferAmount) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(row.gross)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {skipped.length > 0 ? (
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-4 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Skipped ({skipped.length})</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {skipped.map((row) => (
                  <li key={row.employeeId}>
                    {resolveDisplayFullName(row)} ({row.employeeCode}) — {row.skipReason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="text-xs text-muted-foreground">
            Payroll combines saved attendance with approved leave from Leave management for the month.
          </div>
        </div>
      ) : null}
    </HrPageChrome>
  );
}
