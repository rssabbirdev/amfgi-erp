import { appApi } from '../appApi';

export interface StockBatch {
  id: string;
  batchNumber: string;
  receiptNumber: string | null;
  materialId: string;
  materialName: string;
  materialUnit: string;
  warehouseId: string | null;
  warehouse: string | null;
  stockType: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  quantityConsumed: number;
  unitCost: number;
  totalCost: number;
  receivedDate: string;
  expiryDate: string | null;
  notes: string | null;
  issueLinkCount: number;
  latestUsageDate: string | null;
}

export const stockBatchesApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getStockBatches: builder.query<StockBatch[], void>({
      query: () => '/stock-batches',
      transformResponse: (r: { data: StockBatch[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'StockBatch', id: 'LIST' }, ...result.map((batch) => ({ type: 'StockBatch' as const, id: batch.id }))]
          : [{ type: 'StockBatch', id: 'LIST' }],
    }),
  }),
});

export const { useGetStockBatchesQuery } = stockBatchesApi;
