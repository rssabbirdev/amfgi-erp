'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import type { Job } from '@/store/api/endpoints/jobs';

interface ConsumptionData {
  materialId: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  transactions: Array<{
    id: string;
    type: string;
    quantity: number;
    date: Date;
    cost: number;
  }>;
}

interface ConsumptionCostingModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  relatedJobs?: Array<{ id: string; jobNumber: string; description: string }>;
}

export default function ConsumptionCostingModal({
  isOpen,
  onClose,
  job,
  relatedJobs = [],
}: ConsumptionCostingModalProps) {
  const [costingMethod, setCostingMethod] = useState<'FIFO' | 'MOVING_AVERAGE' | 'CURRENT_PRICE'>('FIFO');
  const [selectedVariations, setSelectedVariations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [consumption, setConsumption] = useState<ConsumptionData[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [jobsIncluded, setJobsIncluded] = useState<string[]>([]);

  const isParentJob = job && !job.parentJobId;

  // Initialize selected variations to all if parent job
  useEffect(() => {
    if (isParentJob && relatedJobs.length > 0) {
      setSelectedVariations(relatedJobs.map((j) => j.id));
    }
  }, [isParentJob, relatedJobs]);

  const fetchData = async () => {
    if (!job) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        method: costingMethod,
      });

      if (isParentJob && selectedVariations.length > 0) {
        selectedVariations.forEach((id) => params.append('variationIds', id));
      }

      const res = await fetch(`/api/jobs/${job.id}/consumption-costing?${params}`);
      const data = await res.json();

      if (res.ok && data.data) {
        setConsumption(data.data.consumption || []);
        setTotalCost(data.data.totalCost || 0);
        setJobsIncluded(data.data.jobsIncluded || []);
      } else {
        toast.error(data.error ?? 'Failed to fetch consumption data');
      }
    } catch (err) {
      toast.error('Error loading consumption data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && job) {
      fetchData();
    }
  }, [isOpen, job, costingMethod, selectedVariations]);

  const toggleVariation = (variationId: string) => {
    setSelectedVariations((prev) =>
      prev.includes(variationId) ? prev.filter((id) => id !== variationId) : [...prev, variationId]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Consumption & Costing Analysis" size="xl">
      <div className="space-y-6">
        {/* Job Header */}
        {job && (
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-lg font-bold text-cyan-400 mb-2">{job.jobNumber}</h3>
            <p className="text-sm text-slate-300">{job.description}</p>
            {job.parentJobId && <p className="text-xs text-slate-400 mt-1">📌 Child Job</p>}
          </div>
        )}

        {/* Costing Method Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-3">Costing Method:</label>
          <div className="grid grid-cols-3 gap-2">
            {(['FIFO', 'MOVING_AVERAGE', 'CURRENT_PRICE'] as const).map((method) => (
              <button
                key={method}
                onClick={() => setCostingMethod(method)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  costingMethod === method
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {method === 'FIFO' && 'FIFO'}
                {method === 'MOVING_AVERAGE' && 'Moving Average'}
                {method === 'CURRENT_PRICE' && 'Current Price'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {costingMethod === 'FIFO' && 'First In First Out - uses batch order'}
            {costingMethod === 'MOVING_AVERAGE' && 'Weighted average cost across all batches'}
            {costingMethod === 'CURRENT_PRICE' && 'Current market value of materials'}
          </p>
        </div>

        {/* Variation Selection (for parent jobs) */}
        {isParentJob && relatedJobs.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Include Variations: ({selectedVariations.length}/{relatedJobs.length})
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto bg-slate-900/50 rounded-lg p-3 border border-slate-700">
              {relatedJobs.map((variation) => (
                <label key={variation.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVariations.includes(variation.id)}
                    onChange={() => toggleVariation(variation.id)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-300">
                    {variation.jobNumber}
                    {variation.description && <span className="text-xs text-slate-400 ml-1">({variation.description})</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        )}

        {/* Consumption Table */}
        {!loading && consumption.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Material Consumption</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-300">Material</th>
                    <th className="text-right py-2 px-3 text-slate-300">Quantity</th>
                    <th className="text-right py-2 px-3 text-slate-300">Cost</th>
                    <th className="text-right py-2 px-3 text-slate-300">Unit Cost (Avg)</th>
                  </tr>
                </thead>
                <tbody>
                  {consumption.map((mat) => (
                    <tr key={mat.materialId} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                      <td className="py-2 px-3 text-slate-300">
                        <p className="font-medium">{mat.materialName}</p>
                        <p className="text-xs text-slate-400">{mat.unit}</p>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {mat.totalQuantity.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-400">
                        AED {mat.totalCost.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">
                        AED {(mat.totalCost / Math.max(mat.totalQuantity, 1)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Total Costing */}
        {!loading && consumption.length > 0 && (
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold text-slate-300">Total Job Costing:</p>
              <p className="text-2xl font-bold text-emerald-400">AED {totalCost.toFixed(2)}</p>
            </div>
            {isParentJob && selectedVariations.length > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                Including {selectedVariations.length} variation{selectedVariations.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {/* No Data State */}
        {!loading && consumption.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-400">No consumption or costing data available for this job</p>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
