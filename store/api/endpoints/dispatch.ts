import { appApi } from '../appApi';

interface DispatchEntry {
  id: string;
  entryId: string;
  jobId: string;
  jobNumber: string;
  jobDescription?: string;
  dispatchDate: Date;
  totalQuantity: number;
  materialsCount: number;
  materials: Array<{
    materialId: string;
    materialName: string;
    materialUnit: string;
    warehouseId?: string | null;
    warehouseName?: string | null;
    quantity: number;
    unitCost: number;
    transactionIds: string[];
  }>;
  transactionIds: string[];
  transactionCount: number;
}

export const dispatchApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getDispatchEntries: builder.query<
      { entries: DispatchEntry[] },
      { filterType?: string; date?: string }
    >({
      query: ({ filterType = 'ALL', date } = {}) => {
        const params = new URLSearchParams();
        params.append('filterType', filterType);
        if (date) params.append('date', date);
        return `/materials/dispatch-history-entries?${params.toString()}`;
      },
      transformResponse: (r: { data: { entries: DispatchEntry[] } }) => r.data,
      providesTags: [{ type: 'DispatchEntry' }],
    }),
  }),
});

export const { useGetDispatchEntriesQuery } = dispatchApi;
