import { appApi } from '../appApi';

export interface Category {
  _id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryResponse {
  data?: Category[];
}

export const categoriesApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<Category[], void>({
      query: () => '/categories',
      transformResponse: (r: Category[] | CategoryResponse) => (Array.isArray(r) ? r : (r.data as Category[]) || []),
      providesTags: (result) =>
        result
          ? [{ type: 'Category', id: 'LIST' }, ...result.map((c) => ({ type: 'Category' as const, id: c._id }))]
          : [{ type: 'Category', id: 'LIST' }],
    }),

    createCategory: builder.mutation<Category, { name: string }>({
      query: (body) => ({
        url: '/categories',
        method: 'POST',
        body,
      }),
      transformResponse: (r: any) => (r && '_id' in r ? (r as Category) : ((r.data as Category) || r)),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetCategoriesQuery,
  useCreateCategoryMutation,
} = categoriesApi;
