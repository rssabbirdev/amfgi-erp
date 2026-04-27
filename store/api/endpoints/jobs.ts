import { appApi } from '../appApi';

export interface Job {
  id: string;
  companyId: string;
  externalJobId?: string;
  source?: 'LOCAL' | 'EXTERNAL_API';
  jobNumber: string;
  customerId: string;
  customerName?: string;
  description?: string;
  site?: string;
  address?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  parentJobId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  quotationNumber?: string;
  quotationDate?: string | Date;
  lpoNumber?: string;
  lpoDate?: string | Date;
  lpoValue?: number;
  projectName?: string;
  projectDetails?: string;
  contactPerson?: string;
  contactsJson?: unknown[];
  salesPerson?: string;
  requiredExpertises?: string[];
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface FormulaLibrary {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  fabricationType: string;
  description?: string | null;
  specificationSchema?: unknown;
  formulaConfig: unknown;
  isActive: boolean;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface JobItem {
  id: string;
  companyId: string;
  jobId: string;
  formulaLibraryId: string;
  name: string;
  description?: string | null;
  specifications: unknown;
  assignedEmployeeIds?: string[];
  sortOrder: number;
  isActive: boolean;
  formulaLibrary?: FormulaLibrary;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface JobCostEngineMaterialLine {
  materialId: string;
  materialName: string;
  baseUnit: string;
  estimatedBaseQuantity: number;
  quotedUnitCost: number;
  quotedCost: number;
  actualIssuedBaseQuantity: number;
  actualIssuedCost: number;
  quantityVariance: number;
  costVariance: number;
  issueReconcileCompatible: boolean;
  pricingSource: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
}

export interface JobCostEngineLaborLine {
  expertiseName: string;
  requiredWorkers: number;
  estimatedDays: number;
  productivityPerWorkerPerDay: number;
  assignedEmployeeIds: string[];
  assignedEmployeeNames: string[];
  missingExpertises: string[];
}

export interface JobCostEngineItem {
  itemId: string;
  itemName: string;
  formulaLibraryId: string;
  formulaLibraryName: string;
  fabricationType: string;
  materials: JobCostEngineMaterialLine[];
  labor: JobCostEngineLaborLine[];
  totalQuotedMaterialCost: number;
  totalActualMaterialCost: number;
  estimatedCompletionDays: number;
  estimatedCompletionDate: string | null;
  warnings: string[];
}

export interface JobCostEngineResult {
  job: {
    id: string;
    jobNumber: string;
    variationOnly: boolean;
  };
  settings: {
    nonWorkingWeekdays: number[];
  };
  items: JobCostEngineItem[];
  summary: {
    totalQuotedMaterialCost: number;
    totalActualMaterialCost: number;
    totalEstimatedCompletionDays: number;
    comparisonMode: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
  };
  issueReconcileCompatible: boolean;
}

interface JobWithMaterials extends Job {
  materials?: Array<{
    materialId: string;
    materialName: string;
    unit: string;
    dispatched: number;
    returned: number;
    netConsumed: number;
    availableToReturn: number;
  }>;
}

export const jobsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getJobs: builder.query<Job[], void>({
      query: () => '/jobs',
      transformResponse: (r: { data: Job[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Job', id: 'LIST' }, ...result.map((j) => ({ type: 'Job' as const, id: j.id }))]
          : [{ type: 'Job', id: 'LIST' }],
    }),

    getJobById: builder.query<JobWithMaterials, string>({
      query: (id) => `/jobs/${id}`,
      transformResponse: (r: { data: JobWithMaterials }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Job', id }],
    }),

    getJobMaterials: builder.query<JobWithMaterials['materials'], string>({
      query: (jobId) => `/jobs/${jobId}/materials`,
      transformResponse: (r: { data: JobWithMaterials['materials'] }) => r.data,
      providesTags: (result, error, jobId) => [{ type: 'JobMaterials', id: jobId }],
    }),

    getJobItems: builder.query<{ job: Pick<Job, 'id' | 'jobNumber' | 'parentJobId'>; items: JobItem[] }, string>({
      query: (jobId) => `/jobs/${jobId}/items`,
      transformResponse: (r: { data: { job: Pick<Job, 'id' | 'jobNumber' | 'parentJobId'>; items: JobItem[] } }) => r.data,
      providesTags: (result, error, jobId) => [
        { type: 'Job', id: jobId },
        { type: 'Job', id: `${jobId}-ITEMS` },
      ],
    }),

    addJobItem: builder.mutation<JobItem, { jobId: string; data: Partial<JobItem> }>({
      query: ({ jobId, data }) => ({
        url: `/jobs/${jobId}/items`,
        method: 'POST',
        body: data,
      }),
      transformResponse: (r: { data: JobItem }) => r.data,
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: `${jobId}-ITEMS` }],
    }),

    updateJobItem: builder.mutation<JobItem, { jobId: string; itemId: string; data: Partial<JobItem> }>({
      query: ({ jobId, itemId, data }) => ({
        url: `/jobs/${jobId}/items/${itemId}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: JobItem }) => r.data,
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: `${jobId}-ITEMS` }],
    }),

    deleteJobItem: builder.mutation<{ deleted: boolean }, { jobId: string; itemId: string }>({
      query: ({ jobId, itemId }) => ({
        url: `/jobs/${jobId}/items/${itemId}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: `${jobId}-ITEMS` }],
    }),

    getFormulaLibraries: builder.query<FormulaLibrary[], void>({
      query: () => '/job-costing/formulas',
      transformResponse: (r: { data: FormulaLibrary[] }) => r.data,
      providesTags: [{ type: 'Job', id: 'FORMULA_LIBRARY' }],
    }),

    getFormulaLibraryById: builder.query<FormulaLibrary, string>({
      query: (id) => `/job-costing/formulas/${id}`,
      transformResponse: (r: { data: FormulaLibrary }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Job', id: `FORMULA-${id}` }],
    }),

    createFormulaLibrary: builder.mutation<FormulaLibrary, Partial<FormulaLibrary>>({
      query: (body) => ({
        url: '/job-costing/formulas',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: FormulaLibrary }) => r.data,
      invalidatesTags: [{ type: 'Job', id: 'FORMULA_LIBRARY' }],
    }),

    updateFormulaLibrary: builder.mutation<FormulaLibrary, { id: string; data: Partial<FormulaLibrary> }>({
      query: ({ id, data }) => ({
        url: `/job-costing/formulas/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: FormulaLibrary }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Job', id: 'FORMULA_LIBRARY' },
        { type: 'Job', id: `FORMULA-${id}` },
      ],
    }),

    deleteFormulaLibrary: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/job-costing/formulas/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: [{ type: 'Job', id: 'FORMULA_LIBRARY' }],
    }),

    calculateJobCostEngine: builder.mutation<
      JobCostEngineResult,
      {
        jobId: string;
        pricingMode?: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
        postingDate?: string;
        jobItemIds?: string[];
        customUnitCosts?: Record<string, number>;
      }
    >({
      query: ({ jobId, ...body }) => ({
        url: `/jobs/${jobId}/cost-engine`,
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: JobCostEngineResult }) => r.data,
    }),

    createJob: builder.mutation<Job, Partial<Job>>({
      query: (body) => ({
        url: '/jobs',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Job }) => r.data,
      invalidatesTags: [{ type: 'Job', id: 'LIST' }],
    }),

    updateJob: builder.mutation<Job, { id: string; data: Partial<Job> }>({
      query: ({ id, data }) => ({
        url: `/jobs/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Job }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Job', id },
        { type: 'Job', id: 'LIST' },
      ],
    }),

    deleteJob: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/jobs/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean }) => r,
      invalidatesTags: (result, error, id) => [
        { type: 'Job', id },
        { type: 'Job', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetJobsQuery,
  useGetJobByIdQuery,
  useGetJobMaterialsQuery,
  useGetJobItemsQuery,
  useAddJobItemMutation,
  useUpdateJobItemMutation,
  useDeleteJobItemMutation,
  useGetFormulaLibrariesQuery,
  useGetFormulaLibraryByIdQuery,
  useCreateFormulaLibraryMutation,
  useUpdateFormulaLibraryMutation,
  useDeleteFormulaLibraryMutation,
  useCalculateJobCostEngineMutation,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
} = jobsApi;
