import { appApi } from '../appApi';

export type PartyRecordSource = 'LOCAL' | 'PARTY_API_SYNC';

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
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

export type PartyListSyncResult = {
  ok: boolean;
  totalFromApi: number;
  created: number;
  updated: number;
};

export const customersApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCustomers: builder.query<Customer[], void>({
      query: () => '/customers',
      transformResponse: (r: { data: Customer[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Customer', id: 'LIST' }, ...result.map((c) => ({ type: 'Customer' as const, id: c.id }))]
          : [{ type: 'Customer', id: 'LIST' }],
    }),

    createCustomer: builder.mutation<Customer, Partial<Customer>>({
      query: (body) => ({
        url: '/customers',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Customer }) => r.data,
      invalidatesTags: [{ type: 'Customer', id: 'LIST' }],
    }),

    updateCustomer: builder.mutation<Customer, { id: string; data: Partial<Customer> }>({
      query: ({ id, data }) => ({
        url: `/customers/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Customer }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Customer', id },
        { type: 'Customer', id: 'LIST' },
      ],
    }),

    deleteCustomer: builder.mutation<
      { deleted: boolean; permanent?: boolean; message?: string },
      string
    >({
      query: (id) => ({
        url: `/customers/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean; permanent?: boolean; message?: string } }) =>
        r.data,
      invalidatesTags: (result, error, id) => [
        { type: 'Customer', id },
        { type: 'Customer', id: 'LIST' },
      ],
    }),

    syncCustomersFromPartyApi: builder.mutation<PartyListSyncResult, void>({
      query: () => ({
        url: '/customers/sync',
        method: 'POST',
      }),
      transformResponse: (r: { data: PartyListSyncResult }) => r.data,
      invalidatesTags: [{ type: 'Customer', id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useSyncCustomersFromPartyApiMutation,
} = customersApi;
