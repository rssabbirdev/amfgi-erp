'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button }                           from '@/components/ui/Button';
import JobConsumptionTable                  from '@/components/reports/JobConsumptionTable';
import Spinner                              from '@/components/ui/Spinner';
import { useGetJobsQuery, useLazyGetJobConsumptionQuery } from '@/store/hooks';

interface ReportRow {
  jobId:        string;
  jobNumber:    string;
  materialId:   string;
  materialName: string;
  unit:         string;
  dispatched:   number;
  returned:     number;
  netConsumed:  number;
}

export default function JobConsumptionPage() {
  const { data: jobs = [] } = useGetJobsQuery();
  const [triggerGetJobConsumption, { data: rows = [], isLoading: loading }] = useLazyGetJobConsumptionQuery();

  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    setHasSearched(true);
    await triggerGetJobConsumption({
      from: from || undefined,
      to: to || undefined,
      jobIds: selectedJobs,
    });
  };

  const handleExport = () => {
    if (!rows.length) return;

    // Build CSV
    const headers = ['Job #', 'Material', 'Unit', 'Dispatched', 'Returned', 'Net Consumed'];
    const csvRows = rows.map((r) => [
      r.jobNumber, r.materialName, r.unit,
      r.dispatched, r.returned, r.netConsumed,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `job-consumption-${from || 'all'}-${to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleJob = (id: string) =>
    setSelectedJobs((prev) =>
      prev.includes(id) ? prev.filter((j) => j !== id) : [...prev, id]
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Job Consumption Report</h1>
        <p className="text-slate-400 text-sm mt-1">
          Net material usage per job — dispatched minus end-of-day returns
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Need budget and profitability context?{' '}
          <Link href="/reports/job-profitability" className="text-emerald-300 hover:text-emerald-200 underline">
            Open customer and job profitability
          </Link>
          .
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-4">
        <h2 className="font-semibold text-white text-sm">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Date From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Date To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-end">
            <Button fullWidth onClick={handleSearch} loading={loading}>
              Generate Report
            </Button>
          </div>
        </div>

        {/* Job multi-select */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Filter by Jobs <span className="text-slate-500">(leave blank for all)</span>
          </label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => toggleJob(j.id)}
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                  selectedJobs.includes(j.id)
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white',
                ].join(' ')}
              >
                {j.jobNumber}
              </button>
            ))}
          </div>
          {selectedJobs.length > 0 && (
            <button onClick={() => setSelectedJobs([])} className="text-xs text-slate-500 hover:text-slate-300 mt-2">
              Clear selection ({selectedJobs.length} selected)
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="py-16"><Spinner size="lg" /></div>
      ) : hasSearched ? (
        <JobConsumptionTable rows={rows} onExport={handleExport} />
      ) : (
        <div className="rounded-xl border border-slate-700/50 border-dashed py-16 text-center text-slate-500">
          Select your date range and click Generate Report
        </div>
      )}
    </div>
  );
}
