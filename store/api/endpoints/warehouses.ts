import { appApi } from '../appApi';

export interface Warehouse {
  id: string;
  companyId: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface WarehouseResponse {
  data?: Warehouse[];
}

interface WarehouseMutationResponse {
  data?: Warehouse;
}

export const warehousesApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getWarehouses: builder.query<Warehouse[], string | void>({
      query: (companyId) => (companyId ? `/warehouses?companyId=${companyId}` : '/warehouses'),
      transformResponse: (r: Warehouse[] | WarehouseResponse) => (Array.isArray(r) ? r : (r.data as Warehouse[]) || []),
      providesTags: (result) =>
        result
          ? [{ type: 'Warehouse', id: 'LIST' }, ...result.map((w) => ({ type: 'Warehouse' as const, id: w.id }))]
          : [{ type: 'Warehouse', id: 'LIST' }],
    }),

    createWarehouse: builder.mutation<Warehouse, { name: string; location?: string }>({
      query: (body) => ({
        url: '/warehouses',
        method: 'POST',
        body,
      }),
      transformResponse: (r: Warehouse | WarehouseMutationResponse) => ('data' in r ? (r.data as Warehouse) : (r as Warehouse)),
      invalidatesTags: [{ type: 'Warehouse', id: 'LIST' }, { type: 'Material', id: 'LIST' }],
    }),

    updateWarehouse: builder.mutation<Warehouse, { id: string; name: string; location?: string }>({
      query: ({ id, ...body }) => ({
        url: `/warehouses/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (r: Warehouse | { data: Warehouse }) => ('data' in r ? r.data : r),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Warehouse', id },
        { type: 'Warehouse', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    deleteWarehouse: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/warehouses/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean } | { data: { deleted: boolean } }) =>
        ('data' in r ? r.data : r),
      invalidatesTags: (result, error, id) => [
        { type: 'Warehouse', id },
        { type: 'Warehouse', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
  useDeleteWarehouseMutation,
} = warehousesApi;
