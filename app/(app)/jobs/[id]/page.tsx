'use client';

import { useEffect, useState, use }       from 'react';
import Link                               from 'next/link';
import { Button }             from '@/components/ui/Button';
import { StatusBadge }        from '@/components/ui/Badge';
import TransactionLedger      from '@/components/transactions/TransactionLedger';
import StockTransactionModal  from '@/components/transactions/StockTransactionModal';
import { formatDate }         from '@/lib/utils/formatters';
import { useSession }         from 'next-auth/react';
import Spinner                from '@/components/ui/Spinner';

interface Job {
  _id:        string;
  jobNumber:  string;
  description: string;
  site?:      string;
  status:     string;
  startDate?: string;
  customerId: { _id: string; name: string };
}

interface MaterialSummary {
  materialId:        string;
  materialName:      string;
  unit:              string;
  dispatched:        number;
  returned:          number;
  netConsumed:       number;
  availableToReturn: number;
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();

  const [job,       setJob]       = useState<Job | null>(null);
  const [summary,   setSummary]   = useState<MaterialSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [txMode,    setTxMode]    = useState<'STOCK_OUT' | 'RETURN' | null>(null);
  const [refresh,   setRefresh]   = useState(0);

  const fetchJob = () =>
    fetch(`/api/jobs/${id}`).then((r) => r.json()).then((j) => setJob(j.data));

  const fetchSummary = () =>
    fetch(`/api/jobs/${id}/materials`).then((r) => r.json()).then((j) => setSummary(j.data ?? []));

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchJob(), fetchSummary()]).finally(() => setLoading(false));
  }, [id, refresh]);

  const onTxSuccess = () => {
    setTxMode(null);
    setRefresh((r) => r + 1);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  if (!job)    return <p className="text-slate-400 text-center py-12">Job not found.</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/jobs" className="text-slate-500 hover:text-slate-300 text-sm">← Jobs</Link>
            <StatusBadge status={job.status} />
          </div>
          <h1 className="text-2xl font-bold text-white">{job.jobNumber}</h1>
          <p className="text-slate-400 mt-1">{job.description}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setTxMode('RETURN')}>
            End-of-Day Return
          </Button>
          <Button onClick={() => setTxMode('STOCK_OUT')}>
            Dispatch Materials
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Customer',   value: job.customerId?.name ?? '—' },
          { label: 'Site',       value: job.site ?? '—' },
          { label: 'Start Date', value: job.startDate ? formatDate(job.startDate) : '—' },
          { label: 'Status',     value: job.status.replace('_', ' ') },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-slate-800 border border-slate-700 p-4">
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className="font-semibold text-white text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Material Consumption Summary */}
      {summary.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Material Consumption Summary</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  <th className="px-4 py-3 text-left font-medium text-slate-400">Material</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">Dispatched</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">Returned</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">Net Consumed</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">Available to Return</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.materialId} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-white">{s.materialName}</td>
                    <td className="px-4 py-3 text-right font-mono text-orange-400">{s.dispatched} {s.unit}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-400">{s.returned} {s.unit}</td>
                    <td className="px-4 py-3 text-right font-mono text-white font-semibold">{s.netConsumed} {s.unit}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">{s.availableToReturn} {s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Ledger */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Transaction History</h2>
        <TransactionLedger jobId={id} refresh={refresh} />
      </div>

      {/* Dispatch Modal */}
      <StockTransactionModal
        isOpen={txMode === 'STOCK_OUT'}
        onClose={() => setTxMode(null)}
        onSuccess={onTxSuccess}
        mode="STOCK_OUT"
        preselectedJobId={id}
      />

      {/* Return Modal */}
      <StockTransactionModal
        isOpen={txMode === 'RETURN'}
        onClose={() => setTxMode(null)}
        onSuccess={onTxSuccess}
        mode="RETURN"
        preselectedJobId={id}
      />
    </div>
  );
}
