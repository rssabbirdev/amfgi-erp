import { appApi } from '../appApi';

export interface MaterialLog {
  _id: string;
  materialId: string;
  action: 'created' | 'updated';
  changes: Record<string, any>;
  changedBy: string;
  timestamp: Date;
}

export interface PriceLog {
  _id: string;
  materialId: string;
  previousPrice: number;
  currentPrice: number;
  source: 'manual' | 'bill';
  changedBy: string;
  billId?: string;
  notes?: string;
  timestamp: Date;
}

export const materialLogsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getMaterialLogs: builder.query<MaterialLog[], string>({
      query: (materialId) => `/materials/${materialId}/logs`,
      transformResponse: (r: any) => (Array.isArray(r) ? r : r.data || []),
      providesTags: (result, error, materialId) =>
        result
          ? [{ type: 'MaterialLog', id: materialId }]
          : [{ type: 'MaterialLog', id: materialId }],
    }),

    getPriceLogs: builder.query<PriceLog[], string>({
      query: (materialId) => `/materials/${materialId}/price-logs`,
      transformResponse: (r: any) => (Array.isArray(r) ? r : r.data || []),
      providesTags: (result, error, materialId) =>
        result
          ? [{ type: 'PriceLog', id: materialId }]
          : [{ type: 'PriceLog', id: materialId }],
    }),

    createMaterialLog: builder.mutation<MaterialLog, any>({
      query: (body) => ({
        url: '/materials/logs',
        method: 'POST',
        body,
      }),
      transformResponse: (r: any) => (r && '_id' in r ? r : r.data || r),
      invalidatesTags: (result, error, arg) => [{ type: 'MaterialLog', id: arg.materialId }],
    }),

    createPriceLog: builder.mutation<any, any>({
      query: (body) => ({
        url: '/materials/price-logs',
        method: 'POST',
        body,
      }),
      transformResponse: (r: any) => (r && '_id' in r ? r : r.data || r),
      invalidatesTags: (result, error, arg) => [{ type: 'PriceLog', id: arg.materialId }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetMaterialLogsQuery,
  useGetPriceLogsQuery,
  useCreateMaterialLogMutation,
  useCreatePriceLogMutation,
} = materialLogsApi;
