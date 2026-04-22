import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const appApi = createApi({
  reducerPath: 'appApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: [
    'Material',
    'StockBatch',
    'Job',
    'JobMaterials',
    'Customer',
    'Supplier',
    'Transaction',
    'DispatchEntry',
    'ReceiptEntry',
    'StockValuation',
    'Consumption',
    'JobConsumption',
    'Unit',
    'Category',
    'Warehouse',
    'MaterialLog',
    'PriceLog',
  ],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
