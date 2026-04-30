import { appApi } from '../appApi';

interface Material {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
}

interface StockValuationResponse {
  summary: {
    totalStockValue: number;
    fifoStockValue: number;
    movingAverageStockValue: number;
    currentStockValue: number;
    preferredMethod: 'FIFO';
    prevMonthConsumptionValue: number;
    warehouseMode?: 'REQUIRED';
    fallbackWarehouseName?: string | null;
    warehouseCount?: number;
  };
  topMaterialsByValue: Material[];
  topConsumedItems: Material[];
  warehouseBreakdown?: Array<{
    warehouseId: string;
    warehouseName: string;
    materialCount: number;
    stockValue: number;
  }>;
}

interface ConsumptionData {
  month: number;
  year: number;
  totalValue: number;
  itemCount: number;
  items: Material[];
}

interface ConsumptionResponse {
  currentMonth: ConsumptionData | null;
}

interface JobConsumptionRow {
  jobId: string;
  jobNumber: string;
  materialId: string;
  materialName: string;
  unit: string;
  dispatched: number;
  returned: number;
  netConsumed: number;
}

export interface InventoryByWarehouseWarehouseCol {
  id: string;
  name: string;
}

export interface InventoryByWarehouseRow {
  materialId: string;
  materialName: string;
  unit: string;
  companyTotal: number;
  splitTotal: number;
  qtyByWarehouseId: Record<string, number>;
}

export interface InventoryByWarehouseResponse {
  warehouseColumns: InventoryByWarehouseWarehouseCol[];
  rows: InventoryByWarehouseRow[];
}

export interface StockIntegrityRow {
  materialId: string;
  materialName: string;
  unit: string;
  companyTotal: number;
  warehouseTotal: number;
  batchTotal: number;
  warehouseDelta: number;
  batchDelta: number;
  warehouseCount: number;
  openBatchCount: number;
  inactiveWarehouseQty: number;
  batchlessWarehouseQty: number;
  inactiveBatchWarehouseQty: number;
  exceptions: string[];
}

export interface StockIntegrityResponse {
  summary: {
    totalMaterials: number;
    materialsWithExceptions: number;
    warehouseMismatchCount: number;
    batchMismatchCount: number;
    batchlessStockCount: number;
    inactiveWarehouseStockCount: number;
    negativeStockCount: number;
  };
  rows: StockIntegrityRow[];
}

export interface JobProfitabilityRow {
  customerId: string;
  customerName: string;
  parentJobId: string;
  parentJobNumber: string;
  variationJobId: string;
  variationJobNumber: string;
  variationDescription: string | null;
  status: string;
  budgetItemCount: number;
  budgetMaterialCount: number;
  budgetMaterialQuantity: number;
  budgetMaterialCost: number;
  issuedMaterialQuantity: number;
  issuedMaterialCost: number;
  returnedMaterialQuantity: number;
  returnedMaterialCost: number;
  netMaterialQuantity: number;
  netMaterialCost: number;
  reconcileQuantity: number;
  reconcileCost: number;
  unbudgetedMaterialCount: number;
  unbudgetedMaterialCost: number;
  materialCostVariance: number;
  budgetVariancePct: number | null;
  variationJobWorkValue: number | null;
  variationLpoValue: number | null;
  parentJobWorkValue: number | null;
  parentLpoValue: number | null;
  materialMarginAgainstVariationValue: number | null;
  warningCount: number;
}

export interface JobProfitabilityResponse {
  summary: {
    totalVariations: number;
    activeVariations: number;
    customersCovered: number;
    totalBudgetMaterialCost: number;
    totalNetMaterialCost: number;
    overBudgetCount: number;
    withUnbudgetedMaterialCount: number;
    reconcileLinkedCount: number;
  };
  rows: JobProfitabilityRow[];
}

export interface SupplierTraceabilityPartyRef {
  id: string;
  name: string;
}

export interface SupplierTraceabilityJobRef {
  id: string;
  jobNumber: string;
}

export interface SupplierTraceabilityRow {
  batchId: string;
  batchNumber: string;
  receiptNumber: string | null;
  supplierId: string | null;
  supplierName: string;
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId: string | null;
  warehouseName: string | null;
  receivedDate: string;
  expiryDate: string | null;
  notes: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  netIssuedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  unitCost: number;
  receiptCost: number;
  issuedCost: number;
  returnedCost: number;
  jobCount: number;
  customerCount: number;
  dispatchCount: number;
  deliveryNoteCount: number;
  firstIssueDate: string | null;
  firstReturnDate: string | null;
  lastIssueDate: string | null;
  lastActivityDate: string | null;
  jobs: SupplierTraceabilityJobRef[];
  customers: SupplierTraceabilityPartyRef[];
}

export interface SupplierTraceabilityResponse {
  summary: {
    totalBatches: number;
    openBatches: number;
    suppliersCovered: number;
    receiptLinkedCount: number;
    dispatchedBatchCount: number;
    returnedBatchCount: number;
  };
  rows: SupplierTraceabilityRow[];
}

export interface StockExceptionRow {
  id: string;
  category: 'dispatch_override' | 'receipt_adjustment' | 'receipt_cancellation' | 'manual_stock_adjustment';
  categoryLabel: string;
  severity: 'warning' | 'critical';
  occurredAt: string;
  referenceNumber: string;
  materialNames: string[];
  warehouseNames: string[];
  jobNumbers: string[];
  customerNames: string[];
  reason: string | null;
  details: string;
}

export interface StockExceptionsResponse {
  summary: {
    totalEvents: number;
    dispatchOverrideCount: number;
    receiptAdjustmentCount: number;
    receiptCancellationCount: number;
    manualStockAdjustmentCount: number;
    linkedJobsCount: number;
    linkedCustomersCount: number;
  };
  rows: StockExceptionRow[];
}

export interface StockExceptionApprovalRow {
  id: string;
  exceptionType: 'DISPATCH_OVERRIDE' | 'RECEIPT_ADJUSTMENT' | 'RECEIPT_CANCELLATION' | 'MANUAL_STOCK_ADJUSTMENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  warehouseNames: string[];
  lineCount: number;
  netQuantity: number | null;
  evidenceType: string | null;
  evidenceReference: string | null;
  sourceSessionId: string | null;
  sourceSessionTitle: string | null;
  requiresDecisionNote: boolean;
  ageHours: number;
  referenceId: string;
  referenceNumber: string | null;
  reason: string;
  payload?: Record<string, unknown> | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface StockExceptionApprovalsResponse {
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    pendingOver24h: number;
    manualAdjustmentPendingCount: number;
    dispatchOverridePendingCount: number;
  };
  rows: StockExceptionApprovalRow[];
}

export interface StockAdjustmentRow {
  id: string;
  referenceId: string;
  referenceNumber: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  evidenceType: string | null;
  evidenceReference: string | null;
  evidenceNotes: string | null;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  decidedAt: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  lineCount: number;
  materialNames: string[];
  warehouseNames: string[];
  grossIncreaseQty: number;
  grossDecreaseQty: number;
  netQty: number;
  estimatedNetValue: number;
  appliedIncreaseValue: number | null;
  appliedDecreaseValue: number | null;
  appliedNetValue: number | null;
}

export interface StockAdjustmentsResponse {
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    warehousesCovered: number;
    requestersCovered: number;
    approversCovered: number;
    grossIncreaseQty: number;
    grossDecreaseQty: number;
    estimatedNetValue: number;
    appliedNetValue: number;
  };
  rows: StockAdjustmentRow[];
}

export interface StockCountSessionReportRow {
  id: string;
  title: string;
  warehouseId: string;
  warehouseName: string;
  status: 'DRAFT' | 'ADJUSTMENT_PENDING' | 'ADJUSTMENT_APPROVED' | 'ADJUSTMENT_REJECTED' | 'CANCELLED';
  statusLabel: string;
  evidenceReference: string | null;
  linkedAdjustmentApprovalId: string | null;
  linkedAdjustmentReferenceNumber: string | null;
  linkedAdjustmentStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  linkedAdjustmentDecisionNote: string | null;
  currentRevision: number;
  lineCount: number;
  varianceLineCount: number;
  grossExcessQty: number;
  grossShortageQty: number;
  netVarianceQty: number;
  estimatedNetValue: number;
  createdByName: string | null;
  reviewedByName: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  approvalHours: number | null;
}

export interface StockCountSessionMaterialReportRow {
  materialId: string;
  materialName: string;
  unit: string;
  sessionCount: number;
  varianceSessionCount: number;
  grossExcessQty: number;
  grossShortageQty: number;
  netVarianceQty: number;
  estimatedNetValue: number;
  latestSessionAt: string;
}

export interface StockCountSessionWarehouseReportRow {
  warehouseId: string;
  warehouseName: string;
  totalSessions: number;
  varianceSessionCount: number;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  grossExcessQty: number;
  grossShortageQty: number;
  netVarianceQty: number;
  estimatedNetValue: number;
  avgApprovalHours: number | null;
  latestSessionAt: string;
}

export interface StockCountSessionsReportResponse {
  summary: {
    totalSessions: number;
    draftCount: number;
    pendingAdjustmentCount: number;
    approvedAdjustmentCount: number;
    rejectedAdjustmentCount: number;
    cancelledCount: number;
    warehousesCovered: number;
    linkedAdjustmentCount: number;
    recountCount: number;
    avgApprovalHours: number | null;
    varianceSessionCount: number;
    totalVarianceLines: number;
    grossExcessQty: number;
    grossShortageQty: number;
    netVarianceQty: number;
    estimatedNetValue: number;
  };
  rows: StockCountSessionReportRow[];
  warehouseRows: StockCountSessionWarehouseReportRow[];
  materialRows: StockCountSessionMaterialReportRow[];
}

export const reportsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getStockValuation: builder.query<StockValuationResponse, void>({
      query: () => '/reports/stock-valuation',
      transformResponse: (r: { data: StockValuationResponse }) => r.data,
      providesTags: ['StockValuation', 'Material'],
    }),

    getConsumption: builder.query<ConsumptionResponse, void>({
      query: () => '/reports/consumption',
      transformResponse: (r: { data: ConsumptionResponse }) => r.data,
      providesTags: ['Consumption'],
    }),

    getJobConsumption: builder.query<
      JobConsumptionRow[],
      { from?: string; to?: string; jobIds: string[] }
    >({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.from) searchParams.append('from', params.from);
        if (params.to) searchParams.append('to', params.to);
        params.jobIds.forEach((id) => searchParams.append('jobId[]', id));
        return `/reports/job-consumption?${searchParams.toString()}`;
      },
      transformResponse: (r: { data: JobConsumptionRow[] }) => r.data,
      providesTags: ['JobConsumption'],
    }),

    getJobProfitability: builder.query<JobProfitabilityResponse, void>({
      query: () => '/reports/job-profitability',
      transformResponse: (r: { data: JobProfitabilityResponse }) => r.data,
      providesTags: ['JobProfitability', 'Job', 'Customer', 'Transaction'],
    }),

    getSupplierTraceability: builder.query<SupplierTraceabilityResponse, void>({
      query: () => '/reports/supplier-traceability',
      transformResponse: (r: { data: SupplierTraceabilityResponse }) => r.data,
      providesTags: ['SupplierTraceability', 'Supplier', 'StockBatch', 'Transaction', 'Customer', 'Job'],
    }),

    getInventoryByWarehouse: builder.query<InventoryByWarehouseResponse, void>({
      query: () => '/reports/inventory-by-warehouse',
      transformResponse: (r: { data: InventoryByWarehouseResponse }) => r.data,
      providesTags: ['Material', 'Warehouse'],
    }),

    getStockIntegrity: builder.query<StockIntegrityResponse, void>({
      query: () => '/reports/stock-integrity',
      transformResponse: (r: { data: StockIntegrityResponse }) => r.data,
      providesTags: ['StockIntegrity', 'Material', 'StockBatch', 'Warehouse'],
    }),

    getStockExceptions: builder.query<StockExceptionsResponse, void>({
      query: () => '/reports/stock-exceptions',
      transformResponse: (r: { data: StockExceptionsResponse }) => r.data,
      providesTags: ['Transaction', 'StockBatch', 'ReceiptEntry', 'StockIntegrity', 'StockExceptionApproval'],
    }),

    getStockExceptionApprovals: builder.query<
      StockExceptionApprovalsResponse,
      { status?: 'PENDING' | 'APPROVED' | 'REJECTED' } | void
    >({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params && 'status' in params && params.status) {
          searchParams.set('status', params.status);
        }
        const query = searchParams.toString();
        return `/stock-exception-approvals${query ? `?${query}` : ''}`;
      },
      transformResponse: (r: { data: StockExceptionApprovalsResponse }) => r.data,
      providesTags: ['StockExceptionApproval'],
    }),

    getStockAdjustments: builder.query<StockAdjustmentsResponse, void>({
      query: () => '/reports/stock-adjustments',
      transformResponse: (r: { data: StockAdjustmentsResponse }) => r.data,
      providesTags: ['StockExceptionApproval', 'Transaction', 'StockBatch', 'Warehouse', 'Material'],
    }),

    getStockCountSessionsReport: builder.query<StockCountSessionsReportResponse, void>({
      query: () => '/reports/stock-count-sessions',
      transformResponse: (r: { data: StockCountSessionsReportResponse }) => r.data,
      providesTags: ['StockCountSession', 'StockExceptionApproval', 'Warehouse', 'Material'],
    }),

    updateStockExceptionApproval: builder.mutation<
      {
        id: string;
        status: 'APPROVED' | 'REJECTED';
        decidedById: string | null;
        decidedByName: string | null;
        decidedAt: string | null;
        decisionNote: string | null;
      },
      { id: string; status: 'APPROVED' | 'REJECTED'; decisionNote?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/stock-exception-approvals/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (r: {
        data: {
          id: string;
          status: 'APPROVED' | 'REJECTED';
          decidedById: string | null;
          decidedByName: string | null;
          decidedAt: string | null;
          decisionNote: string | null;
        };
      }) => r.data,
      invalidatesTags: ['StockExceptionApproval', 'StockCountSession', 'Transaction', 'ReceiptEntry', 'StockBatch'],
    }),
  }),
});

export const {
  useGetStockValuationQuery,
  useGetConsumptionQuery,
  useLazyGetJobConsumptionQuery,
  useGetJobProfitabilityQuery,
  useGetSupplierTraceabilityQuery,
  useGetInventoryByWarehouseQuery,
  useGetStockIntegrityQuery,
  useGetStockExceptionsQuery,
  useGetStockExceptionApprovalsQuery,
  useGetStockAdjustmentsQuery,
  useGetStockCountSessionsReportQuery,
  useUpdateStockExceptionApprovalMutation,
} = reportsApi;
