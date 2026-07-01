import { adminApi } from '../adminApi';

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  externalCompanyId?: string | null;
  isActive: boolean;
  warehouseMode?: 'REQUIRED';
  stockFallbackWarehouseId?: string | null;
  stockFallbackWarehouse?: {
    id: string;
    name: string;
  } | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  canDelete?: boolean;
}

export type GetCompaniesArg = void | { includeInactive?: boolean };

const GET_COMPANIES_CACHE_ARGS: GetCompaniesArg[] = [undefined, { includeInactive: true }];

function patchGetCompaniesCaches(
  dispatch: (action: ReturnType<typeof companiesApi.util.updateQueryData>) => { undo: () => void },
  patcher: (draft: Company[]) => void,
) {
  const patches: Array<{ undo: () => void }> = [];

  for (const arg of GET_COMPANIES_CACHE_ARGS) {
    try {
      patches.push(dispatch(companiesApi.util.updateQueryData('getCompanies', arg, patcher)));
    } catch {
      /* cache entry may not exist yet */
    }
  }

  return () => {
    for (const patch of patches) {
      patch.undo();
    }
  };
}

export const companiesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getCompanies: builder.query<Company[], GetCompaniesArg>({
      query: (arg) => {
        const includeInactive =
          arg && typeof arg === 'object' && arg.includeInactive ? '?includeInactive=1' : '';
        return `/companies${includeInactive}`;
      },
      transformResponse: (r: { data: Company[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Company', id: 'LIST' }, ...result.map((company) => ({ type: 'Company' as const, id: company.id }))]
          : [{ type: 'Company', id: 'LIST' }],
    }),

    createCompany: builder.mutation<Company, Partial<Company>>({
      query: (body) => ({
        url: '/companies',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Company }) => r.data,
      invalidatesTags: [],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data: created } = await queryFulfilled;
          patchGetCompaniesCaches(dispatch, (draft) => {
            if (!draft.some((c) => c.id === created.id)) draft.unshift(created);
          });
        } catch {
          /* no-op */
        }
      },
    }),

    updateCompany: builder.mutation<Company, { id: string; data: Partial<Company> }>({
      query: ({ id, data }) => ({
        url: `/companies/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Company }) => r.data,
      invalidatesTags: [],
      async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
        const undo = patchGetCompaniesCaches(dispatch, (draft) => {
          const row = draft.find((c) => c.id === id);
          if (!row) return;
          if (data.name !== undefined) row.name = data.name;
          if (data.description !== undefined) row.description = data.description;
          if (data.externalCompanyId !== undefined) row.externalCompanyId = data.externalCompanyId;
          if (data.isActive !== undefined) row.isActive = data.isActive;
          if (data.slug !== undefined) row.slug = data.slug;
          if (data.warehouseMode !== undefined) row.warehouseMode = data.warehouseMode;
          if (data.stockFallbackWarehouseId !== undefined) {
            row.stockFallbackWarehouseId = data.stockFallbackWarehouseId;
          }
        });

        try {
          const { data: server } = await queryFulfilled;
          patchGetCompaniesCaches(dispatch, (draft) => {
            const idx = draft.findIndex((c) => c.id === id);
            if (idx !== -1) draft[idx] = server;
          });
        } catch {
          undo();
        }
      },
    }),

    deleteCompany: builder.mutation<{ deleted: true; id: string }, string>({
      query: (id) => ({
        url: `/companies/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: true; id: string } }) => r.data,
      invalidatesTags: [],
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const undo = patchGetCompaniesCaches(dispatch, (draft) => {
          const idx = draft.findIndex((c) => c.id === id);
          if (idx !== -1) draft.splice(idx, 1);
        });

        try {
          await queryFulfilled;
        } catch {
          undo();
        }
      },
    }),
  }),
});

export const {
  useGetCompaniesQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useDeleteCompanyMutation,
} = companiesApi;
