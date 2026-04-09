import { adminApi } from '../adminApi';

interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export const companiesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getCompanies: builder.query<Company[], void>({
      query: () => '/companies',
      transformResponse: (r: { data: Company[] }) => r.data,
      providesTags: [{ type: 'Company', id: 'LIST' }, ...([] as any[])],
    }),

    createCompany: builder.mutation<Company, Partial<Company>>({
      query: (body) => ({
        url: '/companies',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Company }) => r.data,
      invalidatesTags: [{ type: 'Company', id: 'LIST' }],
    }),

    updateCompany: builder.mutation<Company, { id: string; data: Partial<Company> }>({
      query: ({ id, data }) => ({
        url: `/companies/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Company }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Company', id },
        { type: 'Company', id: 'LIST' },
      ],
    }),
  }),
});

export const { useGetCompaniesQuery, useCreateCompanyMutation, useUpdateCompanyMutation } =
  companiesApi;
