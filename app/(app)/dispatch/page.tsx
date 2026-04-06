'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

export default function DispatchPage() {
  const { data: session } = useSession();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canDispatch = isSA || perms.includes('transaction.stock_out');

  if (!canDispatch) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">You don't have permission to access dispatch operations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dispatch Management</h1>
        <p className="text-slate-400 text-sm mt-1">Manage material dispatch operations and view history</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* New Dispatch Entry */}
        <Link href="/dispatch/entry">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">New Dispatch</h2>
                <p className="text-sm text-slate-400 mt-1">Dispatch materials to a job</p>
              </div>
              <svg className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Create a new dispatch entry. If an entry already exists for the selected job and date, you can modify it.
            </p>
            <Button variant="secondary" className="w-full">
              Start Dispatch
            </Button>
          </div>
        </Link>

        {/* Dispatch History */}
        <Link href="/dispatch/history">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Dispatch History</h2>
                <p className="text-sm text-slate-400 mt-1">View and manage past dispatch entries</p>
              </div>
              <svg className="h-8 w-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Review previous dispatch entries with advanced filtering by day, month, or all entries. Edit or delete entries as needed.
            </p>
            <Button variant="secondary" className="w-full">
              View History
            </Button>
          </div>
        </Link>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">One Entry Per</p>
          <p className="text-sm font-medium text-white">Job & Date</p>
          <p className="text-xs text-slate-500 mt-1">Each job can have only one dispatch entry per date</p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Auto-Load</p>
          <p className="text-sm font-medium text-white">Existing Entries</p>
          <p className="text-xs text-slate-500 mt-1">Form populates automatically when opening an existing dispatch</p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Stock Management</p>
          <p className="text-sm font-medium text-white">Atomic Updates</p>
          <p className="text-xs text-slate-500 mt-1">Stock adjustments are reversed when updating dispatches</p>
        </div>
      </div>
    </div>
  );
}
