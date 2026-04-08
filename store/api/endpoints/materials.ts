import { appApi } from '../appApi';

interface Material {
  _id: string;
  name: string;
  description?: string;
  unit: string;
  category: string;
  warehouse: string;
  stockType: string;
  externalItemName: string;
  currentStock: number;
  reorderLevel: number;
  unitCost: number;
  isActive: boolean;
  createdAt: Date;
}

interface CrossCompanyMaterial {
  _id: string;
  name: string;
  unit: string;
  currentStock: number;
  isActive: boolean;
}

export const materialsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getMaterials: builder.query<Material[], void>({
      query: () => '/materials',
      transformResponse: (r: { data: Material[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Material', id: 'LIST' }, ...result.map((m) => ({ type: 'Material' as const, id: m._id }))]
          : [{ type: 'Material', id: 'LIST' }],
    }),

    getMaterialById: builder.query<Material, string>({
      query: (id) => `/materials/${id}`,
      transformResponse: (r: { data: Material }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Material', id }],
    }),

    createMaterial: builder.mutation<Material, Partial<Material>>({
      query: (body) => ({
        url: '/materials',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Material }) => r.data,
      invalidatesTags: [{ type: 'Material', id: 'LIST' }],
    }),

    updateMaterial: builder.mutation<Material, { id: string; data: Partial<Material> }>({
      query: ({ id, data }) => ({
        url: `/materials/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Material }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Material', id },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    deleteMaterial: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/materials/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean }) => r,
      invalidatesTags: (result, error, id) => [
        { type: 'Material', id },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    getCrossCompanyMaterials: builder.query<CrossCompanyMaterial[], string>({
      query: (companyId) => `/materials/cross-company?companyId=${companyId}`,
      transformResponse: (r: { data: CrossCompanyMaterial[] }) => r.data,
    }),
  }),
});

export const {
  useGetMaterialsQuery,
  useGetMaterialByIdQuery,
  useCreateMaterialMutation,
  useUpdateMaterialMutation,
  useDeleteMaterialMutation,
  useGetCrossCompanyMaterialsQuery,
} = materialsApi;
