import { appApi } from '../appApi';

export interface ReceiptMaterial {
  materialId: string;
  materialName: string;
  unit: string;
  quantityReceived: number;
  quantityAvailable: number;
  unitCost: number;
  totalCost: number;
  batchNumber: string;
}

export interface ReceiptEntry {
  id: string;
  receiptNumber: string;
  receivedDate: Date;
  supplier?: string;
  notes?: string;
  itemsCount: number;
  totalValue: number;
  materials: ReceiptMaterial[];
}

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

    getReceiptEntry: builder.query<ReceiptEntry, string>({
      query: (receiptNumber) =>
        `/materials/receipt-history-entries/${encodeURIComponent(receiptNumber)}`,
      transformResponse: (r: { data: ReceiptEntry }) => r.data,
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
      ],
    }),
  }),
});

export const {
  useGetReceiptEntriesQuery,
  useGetReceiptEntryQuery,
  useDeleteReceiptEntryMutation,
} = receiptsApi;
