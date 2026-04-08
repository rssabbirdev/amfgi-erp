import { appApi } from '../appApi';

interface DispatchEntry {
  _id: string;
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
    unit: string;
    dispatchQty: number;
    returnQty: number;
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
