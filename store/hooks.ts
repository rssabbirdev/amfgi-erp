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
  type Company,
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
  useGetJobItemsQuery,
  useAddJobItemMutation,
  useUpdateJobItemMutation,
  useDeleteJobItemMutation,
  useGetFormulaLibrariesQuery,
  useGetFormulaLibraryByIdQuery,
  useCreateFormulaLibraryMutation,
  useUpdateFormulaLibraryMutation,
  useDeleteFormulaLibraryMutation,
  useCalculateJobCostEngineMutation,
  useGetDispatchBudgetWarningMutation,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  type DispatchBudgetWarningResult,
  type DispatchBudgetWarningRow,
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
  useGetJobProfitabilityQuery,
  useGetSupplierTraceabilityQuery,
  useGetInventoryByWarehouseQuery,
  useGetStockIntegrityQuery,
  useGetStockExceptionsQuery,
  useGetStockExceptionApprovalsQuery,
  useGetStockAdjustmentsQuery,
  useGetStockCountSessionsReportQuery,
  useUpdateStockExceptionApprovalMutation,
  type InventoryByWarehouseResponse,
  type InventoryByWarehouseRow,
  type InventoryByWarehouseWarehouseCol,
  type JobProfitabilityResponse,
  type JobProfitabilityRow,
  type StockAdjustmentsResponse,
  type StockAdjustmentRow,
  type StockExceptionApprovalsResponse,
  type StockExceptionApprovalRow,
  type StockCountSessionsReportResponse,
  type StockCountSessionReportRow,
  type StockCountSessionMaterialReportRow,
  type StockCountSessionWarehouseReportRow,
  type StockExceptionsResponse,
  type StockExceptionRow,
  type SupplierTraceabilityResponse,
  type SupplierTraceabilityRow,
  type StockIntegrityResponse,
  type StockIntegrityRow,
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
  useRequestManualStockAdjustmentMutation,
} from './api/endpoints/transactions';

export {
  useGetSuppliersQuery,
  useGetSupplierByIdQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useSyncSuppliersFromPartyApiMutation,
  type Supplier,
} from './api/endpoints/suppliers';

export { useGetDispatchEntriesQuery, type DispatchEntry } from './api/endpoints/dispatch';

export {
  useGetReceiptEntriesQuery,
  useGetReceiptEntryQuery,
  useLazyGetReceiptAdjustmentImpactQuery,
  useDeleteReceiptEntryMutation,
  useCancelReceiptEntryMutation,
  useAdjustReceiptEntryMutation,
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
  useGetStockCountSessionsQuery,
  useGetStockCountSessionByIdQuery,
  useCreateStockCountSessionMutation,
  useUpdateStockCountSessionMutation,
  useSubmitStockCountSessionMutation,
  type StockCountSessionDto,
  type StockCountSessionLineDto,
  type StockCountSessionRevisionDto,
} from './api/endpoints/stockCountSessions';

export {
  useGetMaterialLogsQuery,
  useGetPriceLogsQuery,
  useCreateMaterialLogMutation,
  useCreatePriceLogMutation,
} from './api/endpoints/materialLogs';
