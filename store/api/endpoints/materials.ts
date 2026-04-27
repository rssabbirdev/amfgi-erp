import { appApi } from '../appApi';

export interface MaterialUomDto {
  id: string;
  unitId: string;
  unitName: string;
  isBase: boolean;
  parentUomId: string | null;
  factorToParent: number;
  factorToBase: number;
}

export interface Material {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  unit: string;
  category: string;
  warehouse: string;
  warehouseId?: string | null;
  stockType: string;
  allowNegativeConsumption: boolean;
  externalItemName: string;
  currentStock: number;
  reorderLevel?: number;
  unitCost?: number;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  materialUoms?: MaterialUomDto[];
}

interface CrossCompanyMaterial {
  id: string;
  name: string;
  unit: string;
  warehouse?: string;
  warehouseId?: string | null;
  allowNegativeConsumption?: boolean;
  currentStock: number;
  isActive: boolean;
  materialUoms?: MaterialUomDto[];
}

export const materialsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getMaterials: builder.query<Material[], void>({
      query: () => '/materials',
      transformResponse: (r: { data: Material[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Material', id: 'LIST' }, ...result.map((m) => ({ type: 'Material' as const, id: m.id }))]
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

    bulkCreateMaterials: builder.mutation<
      { created: number; updated: number },
      { newRows: Partial<Material>[]; updateRows: Partial<Material>[] }
    >({
      query: (body) => ({
        url: '/materials/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: { created: number; updated: number } }) => r.data,
      invalidatesTags: [{ type: 'Material', id: 'LIST' }],
    }),

    createMaterialUom: builder.mutation<
      MaterialUomDto,
      { materialId: string; body: Record<string, unknown> }
    >({
      query: ({ materialId, body }) => ({
        url: `/materials/${materialId}/uoms`,
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: MaterialUomDto }) => r.data,
      invalidatesTags: (r, e, { materialId }) => [
        { type: 'Material', id: materialId },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    deleteMaterialUom: builder.mutation<{ deleted: boolean }, { materialId: string; uomId: string }>({
      query: ({ materialId, uomId }) => ({
        url: `/materials/${materialId}/uoms/${uomId}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data: { deleted: boolean } }) => r.data,
      invalidatesTags: (r, e, { materialId }) => [
        { type: 'Material', id: materialId },
        { type: 'Material', id: 'LIST' },
      ],
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
  useBulkCreateMaterialsMutation,
  useCreateMaterialUomMutation,
  useDeleteMaterialUomMutation,
} = materialsApi;
