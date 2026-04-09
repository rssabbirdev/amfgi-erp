'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import { useGetJobsQuery } from '@/store/hooks';
import type { Job } from '@/store/api/endpoints/jobs';

interface MaterialConsumption {
  materialId: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
}

interface CostingData {
  job: {
    id: string;
    jobNumber: string;
    description: string;
    status: string;
    isParent: boolean;
    parentJobId: string | null;
    customer: string;
  };
  consumption: MaterialConsumption[];
  totalCost: number;
  costingMethod: string;
  relatedJobs: Array<{ id: string; jobNumber: string; description: string }>;
  jobsIncluded: string[];
}

export default function ConsumptionCostingPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: jobs = [] } = useGetJobsQuery();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [costingMethod, setCostingMethod] = useState<'FIFO' | 'MOVING_AVERAGE' | 'CURRENT_PRICE'>('FIFO');
  const [selectedVariations, setSelectedVariations] = useState<string[]>([]);
  const [data, setData] = useState<CostingData | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentJob = jobs.find((j) => j.id === jobId);
  const isParentJob = currentJob && !currentJob.parentJobId;

  const variations = useMemo(() => {
    return currentJob && !currentJob.parentJobId ? jobs.filter((j) => j.parentJobId === currentJob.id) : [];
  }, [currentJob, jobs]);

  // Initialize selected variations
  useEffect(() => {
    if (isParentJob && variations.length > 0) {
      setSelectedVariations(variations.map((j) => j.id));
    }
  }, [isParentJob, variations]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  // Fetch consumption & costing data
  const fetchData = async () => {
    if (!jobId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        method: costingMethod,
      });

      if (isParentJob && selectedVariations.length > 0) {
        selectedVariations.forEach((id) => params.append('variationIds', id));
      }

      const res = await fetch(`/api/jobs/${jobId}/consumption-costing?${params}`);
      const response = await res.json();

      if (res.ok && response.data) {
        setData(response.data);
      } else {
        const errorMsg = ((response as Record<string, unknown>)?.error as string) ?? 'Failed to fetch consumption data';
        toast.error(errorMsg);
      }
    } catch (err) {
      toast.error('Error loading consumption data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      fetchData();
    }
  }, [jobId, costingMethod, selectedVariations]);

  const toggleVariation = (variationId: string) => {
    setSelectedVariations((prev) =>
      prev.includes(variationId)
        ? prev.filter((id) => id !== variationId)
        : [...prev, variationId]
    );
  };

  const handleExportExcel = () => {
    if (!data) return;

    // Create workbook manually using HTML table to Excel conversion
    const html = `
      <table border="1" cellpadding="10">
        <tr>
          <td colspan="5" style="font-weight: bold; font-size: 16px;">Consumption & Costing Report</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Job Number:</td>
          <td>${data.job.jobNumber}</td>
          <td style="font-weight: bold;">Customer:</td>
          <td colspan="2">${data.job.customer}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Description:</td>
          <td colspan="2">${data.job.description}</td>
          <td style="font-weight: bold;">Method:</td>
          <td>${costingMethod === 'FIFO' ? 'FIFO' : costingMethod === 'MOVING_AVERAGE' ? 'Moving Average' : 'Current Price'}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Generated:</td>
          <td colspan="4">${new Date().toLocaleString()}</td>
        </tr>
        <tr style="background-color: #f0f0f0;">
          <td style="font-weight: bold;">Material</td>
          <td style="font-weight: bold;">Quantity</td>
          <td style="font-weight: bold;">Unit</td>
          <td style="font-weight: bold;">Avg Unit Cost</td>
          <td style="font-weight: bold;">Total Cost</td>
        </tr>
        ${data.consumption
          .map(
            (m) => `
          <tr>
            <td>${m.materialName}</td>
            <td>${m.totalQuantity.toFixed(3)}</td>
            <td>${m.unit}</td>
            <td>AED ${(m.totalCost / Math.max(m.totalQuantity, 1)).toFixed(2)}</td>
            <td>AED ${m.totalCost.toFixed(2)}</td>
          </tr>
        `
          )
          .join('')}
        <tr style="background-color: #e8f5e9; font-weight: bold;">
          <td colspan="4">Total Job Costing</td>
          <td>AED ${data.totalCost.toFixed(2)}</td>
        </tr>
      </table>
    `;

    const element = document.createElement('a');
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    element.href = URL.createObjectURL(blob);
    element.download = `consumption-costing-${data.job.jobNumber}-${Date.now()}.xls`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    toast.success('Report exported to Excel');
  };

  const handlePrint = () => {
    const printContent = document.getElementById('print-content');
    if (!printContent) return;

    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) {
      toast.error('Please enable popups to print');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Consumption & Costing Report - ${data?.job.jobNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: white;
              color: #333;
            }
            .container {
              max-width: 900px;
              margin: 0 auto;
            }
            h1 {
              text-align: center;
              margin-bottom: 20px;
              font-size: 20px;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .header-info {
              margin-bottom: 20px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
            }
            .info-item {
              display: flex;
              justify-content: space-between;
            }
            .info-label {
              font-weight: bold;
              width: 150px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              background-color: #f5f5f5;
              padding: 12px;
              text-align: left;
              font-weight: bold;
              border-bottom: 2px solid #333;
            }
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #ddd;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .total-row {
              background-color: #e8f5e9;
              font-weight: bold;
              border-top: 2px solid #333;
            }
            .text-right {
              text-align: right;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${printContent.innerHTML}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!currentJob) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <div className="text-center py-12">
          <p className="text-slate-400">Job not found</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-slate-400 hover:text-white font-medium"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{currentJob.jobNumber}</h1>
              <p className="text-slate-400 text-sm">{currentJob.description}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handlePrint}>
              🖨️ Print
            </Button>
            <Button onClick={handleExportExcel}>
              📊 Export Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Controls Bar */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
          <div className="flex items-end gap-6">
            {/* Costing Method */}
            <div className="flex-1">
              <label className="block text-sm font-semibold text-white mb-3">
                Costing Method
              </label>
              <div className="flex gap-2">
                {(['FIFO', 'MOVING_AVERAGE', 'CURRENT_PRICE'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setCostingMethod(method)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
            </div>

            {/* Variations (Parent Job Only) */}
            {isParentJob && variations.length > 0 && (
              <div className="flex-1 relative" ref={dropdownRef}>
                <label className="block text-sm font-semibold text-white mb-3">
                  Variations
                </label>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white hover:border-slate-500 transition-colors flex items-center justify-between"
                >
                  <span>
                    {selectedVariations.length === 0
                      ? 'Select variations...'
                      : `${selectedVariations.length} selected`}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>

                {/* Dropdown Popover */}
                {dropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-600 rounded-lg shadow-lg z-50">
                    {/* Quick Actions */}
                    <div className="border-b border-slate-700 p-3 flex gap-2">
                      <button
                        onClick={() => setSelectedVariations(variations.map((v) => v.id))}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors font-medium"
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSelectedVariations([])}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors font-medium"
                      >
                        None
                      </button>
                    </div>

                    {/* Variation List */}
                    <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                      {variations.length === 0 ? (
                        <div className="p-3 text-center text-sm text-slate-400">
                          No variations available
                        </div>
                      ) : (
                        variations.map((variation) => (
                          <label
                            key={variation.id}
                            className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded hover:bg-slate-800 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedVariations.includes(variation.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedVariations([...selectedVariations, variation.id]);
                                } else {
                                  setSelectedVariations(
                                    selectedVariations.filter((id) => id !== variation.id)
                                  );
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-600 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-200 font-medium truncate">
                                {variation.jobNumber}
                              </p>
                              {variation.description && (
                                <p className="text-xs text-slate-400 truncate">
                                  {variation.description}
                                </p>
                              )}
                            </div>
                          </label>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-slate-700 p-3 text-xs text-slate-400 text-center">
                      {selectedVariations.length}/{variations.length} selected
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        )}

        {/* Report Content (for printing) */}
        {!loading && data && (
          <div id="print-content" className="bg-slate-800 rounded-lg border border-slate-700">
            {/* Report Header */}
            <div className="border-b border-slate-700 p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Consumption & Costing Report</h2>

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Job Number</p>
                  <p className="text-lg font-semibold text-white">{data.job.jobNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Customer</p>
                  <p className="text-lg font-semibold text-white">{data.job.customer}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Description</p>
                  <p className="text-base text-slate-300">{data.job.description}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Costing Method</p>
                  <p className="text-base font-medium text-emerald-400">
                    {costingMethod === 'FIFO' && 'FIFO (First In First Out)'}
                    {costingMethod === 'MOVING_AVERAGE' && 'Moving Average'}
                    {costingMethod === 'CURRENT_PRICE' && 'Current Price'}
                  </p>
                </div>
              </div>
            </div>

            {/* Table */}
            {data.consumption.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700 border-b border-slate-700">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">
                        Material
                      </th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-white">
                        Quantity
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-white">
                        Unit
                      </th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-white">
                        Avg Unit Cost
                      </th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-white">
                        Total Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consumption.map((mat, idx) => {
                      const avgUnitCost = mat.totalCost / Math.max(mat.totalQuantity, 1);
                      return (
                        <tr
                          key={mat.materialId}
                          className={`border-b border-slate-700 ${idx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-700/50'}`}
                        >
                          <td className="px-6 py-4 text-sm text-white">{mat.materialName}</td>
                          <td className="px-6 py-4 text-sm text-right text-slate-300">
                            {mat.totalQuantity.toFixed(3)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-300">{mat.unit}</td>
                          <td className="px-6 py-4 text-sm text-right text-slate-300">
                            AED {avgUnitCost.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-semibold text-emerald-400">
                            AED {mat.totalCost.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">No consumption data available</p>
              </div>
            )}

            {/* Total Summary */}
            {data.consumption.length > 0 && (
              <div className="bg-emerald-600/20 border-t-2 border-emerald-500/50 px-6 py-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Total Job Costing</p>
                    <p className="text-3xl font-bold text-emerald-400">AED {data.totalCost.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Materials Consumed</p>
                    <p className="text-2xl font-bold text-white">{data.consumption.length}</p>
                  </div>
                </div>
                {isParentJob && selectedVariations.length > 0 && (
                  <p className="text-xs text-slate-400 mt-4">
                    Report includes {selectedVariations.length} variation{selectedVariations.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-8 py-4 text-center text-xs text-slate-500 border-t border-slate-700">
              Generated on {new Date().toLocaleString()}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !data && (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-slate-400">No consumption or costing data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
