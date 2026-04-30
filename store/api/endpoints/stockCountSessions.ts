import { appApi } from '../appApi';

export interface StockCountSessionLineDto {
  id?: string;
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId: string;
  systemQty: number;
  countedQty: number | null;
  varianceQty: number;
  unitCost: number;
  sortOrder: number;
}

export interface StockCountSessionRevisionDto {
  id: string;
  revisionNumber: number;
  action: string;
  savedById: string | null;
  savedByName: string | null;
  createdAt: string;
}

export interface StockCountSessionDto {
  id: string;
  warehouseId: string;
  warehouseName: string;
  title: string;
  status: 'DRAFT' | 'ADJUSTMENT_PENDING' | 'ADJUSTMENT_APPROVED' | 'ADJUSTMENT_REJECTED' | 'CANCELLED';
  evidenceReference: string | null;
  evidenceNotes?: string | null;
  notes?: string | null;
  currentRevision: number;
  linkedAdjustmentApprovalId: string | null;
  linkedAdjustmentReferenceNumber: string | null;
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  lineCount?: number;
  varianceLineCount?: number;
  createdAt: string;
  updatedAt: string;
  lines?: StockCountSessionLineDto[];
  revisions?: StockCountSessionRevisionDto[];
}

export interface StockCountSessionListResponse {
  rows: StockCountSessionDto[];
}

export interface StockCountSessionSubmitResponse {
  sessionId: string;
  status: StockCountSessionDto['status'];
  linkedAdjustmentApprovalId: string | null;
  linkedAdjustmentReferenceNumber: string | null;
  approvalStatus: 'PENDING' | 'APPROVED';
}

export interface UpsertStockCountSessionPayload {
  warehouseId: string;
  title: string;
  evidenceReference?: string;
  evidenceNotes?: string;
  notes?: string;
  lines: Array<{
    materialId: string;
    materialName: string;
    unit: string;
    warehouseId: string;
    systemQty: number;
    countedQty: number | null;
    varianceQty: number;
    unitCost: number;
    sortOrder: number;
  }>;
}

export const stockCountSessionsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getStockCountSessions: builder.query<StockCountSessionDto[], void>({
      query: () => '/stock-count-sessions',
      transformResponse: (r: { data: StockCountSessionListResponse }) => r.data.rows,
      providesTags: (result) =>
        result
          ? [{ type: 'StockCountSession', id: 'LIST' }, ...result.map((row) => ({ type: 'StockCountSession' as const, id: row.id }))]
          : [{ type: 'StockCountSession', id: 'LIST' }],
    }),

    getStockCountSessionById: builder.query<StockCountSessionDto, string>({
      query: (id) => `/stock-count-sessions/${encodeURIComponent(id)}`,
      transformResponse: (r: { data: StockCountSessionDto }) => r.data,
      providesTags: (result, error, id) => [{ type: 'StockCountSession', id }],
    }),

    createStockCountSession: builder.mutation<StockCountSessionDto, UpsertStockCountSessionPayload>({
      query: (body) => ({
        url: '/stock-count-sessions',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: StockCountSessionDto }) => r.data,
      invalidatesTags: [{ type: 'StockCountSession', id: 'LIST' }],
    }),

    updateStockCountSession: builder.mutation<StockCountSessionDto, { id: string; body: UpsertStockCountSessionPayload }>({
      query: ({ id, body }) => ({
        url: `/stock-count-sessions/${encodeURIComponent(id)}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (r: { data: StockCountSessionDto }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'StockCountSession', id },
        { type: 'StockCountSession', id: 'LIST' },
      ],
    }),

    submitStockCountSession: builder.mutation<StockCountSessionSubmitResponse, string>({
      query: (id) => ({
        url: `/stock-count-sessions/${encodeURIComponent(id)}/submit`,
        method: 'POST',
      }),
      transformResponse: (r: { data: StockCountSessionSubmitResponse }) => r.data,
      invalidatesTags: (result, error, id) => [
        { type: 'StockCountSession', id },
        { type: 'StockCountSession', id: 'LIST' },
        { type: 'StockExceptionApproval' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'StockBatch', id: 'LIST' },
        { type: 'StockIntegrity' },
      ],
    }),
  }),
});

export const {
  useGetStockCountSessionsQuery,
  useGetStockCountSessionByIdQuery,
  useCreateStockCountSessionMutation,
  useUpdateStockCountSessionMutation,
  useSubmitStockCountSessionMutation,
} = stockCountSessionsApi;
