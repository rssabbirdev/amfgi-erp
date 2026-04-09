import { appApi } from '../appApi';

export interface Unit {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface UnitResponse {
  data?: Unit[] | Unit;
}

export const unitsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getUnits: builder.query<Unit[], void>({
      query: () => '/units',
      transformResponse: (r: Unit[] | UnitResponse) => (Array.isArray(r) ? r : r.data as Unit[] || []),
      providesTags: (result) =>
        result
          ? [{ type: 'Unit', id: 'LIST' }, ...result.map((u) => ({ type: 'Unit' as const, id: u.id }))]
          : [{ type: 'Unit', id: 'LIST' }],
    }),

    createUnit: builder.mutation<Unit, { name: string }>({
      query: (body) => ({
        url: '/units',
        method: 'POST',
        body,
      }),
      transformResponse: (r: Unit | UnitResponse) => (r && 'data' in r ? r.data as Unit : r as Unit),
      invalidatesTags: [{ type: 'Unit', id: 'LIST' }, { type: 'Material', id: 'LIST' }],
    }),

    updateUnit: builder.mutation<Unit, { id: string; name: string }>({
      query: ({ id, ...body }) => ({
        url: `/units/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (r: Unit | UnitResponse) => (r && 'data' in r ? r.data as Unit : r as Unit),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Unit', id },
        { type: 'Unit', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    deleteUnit: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/units/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean } | { data: { deleted: boolean } }) =>
        ('data' in r ? r.data : r),
      invalidatesTags: (result, error, id) => [
        { type: 'Unit', id },
        { type: 'Unit', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
      ],
    }),
  }),
  overrideExisting: true
});

export const {
  useGetUnitsQuery,
  useCreateUnitMutation,
  useUpdateUnitMutation,
  useDeleteUnitMutation,
} = unitsApi;
