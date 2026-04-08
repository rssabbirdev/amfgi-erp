import { adminApi } from '../adminApi';

interface CompanyProfile {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  isActive?: boolean;
}

export const profilesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getCompanyProfiles: builder.query<CompanyProfile[], void>({
      query: () => '/company-profiles',
      transformResponse: (r: { data: CompanyProfile[] }) => r.data,
      providesTags: [{ type: 'CompanyProfile', id: 'LIST' }],
    }),

    createCompanyProfile: builder.mutation<CompanyProfile, Partial<CompanyProfile>>({
      query: (body) => ({
        url: '/company-profiles',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: CompanyProfile }) => r.data,
      invalidatesTags: [{ type: 'CompanyProfile', id: 'LIST' }],
    }),
  }),
});

export const { useGetCompanyProfilesQuery, useCreateCompanyProfileMutation } = profilesApi;
