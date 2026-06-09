'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { readApiJson } from '@/lib/utils/readApiResponse';
type PayRunRow = {
  id: string;
  month: string;
  status: string;
  totalGross: number;
  employeeCount: number;
  includedCount: number;
  lineCount: number;
  note: string | null;
  createdAt: string;
};

function formatMoney(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayRunsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = session?.user?.isSuperAdmin || perms.includes('hr.payroll.compensation');

  const [runs, setRuns] = useState<PayRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/payroll/runs', { cache: 'no-store' });
      const json = await readApiJson<PayRunRow[]>(res);
      if (!json) {
        toast.error('Invalid response from server. Try restarting the dev server after schema changes.');
        setRuns([]);
        return;
      }
      if (res.ok && json.success) {
        setRuns((json.data ?? []) as PayRunRow[]);
      } else {
        toast.error(json.error ?? 'Failed to load pay runs');
        setRuns([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

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
          <h1 className="text-lg font-semibold">Pay runs</h1>
          <p className="text-sm text-muted-foreground">
            Finalized monthly payroll snapshots. Create a new run from Payroll preview.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/hr/payroll/preview"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            Payroll preview
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No pay runs yet. Open{' '}
          <Link href="/hr/payroll/preview" className="text-primary hover:underline">
            Payroll preview
          </Link>{' '}
          and finalize a month when attendance is approved.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Included</th>
                <th className="px-3 py-2 text-right">Total gross (AED)</th>
                <th className="px-3 py-2">Finalized</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b">
                  <td className="px-3 py-2 font-medium">{run.month}</td>
                  <td className="px-3 py-2">{run.status}</td>
                  <td className="px-3 py-2">
                    {run.includedCount} / {run.employeeCount}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(run.totalGross)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString('en-GB')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/hr/payroll/runs/${run.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HrPageChrome>
  );
}
