import { appApi } from '../appApi';

export interface Warehouse {
  _id: string;
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface WarehouseResponse {
  data?: Warehouse[];
}

export const warehousesApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getWarehouses: builder.query<Warehouse[], void>({
      query: () => '/warehouses',
      transformResponse: (r: Warehouse[] | WarehouseResponse) => (Array.isArray(r) ? r : (r.data as Warehouse[]) || []),
      providesTags: (result) =>
        result
          ? [{ type: 'Warehouse', id: 'LIST' }, ...result.map((w) => ({ type: 'Warehouse' as const, id: w._id }))]
          : [{ type: 'Warehouse', id: 'LIST' }],
    }),

    createWarehouse: builder.mutation<Warehouse, { name: string; location?: string }>({
      query: (body) => ({
        url: '/warehouses',
        method: 'POST',
        body,
      }),
      transformResponse: (r: any) => (r && '_id' in r ? (r as Warehouse) : ((r.data as Warehouse) || r)),
      invalidatesTags: [{ type: 'Warehouse', id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
} = warehousesApi;
