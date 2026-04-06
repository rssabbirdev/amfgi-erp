'use client';

interface Row {
  jobId:        string;
  jobNumber:    string;
  materialId:   string;
  materialName: string;
  unit:         string;
  dispatched:   number;
  returned:     number;
  netConsumed:  number;
}

interface Props {
  rows: Row[];
  onExport?: () => void;
}

// Build pivot: rows = unique jobs, columns = unique materials
function buildPivot(rows: Row[]) {
  const jobMap   = new Map<string, string>();   // jobId → jobNumber
  const matMap   = new Map<string, { name: string; unit: string }>();
  const cell     = new Map<string, Map<string, Row>>();

  for (const r of rows) {
    jobMap.set(r.jobId, r.jobNumber);
    matMap.set(r.materialId, { name: r.materialName, unit: r.unit });
    if (!cell.has(r.jobId)) cell.set(r.jobId, new Map());
    cell.get(r.jobId)!.set(r.materialId, r);
  }

  return {
    jobs:      Array.from(jobMap.entries()).sort((a, b) => a[1].localeCompare(b[1])),
    materials: Array.from(matMap.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    cell,
  };
}

export default function JobConsumptionTable({ rows, onExport }: Props) {
  const { jobs, materials, cell } = buildPivot(rows);

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        No data for the selected filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {onExport && (
        <div className="flex justify-end">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="text-sm text-slate-300 border-collapse">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              <th className="px-4 py-3 text-left font-medium text-slate-400 sticky left-0 bg-slate-800 z-10 min-w-[120px]">
                Job #
              </th>
              {materials.map(([id, m]) => (
                <th key={id} className="px-3 py-3 text-center font-medium text-slate-400 min-w-[100px]">
                  <div className="truncate max-w-[120px]">{m.name}</div>
                  <div className="text-xs font-normal text-slate-600">{m.unit}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium text-slate-400 bg-slate-800/80">Total Items</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(([jobId, jobNumber]) => {
              const jobCells = cell.get(jobId)!;
              const totalItems = materials.filter(([matId]) => jobCells.has(matId)).length;
              return (
                <tr key={jobId} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-semibold text-emerald-400 sticky left-0 bg-slate-900 z-10">
                    {jobNumber}
                  </td>
                  {materials.map(([matId]) => {
                    const c = jobCells.get(matId);
                    return (
                      <td key={matId} className="px-3 py-3 text-center font-mono">
                        {c ? (
                          <div>
                            <div className="text-white font-semibold">{c.netConsumed.toFixed(2)}</div>
                            {c.returned > 0 && (
                              <div className="text-xs text-blue-400">({c.dispatched.toFixed(2)} − {c.returned.toFixed(2)})</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-medium text-slate-400">{totalItems}</td>
                </tr>
              );
            })}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr className="border-t border-slate-600 bg-slate-800/60">
              <td className="px-4 py-3 font-semibold text-slate-300 sticky left-0 bg-slate-800 z-10">Totals</td>
              {materials.map(([matId]) => {
                const total = rows
                  .filter((r) => r.materialId === matId)
                  .reduce((acc, r) => acc + r.netConsumed, 0);
                return (
                  <td key={matId} className="px-3 py-3 text-center font-mono font-semibold text-white">
                    {total.toFixed(2)}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right font-semibold text-slate-300">{jobs.length}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
