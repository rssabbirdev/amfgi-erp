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

export {
  useGetUsersQuery,
  useGetUsersPageQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  USER_PAGE_SIZE_OPTIONS,
  type UsersListParams,
  type User,
} from './api/adminEndpoints/users';

export {
  useGetRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} from './api/adminEndpoints/roles';

export {
  useGetCompanyProfilesQuery,
  useCreateCompanyProfileMutation,
  type CompanyProfile,
} from './api/adminEndpoints/profiles';

// App API hooks (company-scoped)
export {
  useGetMaterialsQuery,
  useGetMaterialsPageQuery,
  useLazyGetMaterialsPageQuery,
  useLazyGetMaterialsForExportQuery,
  useGetMaterialsForExportQuery,
  useGetStockDashboardStatsQuery,
  MATERIAL_PAGE_SIZE_OPTIONS,
  useGetMaterialByIdQuery,
  useLazyGetMaterialByIdQuery,
  useCreateMaterialMutation,
  useUpdateMaterialMutation,
  useDeleteMaterialMutation,
  useGetCrossCompanyMaterialsQuery,
  useBulkCreateMaterialsMutation,
  useCreateMaterialUomMutation,
  useDeleteMaterialUomMutation,
  useGetMaterialAssemblyQuery,
  useUpsertMaterialAssemblyMutation,
  type Material,
  type MaterialUomDto,
  type MaterialAssembly,
  type MaterialAssemblyRow,
  type StockDashboardStats,
} from './api/endpoints/materials';

export {
  useGetStockBatchesQuery,
  useGetStockBatchesPageQuery,
  STOCK_BATCH_PAGE_SIZE_OPTIONS,
  type StockBatch,
} from './api/endpoints/stockBatches';

export {
  useGetJobsQuery,
  useGetJobsPageQuery,
  useLazyGetJobsForExportQuery,
  JOB_PAGE_SIZE_OPTIONS,
  useGetJobByIdQuery,
  useGetJobMaterialsQuery,
  useGetJobItemsQuery,
  useAddJobItemMutation,
  useUpdateJobItemMutation,
  useDeleteJobItemMutation,
  useGetJobItemProgressEntriesQuery,
  useGetJobProgressEntriesForJobQuery,
  useAddJobItemProgressEntryMutation,
  useUpdateJobItemProgressEntryMutation,
  useDeleteJobItemProgressEntryMutation,
  useGetDailyQuantityLogQuery,
  useGetDailyQuantityLogPendingQuery,
  useGetDailyQuantityLogPendingPageQuery,
  useFinalizeQuantityLogDayMutation,
  useUnlockQuantityLogDayMutation,
  useAddQuantityLogAdhocJobMutation,
  useRemoveQuantityLogAdhocJobMutation,
  useGetFormulaLibrariesQuery,
  useGetFormulaLibraryByIdQuery,
  useCreateFormulaLibraryMutation,
  useUpdateFormulaLibraryMutation,
  useDeleteFormulaLibraryMutation,
  useGetFormulaLibraryVersionsQuery,
  useRestoreFormulaLibraryVersionMutation,
  useCalculateJobCostEngineMutation,
  useGetJobCostingSnapshotsQuery,
  useGetJobCostingSnapshotByIdQuery,
  useCreateJobCostingSnapshotMutation,
  useApproveJobCostingSnapshotMutation,
  useRenameJobCostingSnapshotMutation,
  useDeleteJobCostingSnapshotMutation,
  useGetDispatchBudgetWarningMutation,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  useBulkImportParentJobsMutation,
  useBulkImportJobVariationsMutation,
  type DispatchBudgetWarningResult,
  type DispatchBudgetWarningRow,
  type JobItemProgressEntry,
  type JobProgressEntryListRow,
  type DailyQuantityLogResponse,
  type DailyQuantityLogAssignment,
  type DailyQuantityLogTeam,
  type DailyQuantityLogItem,
  type DailyQuantityLogTracker,
  type DailyQuantityLogExistingEntry,
  type DailyQuantityLogJob,
  type DailyQuantityLogEligibleJob,
} from './api/endpoints/jobs';

export {
  useGetCustomersQuery,
  useGetCustomersPageQuery,
  useLazyGetCustomersForExportQuery,
  useGetCustomersForExportQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useSyncCustomersFromPartyApiMutation,
  useBulkImportCustomersMutation,
  CUSTOMER_PAGE_SIZE_OPTIONS,
  type Customer,
  type CustomersListParams,
  type CustomersListResponse,
  type CustomerStatusFilter,
  type CustomerFilter,
  type PartyRecordSource,
} from './api/endpoints/customers';

export {
  useGetStockValuationQuery,
  useGetConsumptionQuery,
  useLazyGetJobConsumptionQuery,
  useLazyGetProductionByJobQuery,
  useGetJobProfitabilityQuery,
  useGetSupplierTraceabilityQuery,
  useGetInventoryByWarehouseQuery,
  useGetInventoryByWarehousePageQuery,
  useGetStockIntegrityQuery,
  useGetStockIntegrityPageQuery,
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
  type ProductionByJobRow,
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
  useGetTransferLedgerPageQuery,
  TRANSFER_LEDGER_PAGE_SIZE_OPTIONS,
  useWarehouseTransferStockMutation,
  useGetWarehouseTransferLedgerQuery,
  useGetWarehouseTransferLedgerPageQuery,
  WAREHOUSE_TRANSFER_PAGE_SIZE_OPTIONS,
  useGetDispatchEntryQuery,
  useGetDispatchEntryRevisionsQuery,
  useGetNonStockReconcileDataQuery,
  useGetNonStockReconcileHistoryPageQuery,
  useReconcileNonStockMutation,
  useRequestManualStockAdjustmentMutation,
} from './api/endpoints/transactions';

export type { DispatchEntryRevisionRow, DispatchRevisionLineDto } from './api/endpoints/transactions';

export {
  useGetSuppliersQuery,
  useGetSuppliersPageQuery,
  useLazyGetSuppliersPageQuery,
  useGetSupplierByIdQuery,
  useLazyGetSupplierByIdQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useSyncSuppliersFromPartyApiMutation,
  useBulkImportSuppliersMutation,
  useLazyGetSuppliersForExportQuery,
  useGetSuppliersForExportQuery,
  SUPPLIER_PAGE_SIZE_OPTIONS,
  type Supplier,
  type SuppliersListParams,
  type SuppliersListResponse,
  type SupplierSourceFilter,
} from './api/endpoints/suppliers';

export {
  useGetDispatchEntriesQuery,
  useGetDispatchEntriesPageQuery,
  DISPATCH_ENTRY_PAGE_SIZE_OPTIONS,
  useDeleteDeliveryNoteMutation,
  useReceiveDeliveryNoteMutation,
  type DispatchEntry,
} from './api/endpoints/dispatch';

export {
  useGetReceiptEntriesQuery,
  useGetReceiptEntriesPageQuery,
  RECEIPT_ENTRY_PAGE_SIZE_OPTIONS,
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
