'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import StatCard from '@/components/ui/StatCard';
import toast from 'react-hot-toast';

interface Material {
  _id: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
}

interface Summary {
  totalStockValue: number;
  prevMonthConsumptionValue: number;
}

interface ConsumptionData {
  month: number;
  year: number;
  totalValue: number;
  itemCount: number;
  items: Material[];
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topMaterials, setTopMaterials] = useState<Material[]>([]);
  const [topConsumed, setTopConsumed] = useState<Material[]>([]);
  const [currentConsumption, setCurrentConsumption] = useState<ConsumptionData | null>(null);

  if (!session?.user) {
    redirect('/login');
  }

  const dbName = session.user.activeCompanyDbName;

  useEffect(() => {
    if (!dbName) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [valRes, consRes] = await Promise.all([
          fetch('/api/reports/stock-valuation'),
          fetch('/api/reports/consumption'),
        ]);

        const valData = await valRes.json();
        const consData = await consRes.json();

        if (valRes.ok) {
          setSummary(valData.data?.summary);
          setTopMaterials(valData.data?.topMaterialsByValue || []);
          setTopConsumed(valData.data?.topConsumedItems || []);
        }

        if (consRes.ok) {
          setCurrentConsumption(consData.data?.currentMonth);
        }
      } catch (err) {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dbName]);

  if (!dbName) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Select a company from the header to view its data.</p>
        </div>
        <div className="p-8 rounded-xl bg-slate-900 border border-slate-700/50 text-center text-slate-500">
          No company selected. Use the company switcher in the top bar.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">{session.user.activeCompanyName} — live overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
        <StatCard
          title="Total Stock Value (Now)"
          value={summary ? `AED ${(summary.totalStockValue || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}` : '—'}
          color="green"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="Previous Month Consumption Value"
          value={summary ? `AED ${(summary.prevMonthConsumptionValue || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}` : '—'}
          color="orange"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Current Month Consumption */}
      {currentConsumption && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Current Month Consumption</h2>
              <p className="text-sm text-slate-400 mt-1">
                {new Date(currentConsumption.year, currentConsumption.month - 1).toLocaleDateString('en-AE', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-cyan-400">
                AED {currentConsumption.totalValue.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-sm text-slate-400">{currentConsumption.itemCount} items</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Materials by Valuation */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">Top 30 Materials by Stock Valuation</h2>
          <p className="text-sm text-slate-400 mt-1">Items in stock right now, sorted by total value</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-700">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">#</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Material</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Qty</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Unit Cost</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : topMaterials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    No materials in stock
                  </td>
                </tr>
              ) : (
                topMaterials.map((mat, idx) => (
                  <tr key={mat._id} className="border-b border-slate-700/50 hover:bg-slate-900/50">
                    <td className="px-6 py-3 text-slate-400 text-xs font-mono">{idx + 1}</td>
                    <td className="px-6 py-3">
                      <div>
                        <p className="text-white font-medium">{mat.name}</p>
                        <p className="text-xs text-slate-500">{mat.unit}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">{mat.quantity.toFixed(3)}</td>
                    <td className="px-6 py-3 text-right text-slate-300">AED {mat.unitCost.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="font-semibold text-emerald-400">
                        AED {mat.totalValue.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Consumed Items */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">Top 30 Consumed Items (Previous Month)</h2>
          <p className="text-sm text-slate-400 mt-1">Items dispatched last month, sorted by consumption value</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-700">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">#</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Material</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Qty Consumed</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Unit Cost</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Consumption Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : topConsumed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    No consumption data available
                  </td>
                </tr>
              ) : (
                topConsumed.map((mat, idx) => (
                  <tr key={mat._id} className="border-b border-slate-700/50 hover:bg-slate-900/50">
                    <td className="px-6 py-3 text-slate-400 text-xs font-mono">{idx + 1}</td>
                    <td className="px-6 py-3">
                      <div>
                        <p className="text-white font-medium">{mat.name}</p>
                        <p className="text-xs text-slate-500">{mat.unit}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-300">{mat.quantity.toFixed(3)}</td>
                    <td className="px-6 py-3 text-right text-slate-300">AED {mat.unitCost.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="font-semibold text-orange-400">
                        AED {mat.totalValue.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
