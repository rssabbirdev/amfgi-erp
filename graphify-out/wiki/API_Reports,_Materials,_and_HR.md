# API Reports, Materials, and HR

> 92 nodes · cohesion 0.03

## Key Concepts

- **GET()** (291 connections) — `app/api/warehouses/route.ts`
- **uniqueStrings()** (5 connections) — `app/api/reports/stock-exceptions/route.ts`
- **resolveTransactionUnitCost()** (4 connections) — `app/api/jobs/[id]/consumption-costing/route.ts`
- **route.ts** (4 connections) — `app/api/reports/stock-adjustments/route.ts`
- **route.ts** (4 connections) — `app/api/reports/stock-adjustments/route.ts`
- **sanitizeSheetName()** (3 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **monthBoundsFromYmd()** (3 connections) — `app/api/hr/attendance/overview/route.ts`
- **toLines()** (3 connections) — `app/api/reports/stock-adjustments/route.ts`
- **toTransactionIds()** (3 connections) — `app/api/reports/stock-adjustments/route.ts`
- **route.ts** (3 connections) — `app/api/reports/stock-exceptions/route.ts`
- **parseOverrideReason()** (3 connections) — `app/api/reports/stock-exceptions/route.ts`
- **redirectToSettings()** (3 connections) — `app/api/settings/google-drive/oauth/callback/route.ts`
- **route.ts** (3 connections) — `app/api/transactions/[id]/route.ts`
- **isReconcileTransaction()** (3 connections) — `app/api/transactions/[id]/route.ts`
- **buildPivot()** (3 connections) — `components/reports/JobConsumptionTable.tsx`
- **route.ts** (3 connections) — `app/api/reports/stock-exceptions/route.ts`
- **route.ts** (3 connections) — `app/api/transactions/[id]/route.ts`
- **route.ts** (2 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **route.ts** (2 connections) — `app/api/hr/attendance/overview/route.ts`
- **route.ts** (2 connections) — `app/api/jobs/[id]/consumption-costing/route.ts`
- **route.ts** (2 connections) — `app/api/live-updates/route.ts`
- **sleep()** (2 connections) — `app/api/live-updates/route.ts`
- **route.ts** (2 connections) — `app/api/reports/stock-integrity/route.ts`
- **hasMismatch()** (2 connections) — `app/api/reports/stock-integrity/route.ts`
- **route.ts** (2 connections) — `app/api/settings/google-drive/oauth/callback/route.ts`
- *... and 67 more nodes in this community*

## Relationships

- [[API HR, Jobs, and Materials]] (46 shared connections)
- [[API HR, Materials, and Upload]] (40 shared connections)
- [[API HR, User, and Jobs]] (16 shared connections)
- [[Lib Utils]] (9 shared connections)
- [[Lib Utils and Job Costing]] (8 shared connections)
- [[API Companies, Materials, and Suppliers]] (6 shared connections)
- [[Lib Utils, Job Costing, and Stock]] (6 shared connections)
- [[Lib HR]] (5 shared connections)
- [[HR Schedule and Settings]] (5 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (4 shared connections)
- [[Components HR]] (4 shared connections)
- [[Components Job Costing]] (4 shared connections)

## Source Files

- `app/api/customers/[id]/check-delete/route.ts`
- `app/api/delivery-notes/next-number/route.ts`
- `app/api/hr/attendance/monthly-report/route.ts`
- `app/api/hr/attendance/overview/route.ts`
- `app/api/hr/documents/expiring/route.ts`
- `app/api/job-costing/formulas/[id]/versions/route.ts`
- `app/api/jobs/[id]/check-delete/route.ts`
- `app/api/jobs/[id]/consumption-costing/route.ts`
- `app/api/jobs/[id]/materials/route.ts`
- `app/api/live-updates/route.ts`
- `app/api/materials/[id]/check-delete/route.ts`
- `app/api/materials/[id]/logs/route.ts`
- `app/api/materials/[id]/price-logs/route.ts`
- `app/api/materials/cross-company/route.ts`
- `app/api/materials/dispatch-history-entries/route.ts`
- `app/api/materials/dispatch-history/route.ts`
- `app/api/materials/receipt-history-entries/[receiptNumber]/adjustment-impact/route.ts`
- `app/api/materials/receipt-history-entries/route.ts`
- `app/api/me/attendance/route.ts`
- `app/api/me/employee/route.ts`

## Audit Trail

- EXTRACTED: 346 (80%)
- INFERRED: 87 (20%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*