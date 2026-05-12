# Lib Utils, HR, and Material Master Data

> 66 nodes · cohesion 0.05

## Key Concepts

- **update()** (37 connections) — `app/(app)/hr/settings/employee-types/page.tsx`
- **page.tsx** (16 connections) — `app/(app)/profile/page.tsx`
- **applyManualStockAdjustmentApproval()** (11 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **requireEmployeeApiAuth()** (7 connections) — `lib/hr/mobileAccess.ts`
- **materialMasterData.ts** (6 connections) — `lib/materialMasterData.ts`
- **resolveEffectiveWarehouse()** (6 connections) — `lib/warehouses/stockWarehouses.ts`
- **sha256()** (5 connections) — `lib/hr/mobileAccess.ts`
- **recalculateAssemblyUnitCostTx()** (5 connections) — `lib/utils/materialAssembly.ts`
- **stockWarehouses.ts** (5 connections) — `lib/warehouses/stockWarehouses.ts`
- **page.tsx** (5 connections) — `app/(app)/profile/page.tsx`
- **materialMasterData.ts** (5 connections) — `lib/materialMasterData.ts`
- **ensureCategoryRef()** (4 connections) — `lib/materialMasterData.ts`
- **resolveCategoryRef()** (4 connections) — `lib/materialMasterData.ts`
- **ensureWarehouseRef()** (4 connections) — `lib/materialMasterData.ts`
- **resolveWarehouseRef()** (4 connections) — `lib/materialMasterData.ts`
- **mobileAccess.ts** (4 connections) — `lib/hr/mobileAccess.ts`
- **generateEmployeeMobileToken()** (4 connections) — `lib/hr/mobileAccess.ts`
- **readBearerToken()** (4 connections) — `lib/hr/mobileAccess.ts`
- **generateBatchNumber()** (4 connections) — `lib/utils/fifoConsumption.ts`
- **transactionBatchLinks.ts** (4 connections) — `lib/utils/transactionBatchLinks.ts`
- **applyMaterialWarehouseDelta()** (4 connections) — `lib/warehouses/stockWarehouses.ts`
- **mobileAccess.ts** (4 connections) — `lib/hr/mobileAccess.ts`
- **transactionBatchLinks.ts** (4 connections) — `lib/utils/transactionBatchLinks.ts`
- **stockWarehouses.ts** (4 connections) — `lib/warehouses/stockWarehouses.ts`
- **previewSrc()** (3 connections) — `app/(app)/profile/page.tsx`
- *... and 41 more nodes in this community*

## Relationships

- [[HR, Components, and Reports]] (7 shared connections)
- [[API HR, Materials, and Upload]] (5 shared connections)
- [[API Reports, Materials, and HR]] (4 shared connections)
- [[Lib, Scripts, and Settings]] (4 shared connections)
- [[Lib Utils, Media, and Db]] (3 shared connections)
- [[Components HR]] (3 shared connections)
- [[Lib Utils]] (3 shared connections)
- [[Reports, Settings, and HR]] (2 shared connections)
- [[API Settings, Companies, and Materials]] (2 shared connections)
- [[Lib Live Updates and Warehouses]] (2 shared connections)
- [[API HR, Jobs, and Materials]] (2 shared connections)
- [[Lib Integrations]] (2 shared connections)

## Source Files

- `app/(app)/hr/settings/employee-types/page.tsx`
- `app/(app)/profile/page.tsx`
- `app/(auth)/select-company/page.tsx`
- `lib/hr/mobileAccess.ts`
- `lib/hr/provisionEmployeeUser.ts`
- `lib/materialMasterData.ts`
- `lib/utils/fifoConsumption.ts`
- `lib/utils/manualStockAdjustment.ts`
- `lib/utils/manualStockAdjustmentExecution.ts`
- `lib/utils/materialAssembly.ts`
- `lib/utils/stockBatchManagement.ts`
- `lib/utils/transactionBatchLinks.ts`
- `lib/warehouses/stockWarehouses.ts`

## Audit Trail

- EXTRACTED: 188 (72%)
- INFERRED: 74 (28%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*