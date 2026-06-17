import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';
import { STOCK_LEDGER_INVALIDATES } from '../stockInvalidation';

export const DISPATCH_ENTRY_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export interface DispatchEntry {
  id: string;
  _id?: string;
  entryId: string;
  jobId: string;
  jobNumber: string;
  jobDescription?: string;
  customerName?: string;
  jobContactPerson?: string;
  jobContactsJson?: unknown;
  dispatchDate: string | Date;
  /** Latest creation time among grouped rows (or delivery note createdAt for print-only notes). */
  ledgerCreatedAt?: string | Date;
  totalQuantity: number;
  totalValuation: number;
  materialsCount: number;
  notes?: string;
  isDeliveryNote?: boolean;
  deliveryNoteId?: string;
  deliveryNoteNumber?: number | null;
  deliveryNoteContactPerson?: string;
  documentNotes?: string | null;
  customItemsJson?: unknown;
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
  deliveryType?: 'DISPATCH' | 'SUBCONTRACT';
  transitStatus?: 'ON_TRANSIT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | null;
  supplierId?: string;
  supplierName?: string;
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

    getDispatchEntriesPage: builder.query<
      { entries: DispatchEntry[]; total: number; dateRange?: unknown },
      {
        filterType?: string;
        date?: string;
        limit?: number;
        offset?: number;
        noteType?: 'all' | 'dispatch' | 'delivery' | 'transit';
        search?: string;
        jobSearch?: string;
        deliveryNoteSearch?: string;
      }
    >({
      query: ({ filterType = 'all', date, limit, offset, noteType, search, jobSearch, deliveryNoteSearch }) => {
        const params = new URLSearchParams();
        params.set('filterType', filterType);
        if (date) params.set('date', date);
        if (limit != null) params.set('limit', String(limit));
        if (offset != null) params.set('offset', String(offset));
        if (noteType && noteType !== 'all') params.set('noteType', noteType);
        if (search?.trim()) params.set('search', search.trim());
        else {
          if (jobSearch?.trim()) params.set('jobSearch', jobSearch.trim());
          if (deliveryNoteSearch?.trim()) params.set('deliveryNoteSearch', deliveryNoteSearch.trim());
        }
        return `/materials/dispatch-history-entries?${params.toString()}`;
      },
      transformResponse: (r: { data: { entries: DispatchEntry[]; total: number; dateRange?: unknown } }) => r.data,
      providesTags: [{ type: 'DispatchEntry' }],
      keepUnusedDataFor: 600,
    }),

    receiveDeliveryNote: builder.mutation<
      { deliveryNoteId: string; transitStatus: string | null; lines: unknown[] },
      { id: string; lines: Array<{ lineId: string; receiveQty: number; destinationWarehouseId?: string }>; notes?: string; date?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/delivery-notes/${encodeURIComponent(id)}/receive`,
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: { deliveryNoteId: string; transitStatus: string | null; lines: unknown[] } }) =>
        r.data,
      invalidatesTags: STOCK_LEDGER_INVALIDATES,
    }),

    deleteDeliveryNote: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/delivery-notes/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: STOCK_LEDGER_INVALIDATES,
    }),
  }),
});

export const {
  useGetDispatchEntriesQuery,
  useGetDispatchEntriesPageQuery,
  useReceiveDeliveryNoteMutation,
  useDeleteDeliveryNoteMutation,
} = dispatchApi;
