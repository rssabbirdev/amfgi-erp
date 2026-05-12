# Lib, Scripts, and Settings

> 56 nodes · cohesion 0.06

## Key Concepts

- **seed.ts** (16 connections) — `scripts/seed.ts`
- **seed.ts** (16 connections) — `scripts/seed.ts`
- **seed-production.ts** (9 connections) — `scripts/seed-production.ts`
- **seedCompanyData()** (9 connections) — `scripts/seed.ts`
- **seedJobCostingDemo()** (9 connections) — `scripts/seed.ts`
- **readStockControlSettingsFromCompanySettings()** (8 connections) — `lib/stock-control/settings.ts`
- **createManualStockAdjustmentRequest()** (8 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **seedHrWorkforceDemo()** (8 connections) — `scripts/seed.ts`
- **mergeStockControlSettingsIntoCompanySettings()** (7 connections) — `lib/stock-control/settings.ts`
- **seed()** (7 connections) — `scripts/seed.ts`
- **settings.ts** (6 connections) — `lib/stock-control/settings.ts`
- **createSeedStockOut()** (6 connections) — `scripts/seed.ts`
- **buildJobUpsertPayload()** (6 connections) — `scripts/seed.ts`
- **ensureDefaultEmployeeDocumentTypes()** (5 connections) — `lib/hr/defaultDocumentTypes.ts`
- **normalizeStockControlSettings()** (5 connections) — `lib/stock-control/settings.ts`
- **buildTransactionActorFields()** (5 connections) — `lib/utils/auditActor.ts`
- **validateManualStockAdjustmentRequest()** (5 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **permissions.ts** (4 connections) — `lib/permissions.ts`
- **isMissingWorkScheduleNotesColumn()** (4 connections) — `scripts/seed.ts`
- **upsertWorkScheduleCompat()** (4 connections) — `scripts/seed.ts`
- **loadCompanyData()** (4 connections) — `app/(app)/settings/page.tsx`
- **summarizeManualStockAdjustmentPolicy()** (3 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **buildReferenceNumber()** (3 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **upsertStockExceptionApproval()** (3 connections) — `lib/utils/stockExceptionApproval.ts`
- **main()** (3 connections) — `scripts/seed-production.ts`
- *... and 31 more nodes in this community*

## Relationships

- [[API HR, Jobs, and Materials]] (4 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (4 shared connections)
- [[Settings API]] (4 shared connections)
- [[API Companies, Customers, and Materials]] (3 shared connections)
- [[API Reports, Materials, and HR]] (3 shared connections)
- [[API HR, Materials, and Upload]] (2 shared connections)
- [[Lib Utils, Job Costing, and Stock]] (2 shared connections)
- [[HR Schedule and Settings]] (2 shared connections)
- [[Admin Users, Roles, and Companies]] (1 shared connections)
- [[Components, HR, and Reports]] (1 shared connections)
- [[Stock Count Session and Manual Adjustments]] (1 shared connections)
- [[Components HR]] (1 shared connections)

## Source Files

- `app/(app)/settings/page.tsx`
- `lib/db/postgresAdapter.ts`
- `lib/hr/defaultDocumentTypes.ts`
- `lib/permissions.ts`
- `lib/stock-control/settings.ts`
- `lib/utils/auditActor.ts`
- `lib/utils/manualStockAdjustmentPolicy.ts`
- `lib/utils/manualStockAdjustmentRequest.ts`
- `lib/utils/stockExceptionApproval.ts`
- `scripts/seed-print-templates.ts`
- `scripts/seed-production.ts`
- `scripts/seed.ts`

## Audit Trail

- EXTRACTED: 186 (83%)
- INFERRED: 39 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*