import { JOB_CACHE_INVALIDATES } from '@/lib/jobs/jobCacheInvalidation';
import { notifyJobLiveUpdate } from '@/lib/jobs/jobLiveUpdate';
import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

export const JOB_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

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
  jobWorkValue?: number;
  requiredExpertises?: string[];
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  /** Single execution progress & schedule for the whole job (cost engine / UI). */
  executionProgressStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  executionProgressPercent?: number;
  executionPlannedStartDate?: string | Date | null;
  executionPlannedEndDate?: string | Date | null;
  executionActualStartDate?: string | Date | null;
  executionActualEndDate?: string | Date | null;
  executionProgressNote?: string | null;
  executionProgressUpdatedAt?: string | Date | null;
  budgetSummary?: {
    budgetItemCount: number;
    trackableItemCount: number;
    stockLinkedTrackableCount: number;
    averageBudgetLineProgressPercent: number | null;
    currentSnapshot: {
      id: string;
      versionNumber: number;
      status: 'SAVED' | 'APPROVED' | 'SUPERSEDED';
      pricingMode: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM' | string;
      postingDate: string;
      totalQuotedMaterialCost: number;
      totalActualMaterialCost: number;
      totalEstimatedCompletionDays: number;
      createdAt: string;
    } | null;
  };
}

export type JobStatusFilter = 'ALL' | Job['status'];

export type JobScopeFilter = 'ALL' | 'PARENT_ONLY' | 'VARIATION_ONLY';

export type JobsListParams = {
  limit: number;
  offset: number;
  search?: string;
  status?: JobStatusFilter;
  scope?: JobScopeFilter;
};

export type JobsListResponse = {
  items: Job[];
  total: number;
  /** Active jobs matching search & scope (ignores status filter). */
  activeTotal: number;
};

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

export interface FormulaLibraryVersion {
  id: string;
  companyId: string;
  formulaLibraryId: string;
  versionNumber: number;
  name: string;
  slug: string;
  fabricationType: string;
  description?: string | null;
  specificationSchema?: unknown;
  formulaConfig: unknown;
  changeNote?: string | null;
  createdBy: string;
  createdAt?: string | Date;
}

export interface JobItem {
  id: string;
  companyId: string;
  jobId: string;
  formulaLibraryId: string | null;
  name: string;
  description?: string | null;
  specifications: unknown;
  assignedEmployeeIds?: string[];
  sortOrder: number;
  isActive: boolean;
  progressStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  progressPercent?: number;
  trackingItems?: Array<{
    id: string;
    label: string;
    unit?: string | null;
    targetValue: number;
    sourceKey?: string | null;
    finishedGoodMaterialId?: string | null;
    finishedGoodMaterialName?: string | null;
    finishedGoodMaterialUnit?: string | null;
    finishedGoodMaterialStockType?: string | null;
    finishedGoodWarehouseId?: string | null;
    finishedGoodWarehouseName?: string | null;
  }>;
  trackingEnabled?: boolean;
  trackingLabel?: string | null;
  trackingUnit?: string | null;
  trackingTargetValue?: number | null;
  trackingSourceKey?: string | null;
  plannedStartDate?: string | Date | null;
  plannedEndDate?: string | Date | null;
  actualStartDate?: string | Date | null;
  actualEndDate?: string | Date | null;
  progressNote?: string | null;
  progressUpdatedAt?: string | Date | null;
  formulaLibrary?: FormulaLibrary;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface JobItemProgressEntry {
  id: string;
  companyId: string;
  jobItemId: string;
  trackerId?: string | null;
  entryDate: string | Date;
  quantity: number;
  note?: string | null;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** Single tracker definition embedded on a JobItem.trackingItems blob. */
export interface DailyQuantityLogTracker {
  id: string;
  label: string;
  unit?: string | null;
  targetValue: number;
  sourceKey?: string | null;
  finishedGoodMaterialId?: string | null;
  finishedGoodMaterialName?: string | null;
  finishedGoodMaterialUnit?: string | null;
  finishedGoodMaterialStockType?: string | null;
  finishedGoodWarehouseId?: string | null;
  finishedGoodWarehouseName?: string | null;
}

/** One existing entry already posted on the requested date for a job item. */
export interface DailyQuantityLogExistingEntry {
  id: string;
  trackerId: string | null;
  quantity: number;
  note: string | null;
  entryDate: string;
  createdBy: string;
  createdAt: string | Date;
}

export interface DailyQuantityLogItem {
  id: string;
  name: string;
  description: string | null;
  trackingItems: DailyQuantityLogTracker[];
  existingEntries: DailyQuantityLogExistingEntry[];
  /** Cumulative qty logged across ALL dates, keyed by trackerId. */
  cumulativeByTracker: Record<string, number>;
}

export interface DailyQuantityLogJob {
  id: string;
  jobNumber: string;
  parentJobId: string | null;
  site: string | null;
  description: string | null;
  customerName: string | null;
  jobNumberSnapshot: string | null;
  siteNameSnapshot: string | null;
  clientNameSnapshot: string | null;
  projectDetailsSnapshot: string | null;
  /** Where the budget lines actually live (parent contract). */
  budgetJobId: string;
}

export interface DailyQuantityLogTeam {
  assignmentId: string;
  columnIndex: number;
  label: string;
  isAdhoc: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  remarks: string | null;
  teamLeader: { id: string; fullName: string } | null;
  members: Array<{ id: string; fullName: string; employeeCode: string }>;
  job: { id: string; jobNumber: string; isVariation: boolean } | null;
}

export interface DailyQuantityLogAssignment {
  /** Synthetic group id (`group-{budgetJobId}`) when multiple teams share one contract. */
  assignmentId: string;
  columnIndex: number;
  /** Combined team label across all underlying teams. */
  label: string;
  /** True only when every team in the group was added ad-hoc. */
  isAdhoc: boolean;
  /** All teams (parent + variations) sharing this contract on this date. */
  teams: DailyQuantityLogTeam[];
  job: DailyQuantityLogJob | null;
  items: DailyQuantityLogItem[];
}

export interface DailyQuantityLogEligibleJob {
  id: string;
  jobNumber: string;
  parentJobId: string | null;
  customerName: string | null;
  site: string | null;
  projectName: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
}

export interface DailyQuantityLogResponse {
  workDate: string;
  schedule: {
    id: string;
    workDate: string | Date;
    status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
    clientDisplayName: string | null;
    publishedAt: string | Date | null;
    lockedAt: string | Date | null;
  } | null;
  /** Present after the day is finalized — only edits allowed, no new entries. */
  submission: {
    submittedAt: string | Date;
    submittedById: string;
  } | null;
  assignments: DailyQuantityLogAssignment[];
  /** Jobs eligible for ad-hoc add: have at least one tracking-enabled budget item (via parent for variations). */
  eligibleJobs: DailyQuantityLogEligibleJob[];
}

export interface DailyQuantityLogPendingRow {
  scheduleId: string;
  workDate: string;
  status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
  clientDisplayName: string | null;
  assignmentCount: number;
}

export interface DailyQuantityLogPendingResponse {
  pending: DailyQuantityLogPendingRow[];
  recentFinalized: Array<{ workDate: string; submittedAt: string | Date }>;
}

export type DailyQuantityLogListRow = {
  workDate: string;
  status: 'PENDING' | 'FINALIZED';
  scheduleId: string | null;
  clientDisplayName: string | null;
  assignmentCount: number | null;
  submittedAt: string | null;
};

export type DailyQuantityLogPendingListParams = {
  limit: number;
  offset: number;
  status?: 'ALL' | 'PENDING' | 'FINALIZED';
};

export type DailyQuantityLogPendingListResponse = {
  items: DailyQuantityLogListRow[];
  total: number;
  counts: {
    pending: number;
    finalized: number;
    total: number;
  };
  finalizedDates: string[];
};

/** Flat list across all budget lines on a job (GET /jobs/:id/progress-entries). */
export interface JobProgressEntryListRow {
  id: string;
  companyId: string;
  jobItemId: string;
  jobItemName: string;
  trackerId?: string | null;
  trackerLabel: string;
  trackerUnit: string | null;
  entryDate: string | Date;
  quantity: number;
  note?: string | null;
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface JobCostEngineMaterialLine {
  materialId: string;
  materialName: string;
  baseUnit: string;
  estimatedBaseQuantity: number;
  expectedIssuedBaseQuantity: number;
  quotedUnitCost: number;
  quotedCost: number;
  expectedIssuedCost: number;
  actualIssuedBaseQuantity: number;
  actualIssuedCost: number;
  quantityVariance: number;
  costVariance: number;
  issuePaceVariance: number;
  issuePaceStatus: 'NOT_DUE' | 'ON_PLAN' | 'UNDER_ISSUED' | 'OVER_ISSUED';
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
  progress: {
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
    scheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD';
    percentComplete: number;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    actualStartDate: string | null;
    actualEndDate: string | null;
    forecastCompletionDate: string | null;
    varianceDays: number;
    note: string | null;
    remainingQuotedMaterialCost: number;
    remainingEstimatedDays: number;
    completedQuotedMaterialCost: number;
    tracking: {
      enabled: boolean;
      items: Array<{
        id: string;
        label: string;
        unit: string | null;
        targetValue: number;
        sourceKey: string | null;
        completedValue: number;
        remainingValue: number;
        percentComplete: number;
        averagePerDay: number;
        projectedRemainingDays: number | null;
        entryCount: number;
        trackedDayCount: number;
        firstEntryDate: string | null;
        lastEntryDate: string | null;
      }>;
      totalTargetValue: number;
      totalCompletedValue: number;
      totalRemainingValue: number;
      overallAveragePerDay: number;
      overallProjectedRemainingDays: number | null;
      entryCount: number;
      trackedDayCount: number;
      firstEntryDate: string | null;
      lastEntryDate: string | null;
      paceDenominator?: 'attendance_work_days' | 'progress_entry_days';
      awaitingAttendanceForPace?: boolean;
      attendance: {
        workedDayCount: number;
        totalWorkedMinutes: number;
        totalWorkedHours: number;
        uniqueWorkerCount: number;
        averageWorkersPerDay: number;
        lastAttendanceDate: string | null;
      };
    };
  };
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
    jobWideAttendance?: {
      workedDayCount: number;
      totalWorkedMinutes: number;
      totalWorkedHours: number;
      uniqueWorkerCount: number;
      averageWorkersPerDay: number;
      lastAttendanceDate: string | null;
    };
  };
  issueReconcileCompatible: boolean;
  pricingSnapshots: Array<{
    materialId: string;
    materialName: string;
    baseUnit: string;
    baseUnitCost: number;
    source: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
  }>;
}

export interface JobCostingSnapshotMeta {
  id: string;
  versionNumber: number;
  status: 'SAVED' | 'APPROVED' | 'SUPERSEDED';
  pricingMode: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
  postingDate: string;
  totalQuotedMaterialCost: number;
  totalActualMaterialCost: number;
  totalEstimatedCompletionDays: number;
  createdAt: string;
  createdBy: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  note?: string | null;
}

export interface JobCostingSnapshotDetail {
  snapshot: JobCostingSnapshotMeta & {
    pricingSnapshots: JobCostEngineResult['pricingSnapshots'];
    customUnitCosts?: Record<string, number> | null;
    jobItemIds?: string[] | null;
  };
  result: JobCostEngineResult;
}

export interface DispatchBudgetWarningRow {
  materialId: string;
  materialName: string;
  baseUnit: string;
  estimatedBaseQuantity: number;
  currentIssuedBaseQuantity: number;
  pendingBaseQuantity: number;
  projectedIssuedBaseQuantity: number;
  quantityOverrun: number;
  quotedUnitCost: number;
  estimatedQuotedCost: number;
  currentIssuedCost: number;
  projectedIssuedCost: number;
  costOverrun: number;
  kind: 'quantity_overrun' | 'cost_overrun' | 'unbudgeted_material';
}

export interface DispatchBudgetWarningResult {
  applicable: boolean;
  reason: 'parent_job' | 'no_budget_items' | null;
  warningCount: number;
  rows: DispatchBudgetWarningRow[];
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

    getJobsPage: builder.query<JobsListResponse, JobsListParams>({
      query: ({ limit, offset, search, status, scope }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        if (status && status !== 'ALL') params.set('status', status);
        if (scope && scope !== 'ALL') params.set('scope', scope);
        return `/jobs?${params.toString()}`;
      },
      transformResponse: (r: { data: JobsListResponse }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'Job', id: 'LIST' },
              ...result.items.map((j) => ({ type: 'Job' as const, id: j.id })),
            ]
          : [{ type: 'Job', id: 'LIST' }],
    }),

    getJobsForExport: builder.query<Job[], void>({
      query: () => '/jobs',
      transformResponse: (r: { data: Job[] }) => r.data,
      providesTags: [{ type: 'Job', id: 'LIST' }],
    }),

    getJobById: builder.query<JobWithMaterials, string>({
      query: (id) => `/jobs/${id}`,
      transformResponse: (r: { data: JobWithMaterials }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Job', id }],
    }),

    getJobMaterials: builder.query<
      JobWithMaterials['materials'],
      string | { jobId: string; jobIds?: string[] }
    >({
      query: (arg) => {
        const jobId = typeof arg === 'string' ? arg : arg.jobId;
        const jobIds = typeof arg === 'string' ? undefined : arg.jobIds;
        if (jobIds && jobIds.length > 0) {
          const params = new URLSearchParams();
          jobIds.forEach((id) => params.append('jobIds', id));
          return `/jobs/${jobId}/materials?${params.toString()}`;
        }
        return `/jobs/${jobId}/materials`;
      },
      transformResponse: (r: { data: JobWithMaterials['materials'] }) => r.data,
      providesTags: (result, error, arg) => {
        const jobId = typeof arg === 'string' ? arg : arg.jobId;
        return [{ type: 'JobMaterials', id: jobId }];
      },
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
      invalidatesTags: (result, error, { jobId }) => [
        { type: 'Job', id: `${jobId}-ITEMS` },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
      ],
    }),

    updateJobItem: builder.mutation<JobItem, { jobId: string; itemId: string; data: Partial<JobItem> }>({
      query: ({ jobId, itemId, data }) => ({
        url: `/jobs/${jobId}/items/${itemId}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: JobItem }) => r.data,
      invalidatesTags: (result, error, { jobId }) => [
        { type: 'Job', id: `${jobId}-ITEMS` },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
      ],
    }),

    deleteJobItem: builder.mutation<{ deleted: boolean }, { jobId: string; itemId: string }>({
      query: ({ jobId, itemId }) => ({
        url: `/jobs/${jobId}/items/${itemId}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: (result, error, { jobId }) => [
        { type: 'Job', id: `${jobId}-ITEMS` },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
      ],
    }),

    getJobItemProgressEntries: builder.query<JobItemProgressEntry[], { jobId: string; itemId: string }>({
      query: ({ jobId, itemId }) => `/jobs/${jobId}/items/${itemId}/progress-entries`,
      transformResponse: (r: { data: JobItemProgressEntry[] }) => r.data,
      providesTags: (result, error, { itemId }) => [{ type: 'Job', id: `JOB-ITEM-PROGRESS-${itemId}` }],
    }),

    getJobProgressEntriesForJob: builder.query<JobProgressEntryListRow[], string>({
      query: (jobId) => `/jobs/${jobId}/progress-entries`,
      transformResponse: (r: { data: JobProgressEntryListRow[] }) => r.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: `${jobId}-PROGRESS-ENTRIES-ALL` }],
    }),

    addJobItemProgressEntry: builder.mutation<
      JobItemProgressEntry,
      { jobId: string; itemId: string; data: Partial<JobItemProgressEntry> }
    >({
      query: ({ jobId, itemId, data }) => ({
        url: `/jobs/${jobId}/items/${itemId}/progress-entries`,
        method: 'POST',
        body: data,
      }),
      transformResponse: (r: { data: JobItemProgressEntry }) => r.data,
      invalidatesTags: (result, error, { jobId, itemId }) => [
        { type: 'Job', id: `${jobId}-ITEMS` },
        { type: 'Job', id: `JOB-ITEM-PROGRESS-${itemId}` },
        { type: 'Job', id: `${jobId}-PROGRESS-ENTRIES-ALL` },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
      ],
    }),

    updateJobItemProgressEntry: builder.mutation<
      JobItemProgressEntry,
      { jobId: string; itemId: string; entryId: string; data: Partial<JobItemProgressEntry> }
    >({
      query: ({ jobId, itemId, entryId, data }) => ({
        url: `/jobs/${jobId}/items/${itemId}/progress-entries/${entryId}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: JobItemProgressEntry }) => r.data,
      invalidatesTags: (result, error, { jobId, itemId }) => [
        { type: 'Job', id: `${jobId}-ITEMS` },
        { type: 'Job', id: `JOB-ITEM-PROGRESS-${itemId}` },
        { type: 'Job', id: `${jobId}-PROGRESS-ENTRIES-ALL` },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
      ],
    }),

    deleteJobItemProgressEntry: builder.mutation<
      { deleted: boolean },
      { jobId: string; itemId: string; entryId: string }
    >({
      query: ({ jobId, itemId, entryId }) => ({
        url: `/jobs/${jobId}/items/${itemId}/progress-entries/${entryId}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: (result, error, { jobId, itemId }) => [
        { type: 'Job', id: `${jobId}-ITEMS` },
        { type: 'Job', id: `JOB-ITEM-PROGRESS-${itemId}` },
        { type: 'Job', id: `${jobId}-PROGRESS-ENTRIES-ALL` },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
      ],
    }),

    getDailyQuantityLog: builder.query<DailyQuantityLogResponse, string>({
      query: (workDate) => `/stock/daily-quantity-log?workDate=${encodeURIComponent(workDate)}`,
      transformResponse: (r: { data: DailyQuantityLogResponse }) => r.data,
      providesTags: (result, error, workDate) => [
        { type: 'JobDailyQuantityLog', id: workDate },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
      ],
    }),

    getDailyQuantityLogPending: builder.query<DailyQuantityLogPendingResponse, void>({
      query: () => '/stock/daily-quantity-log/pending',
      transformResponse: (r: { data: DailyQuantityLogPendingResponse }) => r.data,
      providesTags: [{ type: 'JobDailyQuantityLog', id: 'PENDING' }],
    }),

    getDailyQuantityLogPendingPage: builder.query<
      DailyQuantityLogPendingListResponse,
      DailyQuantityLogPendingListParams
    >({
      query: ({ limit, offset, status }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (status && status !== 'ALL') params.set('status', status);
        return `/stock/daily-quantity-log/pending?${params.toString()}`;
      },
      transformResponse: (r: { data: DailyQuantityLogPendingListResponse }) => r.data,
      providesTags: [{ type: 'JobDailyQuantityLog', id: 'PENDING' }],
    }),

    finalizeQuantityLogDay: builder.mutation<
      { ok: boolean },
      string | { workDate: string; allowEmpty?: boolean }
    >({
      query: (arg) => ({
        url: '/stock/daily-quantity-log/finalize',
        method: 'POST',
        body: typeof arg === 'string' ? { workDate: arg } : arg,
      }),
      transformResponse: (r: { data: { ok: boolean } }) => r.data,
      invalidatesTags: (result, error, arg) => {
        const workDate = typeof arg === 'string' ? arg : arg.workDate;
        return [
          { type: 'JobDailyQuantityLog', id: workDate },
          { type: 'JobDailyQuantityLog', id: 'LIST' },
          { type: 'JobDailyQuantityLog', id: 'PENDING' },
        ];
      },
    }),

    unlockQuantityLogDay: builder.mutation<{ unlocked: boolean }, string>({
      query: (workDate) => ({
        url: `/stock/daily-quantity-log/finalize?workDate=${encodeURIComponent(workDate)}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { unlocked: boolean } }) => r.data,
      invalidatesTags: (result, error, workDate) => [
        { type: 'JobDailyQuantityLog', id: workDate },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
        { type: 'JobDailyQuantityLog', id: 'PENDING' },
      ],
    }),

    addQuantityLogAdhocJob: builder.mutation<{ ok: boolean }, { workDate: string; jobId: string }>({
      query: (body) => ({
        url: '/stock/daily-quantity-log/adhoc-jobs',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: { ok: boolean } }) => r.data,
      invalidatesTags: (result, error, { workDate }) => [
        { type: 'JobDailyQuantityLog', id: workDate },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
        { type: 'JobDailyQuantityLog', id: 'PENDING' },
      ],
    }),

    removeQuantityLogAdhocJob: builder.mutation<{ deleted: boolean }, { workDate: string; jobId: string }>({
      query: ({ workDate, jobId }) => ({
        url: `/stock/daily-quantity-log/adhoc-jobs?workDate=${encodeURIComponent(workDate)}&jobId=${encodeURIComponent(jobId)}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: (result, error, { workDate }) => [
        { type: 'JobDailyQuantityLog', id: workDate },
        { type: 'JobDailyQuantityLog', id: 'LIST' },
        { type: 'JobDailyQuantityLog', id: 'PENDING' },
      ],
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

    createFormulaLibrary: builder.mutation<
      FormulaLibrary,
      Partial<FormulaLibrary> & { saveMode?: 'manual' | 'auto'; changeNote?: string }
    >({
      query: (body) => ({
        url: '/job-costing/formulas',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: FormulaLibrary }) => r.data,
      invalidatesTags: (result) =>
        result
          ? [{ type: 'Job', id: 'FORMULA_LIBRARY' }, { type: 'Job', id: `FORMULA-${result.id}-VERSIONS` }]
          : [{ type: 'Job', id: 'FORMULA_LIBRARY' }],
    }),

    updateFormulaLibrary: builder.mutation<
      FormulaLibrary,
      { id: string; data: Partial<FormulaLibrary> & { saveMode?: 'manual' | 'auto'; changeNote?: string } }
    >({
      query: ({ id, data }) => ({
        url: `/job-costing/formulas/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: FormulaLibrary }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Job', id: 'FORMULA_LIBRARY' },
        { type: 'Job', id: `FORMULA-${id}` },
        { type: 'Job', id: `FORMULA-${id}-VERSIONS` },
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

    getFormulaLibraryVersions: builder.query<FormulaLibraryVersion[], string>({
      query: (id) => `/job-costing/formulas/${id}/versions`,
      transformResponse: (r: { data: FormulaLibraryVersion[] }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Job', id: `FORMULA-${id}-VERSIONS` }],
    }),

    restoreFormulaLibraryVersion: builder.mutation<
      FormulaLibrary,
      { id: string; versionId: string; changeNote?: string }
    >({
      query: ({ id, versionId, changeNote }) => ({
        url: `/job-costing/formulas/${id}/restore-version`,
        method: 'POST',
        body: { versionId, changeNote },
      }),
      transformResponse: (r: { data: FormulaLibrary }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Job', id: 'FORMULA_LIBRARY' },
        { type: 'Job', id: `FORMULA-${id}` },
        { type: 'Job', id: `FORMULA-${id}-VERSIONS` },
      ],
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

    getJobCostingSnapshots: builder.query<JobCostingSnapshotMeta[], string>({
      query: (jobId) => `/jobs/${jobId}/cost-engine/snapshots`,
      transformResponse: (r: { data: JobCostingSnapshotMeta[] }) => r.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: `COST-SNAPSHOTS-${jobId}` }],
    }),

    getJobCostingSnapshotById: builder.query<JobCostingSnapshotDetail, { jobId: string; snapshotId: string }>({
      query: ({ jobId, snapshotId }) => `/jobs/${jobId}/cost-engine/snapshots/${snapshotId}`,
      transformResponse: (r: { data: JobCostingSnapshotDetail }) => r.data,
      providesTags: (result, error, { snapshotId }) => [{ type: 'Job', id: `COST-SNAPSHOT-${snapshotId}` }],
    }),

    createJobCostingSnapshot: builder.mutation<
      JobCostingSnapshotDetail,
      {
        jobId: string;
        pricingMode?: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
        postingDate?: string;
        jobItemIds?: string[];
        customUnitCosts?: Record<string, number>;
        note?: string;
      }
    >({
      query: ({ jobId, ...body }) => ({
        url: `/jobs/${jobId}/cost-engine/snapshots`,
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: JobCostingSnapshotDetail }) => r.data,
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: `COST-SNAPSHOTS-${jobId}` }],
    }),

    approveJobCostingSnapshot: builder.mutation<
      { snapshot: JobCostingSnapshotMeta },
      { jobId: string; snapshotId: string }
    >({
      query: ({ jobId, snapshotId }) => ({
        url: `/jobs/${jobId}/cost-engine/snapshots/${snapshotId}`,
        method: 'PATCH',
        body: { action: 'approve' },
      }),
      transformResponse: (r: { data: { snapshot: JobCostingSnapshotMeta } }) => r.data,
      invalidatesTags: (result, error, { jobId, snapshotId }) => [
        { type: 'Job', id: `COST-SNAPSHOTS-${jobId}` },
        { type: 'Job', id: `COST-SNAPSHOT-${snapshotId}` },
      ],
    }),

    renameJobCostingSnapshot: builder.mutation<
      { snapshot: JobCostingSnapshotMeta },
      { jobId: string; snapshotId: string; note: string }
    >({
      query: ({ jobId, snapshotId, note }) => ({
        url: `/jobs/${jobId}/cost-engine/snapshots/${snapshotId}`,
        method: 'PATCH',
        body: { action: 'rename', note },
      }),
      transformResponse: (r: { data: { snapshot: JobCostingSnapshotMeta } }) => r.data,
      invalidatesTags: (result, error, { jobId, snapshotId }) => [
        { type: 'Job', id: `COST-SNAPSHOTS-${jobId}` },
        { type: 'Job', id: `COST-SNAPSHOT-${snapshotId}` },
      ],
    }),

    deleteJobCostingSnapshot: builder.mutation<{ deleted: boolean }, { jobId: string; snapshotId: string }>({
      query: ({ jobId, snapshotId }) => ({
        url: `/jobs/${jobId}/cost-engine/snapshots/${snapshotId}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: (result, error, { jobId, snapshotId }) => [
        { type: 'Job', id: `COST-SNAPSHOTS-${jobId}` },
        { type: 'Job', id: `COST-SNAPSHOT-${snapshotId}` },
      ],
    }),

    getDispatchBudgetWarning: builder.mutation<
      DispatchBudgetWarningResult,
      {
        jobId: string;
        postingDate?: string;
        lines: Array<{
          materialId: string;
          quantity: number;
          quantityUomId?: string;
          returnQty?: number;
        }>;
      }
    >({
      query: ({ jobId, ...body }) => ({
        url: `/jobs/${jobId}/dispatch-budget-warning`,
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: DispatchBudgetWarningResult }) => r.data,
    }),

    createJob: builder.mutation<Job, Partial<Job>>({
      query: (body) => ({
        url: '/jobs',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Job }) => r.data,
      invalidatesTags: [...JOB_CACHE_INVALIDATES],
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          notifyJobLiveUpdate({ action: 'created' });
        } catch {
          /* mutation failed — skip live notify */
        }
      },
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
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          notifyJobLiveUpdate({ action: 'updated' });
        } catch {
          /* mutation failed — skip live notify */
        }
      },
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

    bulkImportParentJobs: builder.mutation<
      { created: number; updated: number; skipped: number; warnings: string[] },
      { scope: 'parent'; newRows: unknown[]; updateRows: unknown[] }
    >({
      query: (body) => ({
        url: '/jobs/import/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: { created: number; updated: number; skipped: number; warnings: string[] };
      }) => r.data,
      invalidatesTags: [...JOB_CACHE_INVALIDATES],
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          notifyJobLiveUpdate({ action: 'bulk_import' });
        } catch {
          /* mutation failed — skip live notify */
        }
      },
    }),

    bulkImportJobVariations: builder.mutation<
      { created: number; updated: number; skipped: number; warnings: string[] },
      { scope: 'variation'; newRows: unknown[]; updateRows: unknown[] }
    >({
      query: (body) => ({
        url: '/jobs/import/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: { created: number; updated: number; skipped: number; warnings: string[] };
      }) => r.data,
      invalidatesTags: [...JOB_CACHE_INVALIDATES],
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          notifyJobLiveUpdate({ action: 'bulk_import' });
        } catch {
          /* mutation failed — skip live notify */
        }
      },
    }),
  }),
});

export const {
  useGetJobsQuery,
  useGetJobsPageQuery,
  useLazyGetJobsForExportQuery,
  useGetJobsForExportQuery,
  useGetJobByIdQuery,
  useGetJobMaterialsQuery,
  useGetJobItemsQuery,
  useAddJobItemMutation,
  useUpdateJobItemMutation,
  useDeleteJobItemMutation,
  useGetJobItemProgressEntriesQuery,
  useGetJobProgressEntriesForJobQuery,
  useAddJobItemProgressEntryMutation,
  useUpdateJobItemProgressEntryMutation,
  useDeleteJobItemProgressEntryMutation,
  useGetDailyQuantityLogQuery,
  useGetDailyQuantityLogPendingQuery,
  useGetDailyQuantityLogPendingPageQuery,
  useFinalizeQuantityLogDayMutation,
  useUnlockQuantityLogDayMutation,
  useAddQuantityLogAdhocJobMutation,
  useRemoveQuantityLogAdhocJobMutation,
  useGetFormulaLibrariesQuery,
  useGetFormulaLibraryByIdQuery,
  useCreateFormulaLibraryMutation,
  useUpdateFormulaLibraryMutation,
  useDeleteFormulaLibraryMutation,
  useGetFormulaLibraryVersionsQuery,
  useRestoreFormulaLibraryVersionMutation,
  useCalculateJobCostEngineMutation,
  useGetJobCostingSnapshotsQuery,
  useGetJobCostingSnapshotByIdQuery,
  useCreateJobCostingSnapshotMutation,
  useApproveJobCostingSnapshotMutation,
  useRenameJobCostingSnapshotMutation,
  useDeleteJobCostingSnapshotMutation,
  useGetDispatchBudgetWarningMutation,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  useBulkImportParentJobsMutation,
  useBulkImportJobVariationsMutation,
} = jobsApi;
