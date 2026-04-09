'use client';

import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { Job } from '@/store/api/endpoints/jobs';

interface JobVariationModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'variation';
  parentJobId?: string;
  jobs: any[];
  jobNumber: string;
  setJobNumber: (value: string) => void;
  variationSuffix: string;
  setVariationSuffix: (value: string) => void;
  customerId: string;
  setCustomerId: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  site: string;
  setSite: (value: string) => void;
  status: string;
  setStatus: (value: any) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  quotationNumber?: string;
  setQuotationNumber?: (value: string) => void;
  lpoNumber?: string;
  setLpoNumber?: (value: string) => void;
  projectName?: string;
  setProjectName?: (value: string) => void;
  projectDetails?: string;
  setProjectDetails?: (value: string) => void;
  jobWorkValue?: string;
  setJobWorkValue?: (value: string) => void;
  customers: Array<{ id: string; name: string }>;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  editing: any;
}

export default function JobVariationModal({
  isOpen,
  onClose,
  mode,
  parentJobId,
  jobs,
  jobNumber,
  setJobNumber,
  variationSuffix,
  setVariationSuffix,
  customerId,
  setCustomerId,
  description,
  setDescription,
  site,
  setSite,
  status,
  setStatus,
  startDate,
  setStartDate,
  quotationNumber = '',
  setQuotationNumber,
  lpoNumber = '',
  setLpoNumber,
  projectName = '',
  setProjectName,
  projectDetails = '',
  setProjectDetails,
  jobWorkValue = '',
  setJobWorkValue,
  customers,
  onSubmit,
  isLoading,
  editing,
}: JobVariationModalProps) {
  const parentJob = parentJobId ? jobs.find((j) => j.id === parentJobId) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        editing ? 'Edit Job' : mode === 'variation' ? 'Create Job Variation' : 'Create Job'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'variation' ? (
          <>
            {/* Variation Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Parent Job
              </label>
              <input
                disabled
                value={parentJob?.jobNumber ?? ''}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-400 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Variation Suffix *
              </label>
              <div className="flex items-center gap-2">
                <input
                  disabled
                  value={parentJob?.jobNumber ?? ''}
                  className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 text-sm cursor-not-allowed text-center"
                />
                <span className="text-slate-400 font-medium">-</span>
                <input
                  required
                  placeholder="e.g., A, v1, Phase1"
                  value={variationSuffix}
                  onChange={(e) => setVariationSuffix(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Full job number: {parentJob?.jobNumber}
                {variationSuffix ? `-${variationSuffix}` : ''}
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Create Job Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Job Number *
              </label>
              <input
                required
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Customer *
              </label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Common Fields */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Site</label>
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Quotation Number
            </label>
            <input
              value={quotationNumber ?? ''}
              onChange={(e) => setQuotationNumber?.(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              LPO Number
            </label>
            <input
              value={lpoNumber ?? ''}
              onChange={(e) => setLpoNumber?.(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Project Name
            </label>
            <input
              value={projectName ?? ''}
              onChange={(e) => setProjectName?.(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Job Work Value (AED)
            </label>
            <input
              type="number"
              step="0.01"
              value={jobWorkValue ?? ''}
              onChange={(e) => setJobWorkValue?.(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Project Details
          </label>
          <textarea
            value={projectDetails ?? ''}
            onChange={(e) => setProjectDetails?.(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading} fullWidth>
            {editing
              ? 'Update'
              : mode === 'variation'
              ? 'Create Variation'
              : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
