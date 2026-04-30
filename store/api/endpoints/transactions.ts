import { appApi } from '../appApi';

interface BatchConsumption {
  batchId: string;
  batchNumber: string;
  quantityFromBatch: number;
  unitCost: number;
  costAmount: number;
}

interface Transaction {
  id: string;
  companyId: string;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'REVERSAL' | 'ADJUSTMENT';
  materialId: string;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
  quantity: number;
  jobId?: string;
  batchesUsed?: BatchConsumption[];
  totalCost: number;
  averageCost: number;
  performedBy: string;
  date: string | Date;
  notes?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface AddTransactionPayload {
  type: 'STOCK_OUT' | 'RETURN';
  materialId: string;
  quantity: number;
  warehouseId?: string;
  jobId?: string;
  delta?: number;
  notes?: string;
}

interface TransferPayload {
  sourceCompanyId?: string;
  sourceWarehouseId?: string;
  materialId: string;
  quantity: number;
  quantityUomId?: string;
  destinationCompanyId: string;
  destinationWarehouseId?: string;
  destinationWarehouse?: string;
  notes?: string;
  date?: string;
}

interface TransferResult {
  transferredQty: number;
  materialName: string;
  sourceCompany: string;
  destinationCompany: string;
  destMaterialId: string;
}

type BatchTransactionPayload = Record<string, unknown>;

function extractBatchMaterialIds(arg: BatchTransactionPayload | undefined): string[] {
  if (!arg) return [];
  const ids = new Set<string>();

  const lines = Array.isArray(arg.lines) ? arg.lines : [];
  for (const line of lines) {
    if (
      line &&
      typeof line === 'object' &&
      'materialId' in line &&
      typeof (line as { materialId?: unknown }).materialId === 'string'
    ) {
      ids.add((line as { materialId: string }).materialId);
    }
  }

  const materialUpdates = Array.isArray(arg.materialUpdates) ? arg.materialUpdates : [];
  for (const update of materialUpdates) {
    if (
      update &&
      typeof update === 'object' &&
      'materialId' in update &&
      typeof (update as { materialId?: unknown }).materialId === 'string'
    ) {
      ids.add((update as { materialId: string }).materialId);
    }
  }

  return [...ids];
}

type DispatchEntryResponse = {
  exists: boolean;
  lines: Array<Record<string, unknown>>;
  transactionIds: string[];
  notes: string;
};

export interface TransferLedgerItem {
  id: string;
  type: 'TRANSFER_IN' | 'TRANSFER_OUT';
  direction: 'IN' | 'OUT';
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  warehouseId?: string | null;
  warehouseName?: string | null;
  counterpartCompanySlug?: string | null;
  counterpartCompanyName?: string | null;
  notes?: string | null;
  date: string | Date;
  createdAt?: string | Date;
  performedBy: string;
}

export interface NonStockReconcileMaterial {
  id: string;
  name: string;
  unit: string;
  warehouse?: string | null;
  warehouseId?: string | null;
  currentStock: number;
  allowNegativeConsumption: boolean;
  stockType: string;
  materialUoms?: Array<{
    id: string;
    unitId: string;
    unit: { id: string; name: string };
    isBase: boolean;
    parentUomId: string | null;
    factorToParent: number;
  }>;
}

export interface NonStockReconcileJob {
  id: string;
  jobNumber: string;
  description?: string | null;
  customerName?: string;
}

export interface NonStockReconcileHistoryItem {
  id: string;
  quantity: number;
  totalCost: number;
  averageCost: number;
  notes?: string | null;
  date: string | Date;
  createdAt?: string | Date;
  materialName: string;
  unit: string;
  jobId: string;
  jobNumber: string;
  jobDescription?: string;
  customerName?: string;
}

export interface NonStockReconcileData {
  materials: NonStockReconcileMaterial[];
  jobs: NonStockReconcileJob[];
  selectedMonth?: string;
  history: NonStockReconcileHistoryItem[];
}

export interface NonStockReconcilePayload {
  jobIds: string[];
  lines: Array<{
    materialId: string;
    quantity: number;
    quantityUomId?: string;
    warehouseId?: string;
  }>;
  allocations: Array<{
    jobId: string;
    materialId: string;
    quantity: number;
  }>;
  notes?: string;
  date?: string;
}

export interface ManualStockAdjustmentLinePayload {
  materialId: string;
  warehouseId: string;
  quantityDelta: number;
  unitCost?: number;
}

export interface ManualStockAdjustmentPayload {
  lines: ManualStockAdjustmentLinePayload[];
  reason: string;
  evidenceType: 'PHYSICAL_COUNT' | 'DAMAGE_REPORT' | 'SUPPLIER_CLAIM' | 'CUSTOMER_RETURN' | 'OTHER';
  evidenceReference: string;
  evidenceNotes?: string;
  notes?: string;
}

interface ManualStockAdjustmentPolicySummary {
  positiveLineCount: number;
  negativeLineCount: number;
  highEvidenceNegativeLineCount: number;
  largestNegativeQty: number;
  requiresEnhancedEvidence: boolean;
  requiresDecisionNote: boolean;
}

export const transactionsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getTransactionsByJob: builder.query<Transaction[], { jobId: string; limit?: number }>({
      query: ({ jobId, limit = 100 }) => `/transactions?jobId=${jobId}&limit=${limit}`,
      transformResponse: (r: { data: Transaction[] }) => r.data,
      providesTags: (result, error, arg) => [
        { type: 'Transaction', id: arg.jobId },
      ],
    }),

    addTransaction: builder.mutation<Transaction, AddTransactionPayload>({
      query: (body) => ({
        url: '/transactions',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Transaction }) => r.data,
      invalidatesTags: (result, error, arg) => [
        { type: 'Transaction', id: arg.jobId || 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'JobMaterials', id: arg.jobId || 'LIST' },
        { type: 'Material', id: arg.materialId },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'StockValuation' },
        { type: 'DispatchEntry' },
        { type: 'Consumption' },
        { type: 'StockExceptionApproval' },
      ],
    }),

    addBatchTransaction: builder.mutation<
      { created: number; ids: string[] },
      BatchTransactionPayload
    >({
      query: (body) => ({
        url: '/transactions/batch',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: { created: number; ids: string[] } }) => r.data,
      invalidatesTags: (result, error, arg) => {
        const materialIds = extractBatchMaterialIds(arg);
        return [
          { type: 'Material', id: 'LIST' },
          ...materialIds.map((id) => ({ type: 'Material' as const, id })),
          ...materialIds.map((id) => ({ type: 'PriceLog' as const, id })),
          { type: 'Transaction', id: 'LIST' },
          { type: 'ReceiptEntry' },
          { type: 'StockBatch', id: 'LIST' },
          { type: 'StockValuation' },
          { type: 'DispatchEntry' },
          { type: 'JobMaterials' },
          { type: 'Consumption' },
          { type: 'StockExceptionApproval' },
        ];
      },
    }),

    deleteTransaction: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/transactions/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean }) => r,
      invalidatesTags: [
        { type: 'DispatchEntry' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'StockValuation' },
        { type: 'ReceiptEntry' },
        { type: 'Consumption' },
        { type: 'StockExceptionApproval' },
      ],
    }),

    transferStock: builder.mutation<TransferResult, TransferPayload>({
      query: (body) => ({
        url: '/transactions/transfer',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: TransferResult }) => r.data,
      invalidatesTags: [
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'Transaction', id: 'TRANSFER_LEDGER' },
        { type: 'StockValuation' },
        { type: 'DispatchEntry' },
        { type: 'ReceiptEntry' },
        { type: 'Consumption' },
      ],
    }),

    getTransferLedger: builder.query<TransferLedgerItem[], void>({
      query: () => '/transactions/transfers',
      transformResponse: (r: { data: TransferLedgerItem[] }) => r.data,
      providesTags: [{ type: 'Transaction', id: 'TRANSFER_LEDGER' }],
    }),

    getDispatchEntry: builder.query<DispatchEntryResponse, { jobId: string; date: string }>({
      query: ({ jobId, date }) =>
        `/transactions/dispatch-entry?jobId=${jobId}&date=${date}`,
      transformResponse: (r: { data: DispatchEntryResponse }) => r.data,
      providesTags: [{ type: 'DispatchEntry' }],
    }),

    getNonStockReconcileData: builder.query<NonStockReconcileData, { date?: string } | void>({
      query: (arg) => {
        const date = arg && 'date' in arg ? arg.date : undefined;
        return date ? `/transactions/non-stock-reconcile?date=${encodeURIComponent(date)}` : '/transactions/non-stock-reconcile';
      },
      transformResponse: (r: { data: NonStockReconcileData }) => r.data,
      providesTags: [{ type: 'Transaction', id: 'NON_STOCK_RECONCILE' }],
    }),

    reconcileNonStock: builder.mutation<{ created: number; ids: string[] }, NonStockReconcilePayload>({
      query: (body) => ({
        url: '/transactions/non-stock-reconcile',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: { created: number; ids: string[] } }) => r.data,
      invalidatesTags: [
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'Transaction', id: 'NON_STOCK_RECONCILE' },
        { type: 'JobMaterials' },
        { type: 'StockValuation' },
        { type: 'DispatchEntry' },
        { type: 'ReceiptEntry' },
        { type: 'Consumption' },
      ],
    }),

    requestManualStockAdjustment: builder.mutation<
      {
        requested: boolean;
        id: string;
        referenceId: string;
        referenceNumber: string;
        status: 'PENDING' | 'APPROVED';
        appliedTransactionIds: string[];
        lineCount: number;
        policySummary?: ManualStockAdjustmentPolicySummary;
      },
      ManualStockAdjustmentPayload
    >({
      query: (body) => ({
        url: '/transactions/manual-adjustment',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: {
          requested: boolean;
          id: string;
          referenceId: string;
          referenceNumber: string;
          status: 'PENDING' | 'APPROVED';
          appliedTransactionIds: string[];
          lineCount: number;
          policySummary?: ManualStockAdjustmentPolicySummary;
        };
      }) => r.data,
      invalidatesTags: [
        { type: 'Material', id: 'LIST' },
        { type: 'Warehouse', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'StockValuation' },
        { type: 'StockIntegrity' },
        { type: 'StockExceptionApproval' },
        { type: 'ReceiptEntry' },
      ],
    }),
  }),
});

export const {
  useGetTransactionsByJobQuery,
  useAddTransactionMutation,
  useAddBatchTransactionMutation,
  useDeleteTransactionMutation,
  useTransferStockMutation,
  useGetTransferLedgerQuery,
  useGetDispatchEntryQuery,
  useGetNonStockReconcileDataQuery,
  useReconcileNonStockMutation,
  useRequestManualStockAdjustmentMutation,
} = transactionsApi;
