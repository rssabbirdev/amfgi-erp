'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { Button } from '@/components/ui/shadcn/button';
import { downloadPayPreviewCsv } from '@/lib/hr/payroll/exportPayPreviewCsv';
import { readApiJson } from '@/lib/utils/readApiResponse';

type PayRunLine = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payTypeName: string | null;
  payTypeCode: string | null;
  gross: number;
  breakdown: Record<string, number>;
  dayDetails?: Array<{ date: string; amount: number; detail?: string }> | null;
  approvedAttendanceRows: number;
  draftAttendanceRows: number;
  skipped: boolean;
  skipReason: string | null;
};

function openPayslipPrint(runId: string, employeeId?: string) {
  const q = new URLSearchParams({ runId });
  if (employeeId) q.set('employeeId', employeeId);
  window.open(`/hr-payroll-payslip-print?${q}`, '_blank', 'noopener,noreferrer');
}

type PayRunDetail = {
  id: string;
  companyName?: string;
  month: string;
  status: string;
  totalGross: number;
  employeeCount: number;
  includedCount: number;
  note: string | null;
  createdAt: string;
  lines: PayRunLine[];
};

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

export default function PayRunDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const runId = params?.id ?? '';
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = session?.user?.isSuperAdmin || perms.includes('hr.payroll.compensation');

  const [run, setRun] = useState<PayRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!runId) return;
    const res = await fetch(`/api/hr/payroll/runs/${runId}`, { cache: 'no-store' });
    const json = await readApiJson<PayRunDetail>(res);
    if (!json || !res.ok || !json.success) {
      toast.error(json?.error ?? 'Failed to load pay run');
      setRun(null);
    } else {
      setRun(json.data as PayRunDetail);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    if (!canView || !runId) return;
    setLoading(true);
    void load();
  }, [canView, runId, load]);

  if (!canView) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.payroll.compensation permission.</p>
      </HrPageChrome>
    );
  }

  const included = run?.lines.filter((l) => !l.skipped) ?? [];
  const skipped = run?.lines.filter((l) => l.skipped) ?? [];

  return (
    <HrPageChrome>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Pay run {run?.month ?? ''}</h1>
          <p className="text-sm text-muted-foreground">
            {run?.companyName ? `${run.companyName} · ` : ''}
            Finalized snapshot — print payslips or export CSV.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {run ? (
            <>
              <Link
                href={`/hr/payroll/preview?month=${encodeURIComponent(run.month)}`}
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
              >
                Preview month
              </Link>
              <Link
                href={`/hr/reports/attendance?month=${encodeURIComponent(run.month)}`}
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
              >
                Attendance report
              </Link>
            </>
          ) : null}
          <Link
            href="/hr/payroll/runs"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            All pay runs
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !run ? (
        <p className="text-sm text-muted-foreground">Pay run not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Total gross</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(run.totalGross)} AED</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Included</p>
              <p className="mt-1 text-xl font-semibold">
                {run.includedCount} / {run.employeeCount}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Status</p>
              <p className="mt-1 text-xl font-semibold">{run.status}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">Finalized</p>
              <p className="mt-1 text-sm font-medium">
                {new Date(run.createdAt).toLocaleString('en-GB')}
              </p>
            </div>
          </div>

          {run.note ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Note:</span> {run.note}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={included.length === 0}
              onClick={() => openPayslipPrint(run.id)}
            >
              Print all payslips
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                downloadPayPreviewCsv(
                  run.month,
                  run.lines.map((line) => ({
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    payTypeName: line.payTypeName,
                    payTypeCode: line.payTypeCode,
                    approvedAttendanceRows: line.approvedAttendanceRows,
                    draftAttendanceRows: line.draftAttendanceRows,
                    gross: line.gross,
                    skipped: line.skipped,
                    skipReason: line.skipReason,
                  }))
                );
                toast.success('CSV downloaded');
              }}
            >
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete pay run for ${run.month}? You can finalize again from preview after correcting attendance.`
                  )
                ) {
                  return;
                }
                setDeleting(true);
                void fetch(`/api/hr/payroll/runs/${run.id}`, { method: 'DELETE' })
                  .then(async (res) => {
                    const json = await readApiJson(res);
                    if (!json || !res.ok || !json.success) {
                      toast.error(json?.error ?? 'Delete failed');
                      return;
                    }
                    toast.success('Pay run deleted');
                    router.push('/hr/payroll/preview?month=' + encodeURIComponent(run.month));
                  })
                  .finally(() => setDeleting(false));
              }}
            >
              {deleting ? 'Deleting…' : 'Delete pay run'}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Pay type</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {included.map((row) => (
                  <Fragment key={row.id}>
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
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(row.gross)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openPayslipPrint(run.id, row.employeeId)}
                          >
                            Payslip
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setExpandedId((id) => (id === row.id ? null : row.id))
                            }
                          >
                            {expandedId === row.id ? 'Hide' : 'Breakdown'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={4} className="px-4 py-3">
                          <dl className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                            {Object.entries(row.breakdown as Record<string, number>).map(([key, value]) => (
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
                          {Array.isArray(row.dayDetails) && row.dayDetails.length > 0 ? (
                            <div className="mt-3 overflow-x-auto rounded-md border border-border">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                                    <th className="px-2 py-1.5">Date</th>
                                    <th className="px-2 py-1.5 text-right">Amount</th>
                                    <th className="px-2 py-1.5">Detail</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.dayDetails.map((day) => (
                                    <tr key={day.date} className="border-b border-border/50">
                                      <td className="px-2 py-1.5">{day.date}</td>
                                      <td className="px-2 py-1.5 text-right">{formatMoney(day.amount)}</td>
                                      <td className="px-2 py-1.5">{day.detail ?? '—'}</td>
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

          {skipped.length > 0 ? (
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-4 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Skipped ({skipped.length})
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {skipped.map((row) => (
                  <li key={row.id}>
                    {row.employeeName} ({row.employeeCode}) — {row.skipReason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </HrPageChrome>
  );
}
