import { appApi } from '../appApi';

import type { PartyListSyncResult, PartyRecordSource } from './customers';

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  isActive: boolean;
  source?: PartyRecordSource;
  externalPartyId?: number | null;
  externalSyncedAt?: string | Date | null;
  tradeLicenseNumber?: string | null;
  tradeLicenseAuthority?: string | null;
  tradeLicenseExpiry?: string | Date | null;
  trnNumber?: string | null;
  trnExpiry?: string | Date | null;
  contactsJson?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const suppliersApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getSuppliers: builder.query<Supplier[], void>({
      query: () => '/suppliers',
      transformResponse: (r: { data: Supplier[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Supplier', id: 'LIST' }, ...result.map((s) => ({ type: 'Supplier' as const, id: s.id }))]
          : [{ type: 'Supplier', id: 'LIST' }],
    }),

    getSupplierById: builder.query<Supplier, string>({
      query: (id) => `/suppliers/${id}`,
      transformResponse: (r: { data: Supplier }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Supplier', id }],
    }),

    createSupplier: builder.mutation<Supplier, Partial<Supplier>>({
      query: (body) => ({
        url: '/suppliers',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Supplier }) => r.data,
      invalidatesTags: [{ type: 'Supplier', id: 'LIST' }],
    }),

    updateSupplier: builder.mutation<Supplier, { id: string; data: Partial<Supplier> }>({
      query: ({ id, data }) => ({
        url: `/suppliers/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Supplier }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),

    deleteSupplier: builder.mutation<
      { deleted: boolean; permanent?: boolean; message?: string },
      string
    >({
      query: (id) => ({
        url: `/suppliers/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean; permanent?: boolean; message?: string } }) =>
        r.data,
      invalidatesTags: (result, error, id) => [
        { type: 'Supplier', id },
        { type: 'Supplier', id: 'LIST' },
      ],
    }),

    syncSuppliersFromPartyApi: builder.mutation<PartyListSyncResult, void>({
      query: () => ({
        url: '/suppliers/sync',
        method: 'POST',
      }),
      transformResponse: (r: { data: PartyListSyncResult }) => r.data,
      invalidatesTags: [{ type: 'Supplier', id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetSuppliersQuery,
  useGetSupplierByIdQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useSyncSuppliersFromPartyApiMutation,
} = suppliersApi;
