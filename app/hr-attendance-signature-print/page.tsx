'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import type { SignatureSheetPayload } from '@/lib/hr/buildAttendanceSignatureSheet';
import { formatSignatureSheetDateLabel } from '@/lib/hr/buildAttendanceSignatureSheet';
import { readApiJson } from '@/lib/utils/readApiResponse';

export default function HrAttendanceSignaturePrintPage() {
  const searchParams = useSearchParams();
  const workDate = searchParams.get('workDate') ?? '';
  const group = searchParams.get('group') ?? '';
  const autoPrint = searchParams.get('auto') === '1';

  const [payload, setPayload] = useState<SignatureSheetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workDate || !group) {
      setError('Missing workDate or group');
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams({ workDate, group });
    void fetch(`/api/hr/attendance/signature-sheet?${qs.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await readApiJson<SignatureSheetPayload>(res);
        if (!json || !res.ok || !json.success || !json.data) {
          setError(json?.error ?? 'Failed to load signature sheet');
          return;
        }
        setPayload(json.data);
      })
      .catch(() => setError('Failed to load signature sheet'))
      .finally(() => setLoading(false));
  }, [workDate, group]);

  useEffect(() => {
    if (!autoPrint || loading || error || !payload) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint, loading, error, payload]);

  const nameColumnWidthCh = useMemo(() => {
    if (!payload?.entries.length) return 'Worker Name'.length + 2;
    const longestName = payload.entries.reduce(
      (max, entry) => Math.max(max, entry.employeeName.length),
      'Worker Name'.length,
    );
    return longestName + 2;
  }, [payload?.entries]);

  if (loading) {
    return <p className="p-8 text-sm text-slate-600">Loading signature sheet…</p>;
  }

  if (error || !payload) {
    return <p className="p-8 text-sm text-red-700">{error ?? 'Signature sheet not found'}</p>;
  }

  const dateLabel = formatSignatureSheetDateLabel(payload.workDate);

  return (
		<>
			<style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .signature-toolbar { display: none !important; }
          .signature-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .signature-table { table-layout: auto; width: 100%; font-size: 11px; }
        .signature-table th,
        .signature-table td {
          padding: 2px 4px;
          line-height: 1.25;
        }
        .signature-table .col-serial {
          width: 1%;
          white-space: nowrap;
          padding: 2px 2px;
          text-align: center;
        }
        .signature-table thead th {
          font-size: 12px;
          font-weight: 600;
          padding: 3px 4px;
        }
        .signature-table tbody .col-serial,
        .signature-table tbody .col-name,
        .signature-table tbody .col-note {
          font-size: 12px;
          font-weight: 600;
        }
        .signature-table tbody .col-time {
          font-size: 8px;
          font-weight: 600;
          text-align: left;
          white-space: nowrap;
        }
        .signature-table .col-name {
          white-space: nowrap;
          width: 1%;
        }
        .signature-table .col-note {
          width: 1%;
          min-width: 12ch;
          white-space: nowrap;
          padding: 2px 2px;
          text-align: center;
        }
        .signature-table .col-sign {
          height: 1.75rem;
        }
        .signature-table .col-break-out {
          background: #ffff00 !important;
          color: #000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .signature-table .col-inverted {
          background: #ffff00 !important;
          color: #000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .signature-table tr.row-absent td {
          color: #dc2626 !important;
        }
        .signature-table tr.row-absent .col-break-out-cell {
          color: #000 !important;
          background: transparent !important;
        }
        @media screen {
          body { background: #e2e8f0; }
        }
      `}</style>

			<div className='signature-toolbar sticky top-0 z-10 border-b border-slate-300 bg-white/95 px-4 py-3 shadow-sm'>
				<div className='mx-auto flex max-w-5xl items-center justify-between gap-3'>
					<div>
						<p className='text-sm font-semibold text-slate-900'>
							Attendance signature sheet — {payload.groupName}
						</p>
						<p className='text-xs text-slate-600'>
							{dateLabel} · {payload.entries.length} employee
							{payload.entries.length === 1 ? '' : 's'} · Use
							Print → Save as PDF
						</p>
					</div>
					<div className='flex gap-2'>
						<button
							type='button'
							onClick={() => window.print()}
							className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50'
						>
							Print / Save PDF
						</button>
						<button
							type='button'
							onClick={() => window.close()}
							className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
						>
							Close
						</button>
					</div>
				</div>
			</div>

			<div className='signature-sheet mx-auto max-w-5xl px-4 py-8 print:px-0 print:py-0'>
				<article className='rounded-lg border border-slate-200 bg-white p-6 shadow-md print:rounded-none print:border-0 print:p-0 print:shadow-none'>
					<header className='border-b border-slate-300 pb-3'>
						<p className='text-xs uppercase tracking-widest text-slate-500'>
							Attendance signature sheet
						</p>
						<div className='mt-1 flex items-baseline justify-between gap-4'>
							<h1 className='text-lg font-bold text-slate-900'>
								{payload.companyName}
							</h1>
							<p className='shrink-0 text-right text-lg font-bold text-slate-900'>
								{payload.groupName}
							</p>
						</div>
						<p className='mt-1 text-sm text-slate-700'>
							Date:{' '}
							<span className='font-semibold'>{dateLabel}</span>
						</p>
					</header>

					<table className='signature-table mt-3 border-collapse'>
						<thead>
							<tr className='border border-slate-300 bg-slate-50 text-left'>
								<th className='col-serial border border-slate-300'>
									SN
								</th>
								<th
									className='col-name border border-slate-300'
									style={{
										minWidth: `${nameColumnWidthCh}ch`,
									}}
								>
									Worker Name
								</th>
								<th className='col-time w-16 border border-slate-300'>
									Duty In
								</th>
								<th className='col-time w-16 border border-slate-300'>
									Break Out
								</th>
								<th className='col-time w-16 border border-slate-300'>
									Break In
								</th>
								<th className='col-time w-16 border border-slate-300'>
									Duty Out
								</th>
								<th className='col-note border border-slate-300'>
									Note
								</th>
							</tr>
						</thead>
						<tbody>
							{payload.entries.map((entry) => {
								const isAbsent = entry.locationLabel === 'ABSENT';
								const rowClass = isAbsent ? 'row-absent' : undefined;
								return (
								<Fragment key={entry.employeeId}>
									<tr
										key={`${entry.employeeId}-data`}
										className={rowClass}
										style={{ pageBreakInside: 'avoid' }}
									>
										<td
											rowSpan={2}
											className='col-serial border border-slate-300 align-middle text-center'
										>
											{entry.serial}
										</td>
										<td
											rowSpan={2}
											className='col-name border border-slate-300 align-middle'
											style={{
												minWidth: `${nameColumnWidthCh}ch`,
											}}
										>
											{entry.employeeName}
										</td>
										<td className='col-time border border-slate-300'>
											{entry.dutyIn}
										</td>
										<td
											className={`col-time col-break-out-cell border border-slate-300${isAbsent ? '' : ' col-break-out'}`}
										>
											{entry.breakOut}
										</td>
										<td className='col-time border border-slate-300'>
											{entry.breakIn}
										</td>
										<td className='col-time border border-slate-300'>
											{entry.dutyOut}
										</td>
										<td className='col-note border border-slate-300 font-semibold uppercase tracking-wide text-[8px]!'>
											{entry.locationLabel}
										</td>
									</tr>
									<tr
										key={`${entry.employeeId}-sign`}
										className={rowClass}
										style={{ pageBreakInside: 'avoid' }}
									>
										<td className='col-sign col-time border border-slate-300' />
										<td
											className={`col-sign col-time col-break-out-cell border border-slate-300${isAbsent ? '' : ' col-break-out'}`}
										/>
										<td
											className={`col-sign col-time border border-slate-300${entry.noSignRequired ? ' col-inverted' : ''}`}
										>
											{entry.noSignRequired ? (
												<span className='text-[8px] font-semibold uppercase tracking-wide'>
													No Sign
												</span>
											) : null}
										</td>
										<td className='col-sign col-time border border-slate-300' />
										<td className='col-sign border border-slate-300' />
									</tr>
								</Fragment>
								);
							})}
						</tbody>
					</table>
				</article>
			</div>
		</>
  );
}
