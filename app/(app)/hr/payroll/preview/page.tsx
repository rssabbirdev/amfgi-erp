'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import SearchSelect from '@/components/ui/SearchSelect';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { downloadPayPreviewCsv } from '@/lib/hr/payroll/exportPayPreviewCsv';
import { readApiJson } from '@/lib/utils/readApiResponse';

type PreviewEmployee = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payTypeName: string | null;
  payTypeCode: string | null;
  gross: number;
  breakdown: Record<string, number>;
  dayDetails?: Array<{ date: string; amount: number; detail?: string }>;
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

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMoney(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function breakdownLabel(key: string) {
  const labels: Record<string, string> = {
    monthlyBasic: 'Monthly basic',
    deductions: 'Deductions',
    deductDays: 'Absent days deducted',
    dailyWageTotal: 'Daily wage total',
    hourlyTotal: 'Hourly total',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
            Estimate monthly gross from approved attendance and active compensation. Not a finalized pay run.
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
          disabled={!preview || preview.employees.length === 0}
          onClick={() => {
            if (!preview) return;
            downloadPayPreviewCsv(preview.month, preview.employees);
            toast.success('CSV downloaded');
          }}
        >
          Export CSV
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Pay type</th>
                    <th className="px-3 py-2">Approved rows</th>
                    <th className="px-3 py-2">Draft rows</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {included.map((row) => (
                    <Fragment key={row.employeeId}>
                      <tr className="border-b">
                        <td className="px-3 py-2">
                          <Link
                            href={`/hr/employees/${row.employeeId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.employeeName}
                          </Link>
                          <span className="text-muted-foreground"> ({row.employeeCode})</span>
                        </td>
                        <td className="px-3 py-2">{row.payTypeName ?? '—'}</td>
                        <td className="px-3 py-2">{row.approvedAttendanceRows}</td>
                        <td className="px-3 py-2">
                          {row.draftAttendanceRows > 0 ? (
                            <span className="text-amber-700">{row.draftAttendanceRows}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatMoney(row.gross)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setExpandedId((id) => (id === row.employeeId ? null : row.employeeId))
                            }
                          >
                            {expandedId === row.employeeId ? 'Hide' : 'Breakdown'}
                          </Button>
                        </td>
                      </tr>
                      {expandedId === row.employeeId ? (
                        <tr key={`${row.employeeId}-detail`} className="border-b bg-muted/20">
                          <td colSpan={6} className="px-4 py-3">
                            <dl className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                              {Object.entries(row.breakdown).map(([key, value]) => (
                                <div key={key}>
                                  <dt className="text-xs text-muted-foreground">{breakdownLabel(key)}</dt>
                                  <dd className="font-medium">
                                    {typeof value === 'number' && key !== 'deductDays'
                                      ? formatMoney(value)
                                      : String(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                            {row.dayDetails && row.dayDetails.length > 0 ? (
                              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                                      <th className="px-2 py-1.5">Date</th>
                                      <th className="px-2 py-1.5 text-right">Amount (AED)</th>
                                      <th className="px-2 py-1.5">Detail</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.dayDetails.map((day) => (
                                      <tr key={day.date} className="border-b border-border/50">
                                        <td className="px-2 py-1.5">{day.date}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                          {formatMoney(day.amount)}
                                        </td>
                                        <td className="px-2 py-1.5 text-muted-foreground">{day.detail ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
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
                    <Link href={`/hr/employees/${row.employeeId}`} className="text-primary hover:underline">
                      {row.employeeName}
                    </Link>{' '}
                    ({row.employeeCode}) — {row.skipReason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="text-xs text-muted-foreground">
            Only attendance rows with workflow status{' '}
            <Badge variant="outline" className="align-middle">
              APPROVED
            </Badge>{' '}
            are included. Draft rows are listed as a warning and do not affect gross.
          </div>
        </div>
      ) : null}
    </HrPageChrome>
  );
}
