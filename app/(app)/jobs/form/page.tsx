'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface Material {
  id: string;
  name: string;
  unit: string;
  [key: string]: any;
}
import {
  useGetJobsQuery,
  useGetCustomersQuery,
  useGetMaterialsQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
} from '@/store/hooks';

interface FinishedGood {
  materialId: string;
  materialName: string;
  quantity: string;
}

interface FormData {
  jobNumber: string;
  variationSuffix: string;
  customerId: string;
  description: string;
  site: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate: string;
  quotationNumber: string;
  lpoNumber: string;
  projectName: string;
  projectDetails: string;
  jobWorkValue: string;
}

export default function JobFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: materials = [] } = useGetMaterialsQuery();
  const [createJob, { isLoading: isCreating }] = useCreateJobMutation();
  const [updateJob, { isLoading: isUpdating }] = useUpdateJobMutation();
  const [finishedGoods, setFinishedGoods] = useState<FinishedGood[]>([]);
  const [materialSearches, setMaterialSearches] = useState<string[]>([]);
  const [openDropdowns, setOpenDropdowns] = useState<boolean[]>([]);
  const dropdownRefs = useRef<(HTMLDivElement | null)[]>([]);

  const mode = searchParams.get('mode') as 'create' | 'edit' | 'variation' || 'create';
  const jobId = searchParams.get('id');
  const parentJobId = searchParams.get('parentJobId');
  const customerId = searchParams.get('customerId');

  const currentJob = jobId ? jobs.find((j) => j.id === jobId) : null;
  const parentJob = parentJobId ? jobs.find((j) => j.id === parentJobId) : null;

  const [form, setForm] = useState<FormData>({
    jobNumber: '',
    variationSuffix: '',
    customerId: '',
    description: '',
    site: '',
    status: 'ACTIVE',
    startDate: '',
    quotationNumber: '',
    lpoNumber: '',
    projectName: '',
    projectDetails: '',
    jobWorkValue: '',
  });

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      dropdownRefs.current.forEach((ref, idx) => {
        if (ref && !ref.contains(e.target as Node)) {
          const newOpen = [...openDropdowns];
          newOpen[idx] = false;
          setOpenDropdowns(newOpen);
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdowns]);

  // Initialize form with existing job data when editing
  useEffect(() => {
    if (mode === 'edit' && currentJob) {
      setForm({
        jobNumber: currentJob.jobNumber,
        variationSuffix: '',
        customerId: currentJob.customerId,
        description: currentJob.description || '',
        site: currentJob.site || '',
        status: currentJob.status,
        startDate: currentJob.startDate ? new Date(currentJob.startDate).toISOString().split('T')[0] : '',
        quotationNumber: (currentJob as any).quotationNumber || '',
        lpoNumber: (currentJob as any).lpoNumber || '',
        projectName: (currentJob as any).projectName || '',
        projectDetails: (currentJob as any).projectDetails || '',
        jobWorkValue: (currentJob as any).jobWorkValue || '',
      });
      if ((currentJob as any).finishedGoods && Array.isArray((currentJob as any).finishedGoods)) {
        setFinishedGoods((currentJob as any).finishedGoods);
      }
    } else if (mode === 'variation' && parentJob) {
      setForm((prev) => ({
        ...prev,
        customerId: parentJob.customerId,
      }));
    } else if (customerId) {
      setForm((prev) => ({
        ...prev,
        customerId,
      }));
    }
  }, [mode, currentJob, parentJob, customerId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (mode === 'edit' && currentJob) {
        const data = {
          customerId: form.customerId,
          description: form.description || undefined,
          site: form.site || undefined,
          status: form.status,
          startDate: form.startDate || undefined,
          quotationNumber: form.quotationNumber || undefined,
          lpoNumber: form.lpoNumber || undefined,
          projectName: form.projectName || undefined,
          projectDetails: form.projectDetails || undefined,
          jobWorkValue: form.jobWorkValue ? parseFloat(form.jobWorkValue) : undefined,
          finishedGoods: finishedGoods.length > 0 ? finishedGoods.map(fg => ({
            materialId: fg.materialId,
            materialName: fg.materialName,
            quantity: parseFloat(fg.quantity) || 0,
          })) : undefined,
        };
        await updateJob({ id: currentJob.id, data }).unwrap();
        toast.success('Job updated');
      } else {
        let finalJobNumber = form.jobNumber;

        // If in variation mode, concatenate parent job number with suffix
        if (mode === 'variation' && parentJob && form.variationSuffix) {
          finalJobNumber = `${parentJob.jobNumber}-${form.variationSuffix}`;
        }

        // Auto-set today's date if not provided (format: YYYY-MM-DD)
        const todayDate = new Date().toISOString().split('T')[0];

        const jobData: any = {
          jobNumber: finalJobNumber,
          customerId: form.customerId,
          description: form.description || undefined,
          site: form.site || undefined,
          status: form.status,
          startDate: form.startDate || todayDate, // Send as string YYYY-MM-DD
          quotationNumber: form.quotationNumber || undefined,
          lpoNumber: form.lpoNumber || undefined,
          projectName: form.projectName || undefined,
          projectDetails: form.projectDetails || undefined,
          jobWorkValue: form.jobWorkValue ? parseFloat(form.jobWorkValue) : undefined,
          finishedGoods: finishedGoods.length > 0 ? finishedGoods.map(fg => ({
            materialId: fg.materialId,
            materialName: fg.materialName,
            quantity: parseFloat(fg.quantity) || 0,
          })) : undefined,
        };

        if (parentJobId) {
          jobData.parentJobId = parentJobId;
        }

        await createJob(jobData).unwrap();
        toast.success(mode === 'variation' ? 'Job variation created' : 'Job created');
      }

      router.back();
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to save job');
    }
  };

  const pageTitle =
    mode === 'edit' ? 'Edit Job' : mode === 'variation' ? 'Create Job Variation' : 'Create Job';

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');
  const canEdit = isSA || perms.includes('job.edit');

  if ((mode === 'edit' && !canEdit) || (mode !== 'edit' && !canCreate)) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <div className="text-center py-12">
          <p className="text-red-400">You don't have permission to perform this action</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{pageTitle}</h1>
          {parentJob && <p className="text-slate-400 text-xs">Parent: {parentJob.jobNumber}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()} size="sm">
            Cancel
          </Button>
          <Button
            type="submit"
            form="job-form"
            loading={isCreating || isUpdating}
            size="sm"
          >
            {mode === 'edit'
              ? 'Update Job'
              : mode === 'variation'
              ? 'Create Variation'
              : 'Create Job'}
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <form id="job-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Mode-Specific Fields */}
          {mode === 'variation' ? (
            <>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Variation Information</h2>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Parent Job
                  </label>
                  <input
                    disabled
                    value={parentJob?.jobNumber ?? ''}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Variation Suffix *
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      disabled
                      value={parentJob?.jobNumber ?? ''}
                      className="w-32 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed text-center"
                    />
                    <span className="text-slate-400 font-bold text-lg">-</span>
                    <input
                      required
                      type="text"
                      name="variationSuffix"
                      placeholder="e.g., A, v1, Phase1"
                      value={form.variationSuffix}
                      onChange={handleChange}
                      className="flex-1 px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Full job number: {parentJob?.jobNumber}
                    {form.variationSuffix ? `-${form.variationSuffix}` : ''}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Basic Information</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Job Number *
                    </label>
                    <input
                      required
                      type="text"
                      name="jobNumber"
                      value={form.jobNumber}
                      onChange={handleChange}
                      disabled={mode === 'edit'}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Customer *
                    </label>
                    <select
                      required
                      name="customerId"
                      value={form.customerId}
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    >
                      <option value="">Select Customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Common Fields */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Job Details</h2>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Site</label>
              <input
                type="text"
                name="site"
                value={form.site}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  name="startDate"
                  value={form.startDate}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Project & Quotation Information */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Project & Quotation</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Quotation Number
                </label>
                <input
                  type="text"
                  name="quotationNumber"
                  value={form.quotationNumber}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  LPO Number
                </label>
                <input
                  type="text"
                  name="lpoNumber"
                  value={form.lpoNumber}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  name="projectName"
                  value={form.projectName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Job Work Value (AED)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="jobWorkValue"
                  value={form.jobWorkValue}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Project Details
              </label>
              <textarea
                name="projectDetails"
                value={form.projectDetails}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Finished Goods */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Finished Goods</h2>
              <Button
                type="button"
                onClick={() => {
                  setFinishedGoods([...finishedGoods, { materialId: '', materialName: '', quantity: '' }]);
                  const newSearches = [...materialSearches];
                  newSearches[finishedGoods.length] = '';
                  setMaterialSearches(newSearches);
                  const newOpen = [...openDropdowns];
                  newOpen[finishedGoods.length] = false;
                  setOpenDropdowns(newOpen);
                }}
                size="sm"
              >
                + Add Material
              </Button>
            </div>

            {finishedGoods.length === 0 ? (
              <p className="text-sm text-slate-400">No finished goods added</p>
            ) : (
              <div className="space-y-3">
                {finishedGoods.map((item, idx) => {
                  const selectedMaterial = materials.find(m => m.id === item.materialId);
                  const search = materialSearches[idx] || '';
                  const filteredMaterials = materials.filter(m =>
                    m.name.toLowerCase().includes(search.toLowerCase())
                  );

                  return (
                    <div key={idx} className="flex gap-3 items-end">
                      <div className="flex-1 relative" ref={(el) => { if (el) dropdownRefs.current[idx] = el; }}>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Material</label>
                        <input
                          type="text"
                          value={openDropdowns[idx] ? (search) : (selectedMaterial ? `${selectedMaterial.name} (${selectedMaterial.unit})` : '')}
                          onChange={(e) => {
                            const newSearches = [...materialSearches];
                            newSearches[idx] = e.target.value;
                            setMaterialSearches(newSearches);
                            const newOpen = [...openDropdowns];
                            newOpen[idx] = true;
                            setOpenDropdowns(newOpen);
                          }}
                          onFocus={() => {
                            const newOpen = [...openDropdowns];
                            newOpen[idx] = true;
                            setOpenDropdowns(newOpen);
                          }}
                          placeholder="Search material..."
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />

                        {openDropdowns[idx] && filteredMaterials.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                            {filteredMaterials.map((mat) => (
                              <button
                                key={mat.id}
                                type="button"
                                onClick={() => {
                                  const newGoods = [...finishedGoods];
                                  newGoods[idx] = {
                                    materialId: mat.id,
                                    materialName: mat.name,
                                    quantity: item.quantity,
                                  };
                                  setFinishedGoods(newGoods);
                                  const newOpen = [...openDropdowns];
                                  newOpen[idx] = false;
                                  setOpenDropdowns(newOpen);
                                  const newSearches = [...materialSearches];
                                  newSearches[idx] = '';
                                  setMaterialSearches(newSearches);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-800 text-white text-sm flex items-center justify-between"
                              >
                                <span>{mat.name}</span>
                                <span className="text-slate-400 text-xs">{mat.unit}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="w-24">
                        <label className="block text-xs font-medium text-slate-300 mb-1">Qty / {selectedMaterial?.unit || 'Unit'}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => {
                            const newGoods = [...finishedGoods];
                            newGoods[idx].quantity = e.target.value;
                            setFinishedGoods(newGoods);
                          }}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setFinishedGoods(finishedGoods.filter((_, i) => i !== idx))}
                        className="px-3 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}
