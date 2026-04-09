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
  type: 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'REVERSAL';
  materialId: string;
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
  jobId?: string;
  delta?: number;
  notes?: string;
}

interface TransferPayload {
  sourceCompanyId?: string;
  materialId: string;
  quantity: number;
  destinationCompanyId: string;
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
        { type: 'JobMaterials', id: arg.jobId || 'LIST' },
        { type: 'Material', id: arg.materialId },
      ],
    }),

    addBatchTransaction: builder.mutation<
      { created: number; ids: string[] },
      any
    >({
      query: (body) => ({
        url: '/transactions/batch',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: { created: number; ids: string[] } }) => r.data,
      invalidatesTags: [
        { type: 'Material', id: 'LIST' },
        { type: 'Transaction', id: 'LIST' },
        { type: 'DispatchEntry' },
        { type: 'JobMaterials' },
      ],
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
      ],
    }),

    transferStock: builder.mutation<TransferResult, TransferPayload>({
      query: (body) => ({
        url: '/transactions/transfer',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: TransferResult }) => r.data,
      invalidatesTags: [{ type: 'Material', id: 'LIST' }],
    }),

    getDispatchEntry: builder.query<
      {
        exists: boolean;
        lines: any[];
        transactionIds: string[];
        notes: string;
      },
      { jobId: string; date: string }
    >({
      query: ({ jobId, date }) =>
        `/transactions/dispatch-entry?jobId=${jobId}&date=${date}`,
      transformResponse: (r: {
        data: {
          exists: boolean;
          lines: any[];
          transactionIds: string[];
          notes: string;
        };
      }) => r.data,
      providesTags: [{ type: 'DispatchEntry' }],
    }),
  }),
});

export const {
  useGetTransactionsByJobQuery,
  useAddTransactionMutation,
  useAddBatchTransactionMutation,
  useDeleteTransactionMutation,
  useTransferStockMutation,
  useGetDispatchEntryQuery,
} = transactionsApi;
