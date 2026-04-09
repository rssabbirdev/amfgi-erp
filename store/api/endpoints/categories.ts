import { appApi } from '../appApi';

export interface Category {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
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
          ? [{ type: 'Category', id: 'LIST' }, ...result.map((c) => ({ type: 'Category' as const, id: c.id }))]
          : [{ type: 'Category', id: 'LIST' }],
    }),

    createCategory: builder.mutation<Category, { name: string }>({
      query: (body) => ({
        url: '/categories',
        method: 'POST',
        body,
      }),
      transformResponse: (r: any) => (r && '_id' in r ? (r as Category) : ((r.data as Category) || r)),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, { type: 'Material', id: 'LIST' }],
    }),

    updateCategory: builder.mutation<Category, { id: string; name: string }>({
      query: ({ id, ...body }) => ({
        url: `/categories/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (r: Category | { data: Category }) => ('data' in r ? r.data : r),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Category', id },
        { type: 'Category', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    deleteCategory: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/categories/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean } | { data: { deleted: boolean } }) =>
        ('data' in r ? r.data : r),
      invalidatesTags: (result, error, id) => [
        { type: 'Category', id },
        { type: 'Category', id: 'LIST' },
        { type: 'Material', id: 'LIST' },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = categoriesApi;
