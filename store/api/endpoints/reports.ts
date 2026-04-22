import { appApi } from '../appApi';

interface Material {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
}

interface StockValuationResponse {
  summary: {
    totalStockValue: number;
    fifoStockValue: number;
    movingAverageStockValue: number;
    currentStockValue: number;
    preferredMethod: 'FIFO';
    prevMonthConsumptionValue: number;
  };
  topMaterialsByValue: Material[];
  topConsumedItems: Material[];
}

interface ConsumptionData {
  month: number;
  year: number;
  totalValue: number;
  itemCount: number;
  items: Material[];
}

interface ConsumptionResponse {
  currentMonth: ConsumptionData | null;
}

interface JobConsumptionRow {
  jobId: string;
  jobNumber: string;
  materialId: string;
  materialName: string;
  unit: string;
  dispatched: number;
  returned: number;
  netConsumed: number;
}

export const reportsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getStockValuation: builder.query<StockValuationResponse, void>({
      query: () => '/reports/stock-valuation',
      transformResponse: (r: { data: StockValuationResponse }) => r.data,
      providesTags: ['StockValuation', 'Material'],
    }),

    getConsumption: builder.query<ConsumptionResponse, void>({
      query: () => '/reports/consumption',
      transformResponse: (r: { data: ConsumptionResponse }) => r.data,
      providesTags: ['Consumption'],
    }),

    getJobConsumption: builder.query<
      JobConsumptionRow[],
      { from?: string; to?: string; jobIds: string[] }
    >({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.from) searchParams.append('from', params.from);
        if (params.to) searchParams.append('to', params.to);
        params.jobIds.forEach((id) => searchParams.append('jobId[]', id));
        return `/reports/job-consumption?${searchParams.toString()}`;
      },
      transformResponse: (r: { data: JobConsumptionRow[] }) => r.data,
      providesTags: ['JobConsumption'],
    }),
  }),
});

export const {
  useGetStockValuationQuery,
  useGetConsumptionQuery,
  useLazyGetJobConsumptionQuery,
} = reportsApi;
