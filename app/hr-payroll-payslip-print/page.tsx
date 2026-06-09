'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { readApiJson } from '@/lib/utils/readApiResponse';
import {
  formatPayMoney,
  formatPayMonthLabel,
  payrollBreakdownLabel,
} from '@/lib/hr/payroll/payslipFormatting';

type PayRunLine = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payTypeName: string | null;
  gross: number;
  breakdown: Record<string, number>;
  skipped: boolean;
};

type PayRunPayload = {
  id: string;
  companyName: string;
  month: string;
  totalGross: number;
  note: string | null;
  createdAt: string;
  lines: PayRunLine[];
};

export default function HrPayrollPayslipPrintPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId') ?? '';
  const employeeId = searchParams.get('employeeId') ?? '';
  const autoPrint = searchParams.get('auto') === '1';

  const [run, setRun] = useState<PayRunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      setError('Missing runId');
      setLoading(false);
      return;
    }
    void fetch(`/api/hr/payroll/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await readApiJson<PayRunPayload>(res);
        if (!json || !res.ok || !json.success || !json.data) {
          setError(json?.error ?? 'Failed to load pay run');
          return;
        }
        setRun(json.data);
      })
      .catch(() => setError('Failed to load pay run'))
      .finally(() => setLoading(false));
  }, [runId]);

  const slips = useMemo(() => {
    if (!run) return [];
    const included = run.lines.filter((l) => !l.skipped);
    if (employeeId) return included.filter((l) => l.employeeId === employeeId);
    return included;
  }, [run, employeeId]);

  useEffect(() => {
    if (!autoPrint || loading || error || slips.length === 0) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint, loading, error, slips.length]);

  if (loading) {
    return <p className="p-8 text-sm text-slate-600">Loading payslips…</p>;
  }

  if (error || !run) {
    return <p className="p-8 text-sm text-red-700">{error ?? 'Pay run not found'}</p>;
  }

  if (slips.length === 0) {
    return <p className="p-8 text-sm text-slate-600">No payslip rows for this selection.</p>;
  }

  const periodLabel = formatPayMonthLabel(run.month);
  const finalizedLabel = new Date(run.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .payslip-toolbar { display: none !important; }
          .payslip-sheet { box-shadow: none !important; margin: 0 !important; }
          .payslip-sheet + .payslip-sheet { page-break-before: always; }
        }
        @media screen {
          body { background: #e2e8f0; }
        }
      `}</style>

      <div className="payslip-toolbar sticky top-0 z-10 border-b border-slate-300 bg-white/95 px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Payslips — {periodLabel}
            </p>
            <p className="text-xs text-slate-600">
              {slips.length} employee{slips.length === 1 ? '' : 's'} · Use Print → Save as PDF
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 print:space-y-0 print:px-0 print:py-0">
        {slips.map((line) => (
          <article
            key={line.id}
            className="payslip-sheet rounded-lg border border-slate-200 bg-white p-8 shadow-md print:rounded-none print:border-0 print:p-0 print:shadow-none"
          >
            <header className="border-b border-slate-300 pb-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">Payslip</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900">{run.companyName}</h1>
              <p className="mt-1 text-sm text-slate-600">Pay period: {periodLabel}</p>
            </header>

            <section className="mt-5 grid gap-1 text-sm">
              <p>
                <span className="text-slate-500">Employee:</span>{' '}
                <span className="font-semibold text-slate-900">{line.employeeName}</span>
              </p>
              <p>
                <span className="text-slate-500">Code:</span> {line.employeeCode}
              </p>
              {line.payTypeName ? (
                <p>
                  <span className="text-slate-500">Pay type:</span> {line.payTypeName}
                </p>
              ) : null}
              <p>
                <span className="text-slate-500">Finalized:</span> {finalizedLabel}
              </p>
            </section>

            <table className="mt-6 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Component</th>
                  <th className="py-2 text-right">Amount (AED)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(line.breakdown ?? {}).map(([key, value]) => (
                  <tr key={key} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-800">{payrollBreakdownLabel(key)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-900">
                      {typeof value === 'number' && key !== 'deductDays'
                        ? formatPayMoney(value)
                        : String(value)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-3 pr-4 text-slate-900">Gross pay</td>
                  <td className="py-3 text-right tabular-nums text-slate-900">
                    {formatPayMoney(line.gross)}
                  </td>
                </tr>
              </tbody>
            </table>

            {run.note ? (
              <p className="mt-4 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Run note:</span> {run.note}
              </p>
            ) : null}

            <footer className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
              Computer-generated payslip from finalized pay run. Not a bank transfer instruction.
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
