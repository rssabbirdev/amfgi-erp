'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGetStockIntegrityQuery } from '@/store/hooks';

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatExceptionLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default function StockIntegrityPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView =
    isSA ||
    perms.includes('material.view') ||
    perms.includes('transaction.stock_in') ||
    perms.includes('transaction.stock_out');

  const { data, isFetching, isError, refetch } = useGetStockIntegrityQuery(undefined, {
    skip: !canView,
  });

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.materialName.toLowerCase().includes(query)) return false;
      if (filter === 'all') return true;
      if (filter === 'with_exceptions') return row.exceptions.length > 0;
      return row.exceptions.includes(filter);
    });
  }, [filter, rows, search]);

  if (!canView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock integrity</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">You do not have permission to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300/80">
            Stock control
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
            Stock integrity
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            This report compares company stock, warehouse balances, and open FIFO batches for the same material.
            Any mismatch means the stock flow needs review before valuation and job costing become unreliable.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Materials</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.totalMaterials ?? 0}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Exceptions</p>
              <p className="mt-2 text-xl font-semibold text-amber-900 dark:text-amber-100">{summary?.materialsWithExceptions ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Warehouse mismatch</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.warehouseMismatchCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Batch mismatch</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.batchMismatchCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Batchless stock</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.batchlessStockCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Negative stock</p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{summary?.negativeStockCount ?? 0}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search material</label>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by material name..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="min-w-[220px]">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Exception filter</label>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-amber-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All rows</option>
                <option value="with_exceptions">Only rows with exceptions</option>
                <option value="warehouse_mismatch">Warehouse mismatch</option>
                <option value="batch_mismatch">Batch mismatch</option>
                <option value="batchless_stock">Batchless stock</option>
                <option value="inactive_warehouse_stock">Inactive warehouse stock</option>
                <option value="inactive_batch_stock">Inactive batch stock</option>
                <option value="negative_company_stock">Negative company stock</option>
                <option value="negative_warehouse_stock">Negative warehouse stock</option>
                <option value="negative_batch_stock">Negative batch stock</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the integrity report. Try refresh.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="sticky left-0 z-20 min-w-[220px] border-r border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/95">
                      Material
                    </th>
                    <th className="min-w-[72px] px-3 py-3">Unit</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Company</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Warehouse</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Batches</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Wh delta</th>
                    <th className="min-w-[110px] px-3 py-3 text-right">Batch delta</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Batchless</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Inactive wh</th>
                    <th className="min-w-[120px] px-3 py-3 text-right">Open batches</th>
                    <th className="min-w-[240px] px-3 py-3">Exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                        No rows match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.materialId}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40"
                      >
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-3 py-2.5 font-medium dark:border-slate-800">
                          <Link
                            href={`/stock/materials/${row.materialId}`}
                            className="text-amber-700 hover:underline dark:text-amber-300"
                          >
                            {row.materialName}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.unit}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.companyTotal)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.warehouseTotal)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(row.batchTotal)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${Math.abs(row.warehouseDelta) > 0.0005 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {formatQty(row.warehouseDelta)}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${Math.abs(row.batchDelta) > 0.0005 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {formatQty(row.batchDelta)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(row.batchlessWarehouseQty)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(row.inactiveWarehouseQty)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{row.openBatchCount}</td>
                        <td className="px-3 py-2.5">
                          {row.exceptions.length === 0 ? (
                            <span className="text-slate-400 dark:text-slate-500">Clear</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {row.exceptions.map((exception) => (
                                <span
                                  key={exception}
                                  className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                                >
                                  {formatExceptionLabel(exception)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-500">
        Use{' '}
        <Link href="/reports/stock-exceptions" className="text-amber-700 underline dark:text-amber-300">
          Stock exceptions
        </Link>{' '}
        for override and receipt-adjustment trails,{' '}
        <Link href="/stock/stock-batches" className="text-amber-700 underline dark:text-amber-300">
          Stock batches
        </Link>{' '}
        for receipt-layer detail and{' '}
        <Link href="/stock/inventory-by-warehouse" className="text-amber-700 underline dark:text-amber-300">
          Inventory by warehouse
        </Link>{' '}
        for the full warehouse split view.
      </p>
    </div>
  );
}
