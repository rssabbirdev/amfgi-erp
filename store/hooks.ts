import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector);

// ============================================================================
// RTK Query Hooks — re-exported here for convenience
// Organized by domain: appApi (company-scoped) and adminApi (cross-company)
// ============================================================================

// Admin API hooks (cross-company)
export {
  useGetCompaniesQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
} from './api/adminEndpoints/companies';

export { useGetUsersQuery, useCreateUserMutation, useUpdateUserMutation } from './api/adminEndpoints/users';

export {
  useGetRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} from './api/adminEndpoints/roles';

export {
  useGetCompanyProfilesQuery,
  useCreateCompanyProfileMutation,
} from './api/adminEndpoints/profiles';

// App API hooks (company-scoped)
export {
  useGetMaterialsQuery,
  useGetMaterialByIdQuery,
  useCreateMaterialMutation,
  useUpdateMaterialMutation,
  useDeleteMaterialMutation,
  useGetCrossCompanyMaterialsQuery,
  useBulkCreateMaterialsMutation,
  useCreateMaterialUomMutation,
  useDeleteMaterialUomMutation,
  type Material,
  type MaterialUomDto,
} from './api/endpoints/materials';

export {
  useGetStockBatchesQuery,
  type StockBatch,
} from './api/endpoints/stockBatches';

export {
  useGetJobsQuery,
  useGetJobByIdQuery,
  useGetJobMaterialsQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
} from './api/endpoints/jobs';

export {
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useSyncCustomersFromPartyApiMutation,
  type Customer,
  type PartyRecordSource,
} from './api/endpoints/customers';

export {
  useGetStockValuationQuery,
  useGetConsumptionQuery,
  useLazyGetJobConsumptionQuery,
} from './api/endpoints/reports';

export {
  useGetTransactionsByJobQuery,
  useAddTransactionMutation,
  useAddBatchTransactionMutation,
  useDeleteTransactionMutation,
  useTransferStockMutation,
  useGetTransferLedgerQuery,
  useGetDispatchEntryQuery,
  useGetNonStockReconcileDataQuery,
  useReconcileNonStockMutation,
} from './api/endpoints/transactions';

export {
  useGetSuppliersQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useSyncSuppliersFromPartyApiMutation,
  type Supplier,
} from './api/endpoints/suppliers';

export { useGetDispatchEntriesQuery } from './api/endpoints/dispatch';

export {
  useGetReceiptEntriesQuery,
  useGetReceiptEntryQuery,
  useDeleteReceiptEntryMutation,
} from './api/endpoints/receipts';

export {
  useGetUnitsQuery,
  useCreateUnitMutation,
  useUpdateUnitMutation,
  useDeleteUnitMutation,
  type Unit,
} from './api/endpoints/units';

export {
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  type Category,
} from './api/endpoints/categories';

export {
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
  useDeleteWarehouseMutation,
  type Warehouse,
} from './api/endpoints/warehouses';

export {
  useGetMaterialLogsQuery,
  useGetPriceLogsQuery,
  useCreateMaterialLogMutation,
  useCreatePriceLogMutation,
} from './api/endpoints/materialLogs';
