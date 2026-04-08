import { appApi } from '../appApi';

export interface Unit {
  _id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
          ? [{ type: 'Unit', id: 'LIST' }, ...result.map((u) => ({ type: 'Unit' as const, id: u._id }))]
          : [{ type: 'Unit', id: 'LIST' }],
    }),

    createUnit: builder.mutation<Unit, { name: string }>({
      query: (body) => ({
        url: '/units',
        method: 'POST',
        body,
      }),
      transformResponse: (r: Unit | UnitResponse) => (r && '_id' in r ? r as Unit : (r.data as Unit) || r),
      invalidatesTags: [{ type: 'Unit', id: 'LIST' }],
    }),
  }),
  overrideExisting: true
});

export const {
  useGetUnitsQuery,
  useCreateUnitMutation,
} = unitsApi;
