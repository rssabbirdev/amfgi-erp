'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import TransactionLedger from '@/components/transactions/TransactionLedger';
import StockTransactionModal from '@/components/transactions/StockTransactionModal';
import Spinner from '@/components/ui/Spinner';
import { useGetJobByIdQuery, useGetJobMaterialsQuery } from '@/store/hooks';

interface MaterialSummary {
  materialId: string;
  materialName: string;
  unit: string;
  dispatched: number;
  returned: number;
  netConsumed: number;
  availableToReturn: number;
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [txMode, setTxMode] = useState<'STOCK_OUT' | 'RETURN' | null>(null);

  const { data: job, isLoading: jobLoading } = useGetJobByIdQuery(id);
  const { data: materialsData, isLoading: materialsLoading } = useGetJobMaterialsQuery(id);
  const summary = materialsData || [];

  const isLoading = jobLoading || materialsLoading;

  const onTxSuccess = () => {
    setTxMode(null);
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  if (!job)
    return <p className="text-slate-400 text-center py-12">Job not found.</p>;

  const contacts = Array.isArray((job as any).contactsJson) ? ((job as any).contactsJson as Array<any>) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/jobs" className="text-slate-500 hover:text-slate-300 text-sm">
              ← Jobs
            </Link>
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

      {/* Job Details Grid */}
      {job && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Customer</p>
            <p className="text-white font-medium mt-2">—</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Site</p>
            <p className="text-white font-medium mt-2">{job.site || '—'}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Start Date</p>
            <p className="text-white font-medium mt-2">
              {job.startDate
                ? new Date(job.startDate).toLocaleDateString('en-AE')
                : '—'}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Status</p>
            <p className="text-white font-medium mt-2">{job.status}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 col-span-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">External Sync</p>
            <p className="text-white font-medium mt-2">
              {(job as any).source === 'EXTERNAL_API' ? 'External API' : 'Local'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              External Job ID: {(job as any).externalJobId || '—'}
            </p>
            <p className="text-xs text-slate-400">
              External Updated: {(job as any).externalUpdatedAt ? new Date((job as any).externalUpdatedAt).toLocaleString() : '—'}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 col-span-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">LPO / Quotation</p>
            <p className="text-white font-medium mt-2">
              LPO: {(job as any).lpoNumber || '—'} · Value: {(job as any).lpoValue ?? '—'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              LPO Date: {(job as any).lpoDate ? new Date((job as any).lpoDate).toLocaleDateString('en-AE') : '—'}
            </p>
            <p className="text-xs text-slate-400">
              Quotation: {(job as any).quotationNumber || '—'} ({(job as any).quotationDate ? new Date((job as any).quotationDate).toLocaleDateString('en-AE') : '—'})
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 col-span-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Address / Location</p>
            <p className="text-white font-medium mt-2">{(job as any).address || '—'}</p>
            <p className="text-xs text-slate-400 mt-1">
              {(job as any).locationName || '—'} · {(job as any).locationLat ?? '—'}, {(job as any).locationLng ?? '—'}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 col-span-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Contact person</p>
            <p className="text-white font-medium mt-2">{(job as any).contactPerson || '—'}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide mt-4">Additional contacts</p>
            {contacts.length === 0 ? (
              <p className="text-slate-400 mt-2">None</p>
            ) : (
              <div className="mt-2 space-y-1">
                {contacts.map((c, i) => (
                  <p key={i} className="text-sm text-white">
                    {c.label ? `[${c.label}] ` : ''}{c.name || '—'} · {c.number || '—'} · {c.email || '—'} · {c.designation || '—'}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Material Summary Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">Material Summary</h2>
          <p className="text-sm text-slate-400 mt-1">Dispatched and returned quantities for this job</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-700">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Material
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Dispatched
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Returned
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Net Consumed
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Available to Return
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    No materials dispatched yet
                  </td>
                </tr>
              ) : (
                summary.map((mat: MaterialSummary) => (
                  <tr key={mat.materialId} className="border-b border-slate-700/50 hover:bg-slate-900/50">
                    <td className="px-6 py-3">
                      <div>
                        <p className="text-white font-medium">{mat.materialName}</p>
                        <p className="text-xs text-slate-500">{mat.unit}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">{mat.dispatched.toFixed(3)}</td>
                    <td className="px-6 py-3 text-right text-slate-300">{mat.returned.toFixed(3)}</td>
                    <td className="px-6 py-3 text-right text-emerald-400 font-semibold">
                      {mat.netConsumed.toFixed(3)}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">{mat.availableToReturn.toFixed(3)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Ledger */}
      <TransactionLedger jobId={id} />

      {/* Stock Transaction Modal */}
      {txMode && (
        <StockTransactionModal
          mode={txMode}
          preselectedJobId={id}
          isOpen={txMode !== null}
          onClose={() => setTxMode(null)}
          onSuccess={onTxSuccess}
        />
      )}
    </div>
  );
}
