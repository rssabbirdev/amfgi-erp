import { appApi } from '../appApi';

export interface DispatchEntry {
  id: string;
  _id?: string;
  entryId: string;
  jobId: string;
  jobNumber: string;
  jobDescription?: string;
  jobContactPerson?: string;
  jobContactsJson?: unknown;
  dispatchDate: string | Date;
  totalQuantity: number;
  totalValuation: number;
  materialsCount: number;
  notes?: string;
  isDeliveryNote?: boolean;
  signedCopyUrl?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdBySignatureUrl?: string;
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
