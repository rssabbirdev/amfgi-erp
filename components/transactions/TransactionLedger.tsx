'use client';

import { StatusBadge }         from '@/components/ui/Badge';
import { formatDate }          from '@/lib/utils/formatters';
import Spinner                 from '@/components/ui/Spinner';
import { useGetTransactionsByJobQuery } from '@/store/hooks';

interface Transaction {
  id:         string;
  type:       'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'REVERSAL';
  quantity:   number;
  date:       Date | string;
  notes?:     string;
  materialId: string;
  performedBy: string;
  companyId: string;
  jobId?: string;
  totalCost: number;
  averageCost: number;
  batchesUsed?: any[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export default function TransactionLedger({ jobId }: { jobId: string }) {
  const { data: txns = [], isLoading: loading } = useGetTransactionsByJobQuery({
    jobId,
    limit: 100,
  });

  if (loading) return <Spinner />;
  if (txns.length === 0) return (
    <p className="text-center text-slate-500 py-8">No transactions recorded yet.</p>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm text-slate-300">
        <thead>
          <tr className="bg-slate-800 border-b border-slate-700">
            <th className="px-4 py-3 text-left font-medium text-slate-400">Date</th>
            <th className="px-4 py-3 text-left font-medium text-slate-400">Type</th>
            <th className="px-4 py-3 text-left font-medium text-slate-400">Material</th>
            <th className="px-4 py-3 text-right font-medium text-slate-400">Qty</th>
            <th className="px-4 py-3 text-left font-medium text-slate-400">Notes</th>
            <th className="px-4 py-3 text-left font-medium text-slate-400">By</th>
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => {
            return (
              <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-400">{formatDate(t.date)}</td>
                <td className="px-4 py-3"><StatusBadge status={t.type} /></td>
                <td className="px-4 py-3 font-medium text-white">—</td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={t.type === 'RETURN' ? 'text-blue-400' : t.type === 'STOCK_OUT' ? 'text-orange-400' : 'text-emerald-400'}>
                    {t.type === 'STOCK_OUT' ? '-' : '+'}{t.quantity}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{t.notes ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400">{t.performedBy ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
