'use client';

import { useEffect, useState } from 'react';
import { StatusBadge }         from '@/components/ui/Badge';
import { formatDate }          from '@/lib/utils/formatters';
import Spinner                 from '@/components/ui/Spinner';

interface Transaction {
  _id:        string;
  type:       string;
  quantity:   number;
  date:       string;
  notes?:     string;
  materialId: { name: string; unit: string } | string;
  performedBy?: { name: string } | string;
}

export default function TransactionLedger({ jobId, refresh }: { jobId: string; refresh?: number }) {
  const [txns,    setTxns]    = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/transactions?jobId=${jobId}&limit=100`)
      .then((r) => r.json())
      .then((j) => { setTxns(j.data ?? []); setLoading(false); });
  }, [jobId, refresh]);

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
            const mat = typeof t.materialId === 'object' ? t.materialId : { name: t.materialId, unit: '' };
            const by  = typeof t.performedBy === 'object' ? t.performedBy?.name : '—';
            return (
              <tr key={t._id} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-400">{formatDate(t.date)}</td>
                <td className="px-4 py-3"><StatusBadge status={t.type} /></td>
                <td className="px-4 py-3 font-medium text-white">{mat.name}</td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={t.type === 'RETURN' ? 'text-blue-400' : t.type === 'STOCK_OUT' ? 'text-orange-400' : 'text-emerald-400'}>
                    {t.type === 'STOCK_OUT' ? '-' : '+'}{t.quantity} {mat.unit}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{t.notes ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400">{by}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
