import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

export const RECEIPT_ENTRY_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export interface ReceiptMaterial {
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  unitCost: number;
  totalCost: number;
  batchNumber: string;
  /** Alternate UOM used when the receipt was posted (empty = material base unit). */
  quantityUomId?: string;
  /** Quantity as entered on the receipt form (purchase UOM). */
  displayQuantity?: number;
  /** Unit cost as entered on the receipt form (per purchase UOM). */
  displayUnitCost?: number;
}

export interface ReceiptEntry {
  id: string;
  receiptNumber: string;
  receivedDate: Date;
  supplier?: string;
  lpoNumber?: string;
  supplierInvoiceNumber?: string;
  billAmount?: number;
  includeTax?: boolean;
  taxAmount?: number;
  notes?: string;
  status: 'active' | 'cancelled';
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  adjustedAt?: string | null;
  adjustmentReason?: string | null;
  itemsCount: number;
  totalValue: number;
  materials: ReceiptMaterial[];
}

export interface ReceiptAdjustmentImpactTransaction {
  transactionId: string;
  type: 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'REVERSAL';
  date: Date | string;
  quantity: number;
  quantityFromBatch: number;
  notes?: string | null;
  jobId?: string | null;
  jobNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
}

export interface ReceiptAdjustmentImpactRow {
  batchId: string;
  batchNumber: string;
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  quantityConsumed: number;
  quantityAdjusted: number;
  linkedTransactions: ReceiptAdjustmentImpactTransaction[];
}

export interface ReceiptAdjustmentImpactResponse {
  receiptNumber: string;
  status: 'active' | 'cancelled';
  canCancel: boolean;
  canAdjustRemaining: boolean;
  needsAdjustmentReview: boolean;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  adjustedAt?: string | null;
  adjustmentReason?: string | null;
  summary: {
    totalReceived: number;
    totalAvailable: number;
    totalConsumed: number;
    totalAdjusted: number;
    affectedBatches: number;
    linkedTransactionCount: number;
    linkedJobsCount: number;
    linkedCustomersCount: number;
  };
  rows: ReceiptAdjustmentImpactRow[];
}

export type ReceiptEntriesListParams = {
  filterType: string;
  date: string;
  limit: number;
  offset: number;
  search?: string;
};

export type ReceiptEntriesListResponse = {
  items: ReceiptEntry[];
  total: number;
};

export const receiptsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getReceiptEntries: builder.query<
      ReceiptEntry[],
      { filterType: string; date: string }
    >({
      query: ({ filterType, date }) =>
        `/materials/receipt-history-entries?filterType=${filterType}&date=${date}`,
      transformResponse: (r: { data: { entries: ReceiptEntry[] } }) => r.data.entries,
      providesTags: [{ type: 'ReceiptEntry' }],
    }),

    getReceiptEntriesPage: builder.query<ReceiptEntriesListResponse, ReceiptEntriesListParams>({
      query: ({ filterType, date, limit, offset, search }) => {
        const params = new URLSearchParams();
        params.set('filterType', filterType);
        params.set('date', date);
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        return `/materials/receipt-history-entries?${params.toString()}`;
      },
      transformResponse: (r: { data: { entries: ReceiptEntry[]; total: number } }) => ({
        items: r.data.entries,
        total: r.data.total,
      }),
      providesTags: [{ type: 'ReceiptEntry' }],
    }),

    getReceiptEntry: builder.query<ReceiptEntry, string>({
      query: (receiptNumber) =>
        `/materials/receipt-history-entries/${encodeURIComponent(receiptNumber)}`,
      transformResponse: (r: { data: ReceiptEntry }) => r.data,
      providesTags: (result, error, arg) => [
        { type: 'ReceiptEntry', id: arg },
      ],
    }),

    getReceiptAdjustmentImpact: builder.query<ReceiptAdjustmentImpactResponse, string>({
      query: (receiptNumber) =>
        `/materials/receipt-history-entries/${encodeURIComponent(receiptNumber)}/adjustment-impact`,
      transformResponse: (r: { data: ReceiptAdjustmentImpactResponse }) => r.data,
      providesTags: (result, error, arg) => [
        { type: 'ReceiptEntry', id: arg },
      ],
    }),

    deleteReceiptEntry: builder.mutation<{ deleted: boolean }, string>({
      query: (receiptNumber) => ({
        url: `/materials/receipt-history-entries/${encodeURIComponent(receiptNumber)}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: [
        { type: 'ReceiptEntry' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'StockValuation' },
        { type: 'DispatchEntry' },
        { type: 'Consumption' },
        { type: 'StockExceptionApproval' },
      ],
    }),
    cancelReceiptEntry: builder.mutation<
      { cancelled: boolean; receiptNumber: string; cancelledAt: string; reason: string | null },
      { receiptNumber: string; reason?: string }
    >({
      query: ({ receiptNumber, reason }) => ({
        url: `/materials/receipt-history-entries/${encodeURIComponent(receiptNumber)}/cancel`,
        method: 'POST',
        body: reason ? { reason } : {},
      }),
      transformResponse: (r: { data: { cancelled: boolean; receiptNumber: string; cancelledAt: string; reason: string | null } }) => r.data,
      invalidatesTags: [
        { type: 'ReceiptEntry' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'StockValuation' },
        { type: 'DispatchEntry' },
        { type: 'Consumption' },
        { type: 'StockExceptionApproval' },
      ],
    }),
    adjustReceiptEntry: builder.mutation<
      {
        adjusted: boolean;
        receiptNumber: string;
        adjustedAt: string;
        reason: string;
        remainingAdjustedQty: number;
      },
      { receiptNumber: string; reason: string }
    >({
      query: ({ receiptNumber, reason }) => ({
        url: `/materials/receipt-history-entries/${encodeURIComponent(receiptNumber)}/adjust`,
        method: 'POST',
        body: { reason },
      }),
      transformResponse: (r: {
        data: {
          adjusted: boolean;
          receiptNumber: string;
          adjustedAt: string;
          reason: string;
          remainingAdjustedQty: number;
        };
      }) => r.data,
      invalidatesTags: [
        { type: 'ReceiptEntry' },
        { type: 'Material', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'StockValuation' },
        { type: 'DispatchEntry' },
        { type: 'Consumption' },
        { type: 'StockExceptionApproval' },
      ],
    }),
  }),
});

export const {
  useGetReceiptEntriesQuery,
  useGetReceiptEntriesPageQuery,
  useGetReceiptEntryQuery,
  useLazyGetReceiptAdjustmentImpactQuery,
  useDeleteReceiptEntryMutation,
  useCancelReceiptEntryMutation,
  useAdjustReceiptEntryMutation,
} = receiptsApi;
