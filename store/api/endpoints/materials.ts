import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

export const MATERIAL_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export type MaterialsListParams = {
  limit: number;
  offset: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

export type MaterialsListResponse = {
  items: Material[];
  total: number;
};

export interface MaterialUomDto {
  id: string;
  unitId: string;
  unitName: string;
  isBase: boolean;
  parentUomId: string | null;
  factorToParent: number;
  factorToBase: number;
}

export interface MaterialWarehouseStockDto {
  warehouseId: string;
  currentStock: number;
}

export interface Material {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  photoGallery?: Array<{ url: string; fileName: string; mimeType: string }>;
  documentFiles?: Array<{ url: string; fileName: string; mimeType: string }>;
  unit: string;
  category?: string;
  categoryId?: string | null;
  warehouse?: string;
  warehouseId?: string | null;
  stockType: string;
  allowNegativeConsumption: boolean;
  externalItemName?: string;
  currentStock: number;
  reorderLevel?: number;
  unitCost?: number;
  assemblyOutputQuantity?: number;
  assemblyOverheadPercent?: number;
  assemblyUseDynamicCost?: boolean;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  materialUoms?: MaterialUomDto[];
  materialWarehouseStocks?: MaterialWarehouseStockDto[];
}

export interface MaterialAssemblyRow {
  id?: string;
  componentMaterialId: string;
  quantity: number;
  componentMaterial?: {
    id: string;
    name: string;
    unit: string;
    unitCost: number;
    isActive: boolean;
  };
  lineCost?: number;
}

export interface MaterialAssembly {
  outputQuantity: number;
  overheadPercent: number;
  components: MaterialAssemblyRow[];
}

export interface StockDashboardStats {
  activeMaterials: number;
  lowStockCount: number;
  openBatches: number;
  totalBatches: number;
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

function normalizeMaterial(material: Material): Material {
  return {
    ...material,
    category: material.category ?? undefined,
    warehouse: material.warehouse ?? undefined,
    externalItemName: material.externalItemName ?? undefined,
  };
}

function normalizeCrossCompanyMaterial(material: CrossCompanyMaterial): CrossCompanyMaterial {
  return {
    ...material,
    warehouse: material.warehouse ?? undefined,
  };
}

export const materialsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getMaterials: builder.query<Material[], void>({
      query: () => '/materials',
      transformResponse: (r: { data: Material[] }) => r.data.map(normalizeMaterial),
      providesTags: (result) =>
        result
          ? [{ type: 'Material', id: 'LIST' }, ...result.map((m) => ({ type: 'Material' as const, id: m.id }))]
          : [{ type: 'Material', id: 'LIST' }],
    }),

    getMaterialsPage: builder.query<MaterialsListResponse, MaterialsListParams>({
      query: ({ limit, offset, search, sortBy, sortDir }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (search?.trim()) params.set('search', search.trim());
        if (sortBy?.trim()) params.set('sortBy', sortBy.trim());
        if (sortDir) params.set('sortDir', sortDir);
        return `/materials?${params.toString()}`;
      },
      transformResponse: (r: { data: MaterialsListResponse }) => ({
        items: r.data.items.map(normalizeMaterial),
        total: r.data.total,
      }),
      providesTags: (result) =>
        result
          ? [
              { type: 'Material', id: 'LIST' },
              ...result.items.map((m) => ({ type: 'Material' as const, id: m.id })),
            ]
          : [{ type: 'Material', id: 'LIST' }],
    }),

    getMaterialsForExport: builder.query<Material[], void>({
      query: () => '/materials',
      transformResponse: (r: { data: Material[] }) => r.data.map(normalizeMaterial),
    }),

    getStockDashboardStats: builder.query<StockDashboardStats, void>({
      query: () => '/stock/dashboard-stats',
      transformResponse: (r: { data: StockDashboardStats }) => r.data,
      providesTags: ['Material', 'StockBatch'],
    }),

    getMaterialById: builder.query<Material, string>({
      query: (id) => `/materials/${id}`,
      transformResponse: (r: { data: Material }) => normalizeMaterial(r.data),
      providesTags: (result, error, id) => [{ type: 'Material', id }],
    }),

    createMaterial: builder.mutation<Material, Partial<Material>>({
      query: (body) => ({
        url: '/materials',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Material }) => normalizeMaterial(r.data),
      invalidatesTags: [{ type: 'Material', id: 'LIST' }],
    }),

    updateMaterial: builder.mutation<Material, { id: string; data: Partial<Material> }>({
      query: ({ id, data }) => ({
        url: `/materials/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Material }) => normalizeMaterial(r.data),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Material', id },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    deleteMaterial: builder.mutation<{ deleted: boolean; deactivated?: boolean }, string>({
      query: (id) => ({
        url: `/materials/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { data?: { deleted: boolean; deactivated?: boolean }; deleted?: boolean }) =>
        r.data ?? { deleted: r.deleted ?? false },
      invalidatesTags: (result, error, id) => [
        { type: 'Material', id },
        { type: 'Material', id: 'LIST' },
        { type: 'StockValuation' },
      ],
    }),

    deactivateMaterial: builder.mutation<{ deactivated: boolean }, string>({
      query: (id) => ({
        url: `/materials/${id}`,
        method: 'DELETE',
        body: { deactivate: true },
      }),
      transformResponse: (r: { data?: { deactivated?: boolean; deleted?: boolean } }) => ({
        deactivated: r.data?.deactivated ?? !r.data?.deleted,
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Material', id },
        { type: 'Material', id: 'LIST' },
        { type: 'StockValuation' },
      ],
    }),

    getCrossCompanyMaterials: builder.query<CrossCompanyMaterial[], string>({
      query: (companyId) => `/materials/cross-company?companyId=${companyId}`,
      transformResponse: (r: { data: CrossCompanyMaterial[] }) => r.data.map(normalizeCrossCompanyMaterial),
    }),

    bulkCreateMaterials: builder.mutation<
      { created: number; updated: number; skipped: number; warnings: string[] },
      { newRows: unknown[]; updateRows: unknown[] }
    >({
      query: (body) => ({
        url: '/materials/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: { created: number; updated: number; skipped: number; warnings: string[] };
      }) => r.data,
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

    getMaterialAssembly: builder.query<MaterialAssembly, string>({
      query: (materialId) => `/materials/${materialId}/assembly`,
      transformResponse: (r: { data: MaterialAssembly }) => r.data,
      providesTags: (result, error, materialId) => [{ type: 'Material', id: materialId }],
    }),

    upsertMaterialAssembly: builder.mutation<
      { saved: boolean },
      {
        materialId: string;
        outputQuantity: number;
        overheadPercent: number;
        components: { componentMaterialId: string; quantity: number }[];
      }
    >({
      query: ({ materialId, ...body }) => ({
        url: `/materials/${materialId}/assembly`,
        method: 'PUT',
        body,
      }),
      transformResponse: (r: { data: { saved: boolean } }) => r.data,
      invalidatesTags: (result, error, { materialId }) => [
        { type: 'Material', id: materialId },
        { type: 'Material', id: 'LIST' },
      ],
    }),

    getMaterialTransactionReport: builder.query<
      {
        material: {
          id: string;
          name: string;
          unit: string;
          externalItemName: string | null;
        };
        dateRangeLabel: string;
        from: string | null;
        to: string | null;
        rows: Array<{
          id: string;
          kind: string;
          date: string;
          sortDate: string;
          kindLabel: string;
          jobNumber: string | null;
          partyName: string | null;
          quantity: number;
          unit: string;
          value: number;
          href: string | null;
          notePreview: string | null;
        }>;
      },
      { materialId: string; from?: string; to?: string }
    >({
      query: ({ materialId, from, to }) => {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const query = params.toString();
        return `/materials/${materialId}/transaction-report${query ? `?${query}` : ''}`;
      },
      transformResponse: (r: {
        data: {
          material: {
            id: string;
            name: string;
            unit: string;
            externalItemName: string | null;
          };
          dateRangeLabel: string;
          from: string | null;
          to: string | null;
          rows: Array<{
            id: string;
            kind: string;
            date: string;
            sortDate: string;
            kindLabel: string;
            jobNumber: string | null;
            partyName: string | null;
            quantity: number;
            unit: string;
            value: number;
            href: string | null;
            notePreview: string | null;
          }>;
        };
      }) => r.data,
      providesTags: (_result, _error, { materialId }) => [{ type: 'Material', id: materialId }, 'Transaction'],
    }),
  }),
});

export const {
  useGetMaterialsQuery,
  useGetMaterialsPageQuery,
  useLazyGetMaterialsPageQuery,
  useLazyGetMaterialsForExportQuery,
  useGetMaterialsForExportQuery,
  useGetStockDashboardStatsQuery,
  useGetMaterialByIdQuery,
  useLazyGetMaterialByIdQuery,
  useCreateMaterialMutation,
  useUpdateMaterialMutation,
  useDeleteMaterialMutation,
  useDeactivateMaterialMutation,
  useGetCrossCompanyMaterialsQuery,
  useBulkCreateMaterialsMutation,
  useCreateMaterialUomMutation,
  useDeleteMaterialUomMutation,
  useGetMaterialAssemblyQuery,
  useUpsertMaterialAssemblyMutation,
  useLazyGetMaterialTransactionReportQuery,
} = materialsApi;
