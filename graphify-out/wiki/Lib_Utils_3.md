# Lib Utils

> 29 nodes · cohesion 0.13

## Key Concepts

- **route.ts** (25 connections) — `app/api/transactions/[id]/route.ts`
- **manualStockAdjustmentExecution.ts** (20 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **route.ts** (18 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **manualStockAdjustmentRequest.ts** (17 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **transactionBatchLinks.ts** (14 connections) — `lib/utils/transactionBatchLinks.ts`
- **applyManualStockAdjustmentApproval()** (11 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **manualStockAdjustmentPolicy.ts** (10 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **createManualStockAdjustmentRequest()** (9 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **calculateFIFOConsumption()** (8 connections) — `lib/utils/fifoConsumption.ts`
- **createTransactionBatchRecords()** (8 connections) — `lib/utils/transactionBatchLinks.ts`
- **ManualStockAdjustmentLinePayload** (5 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **validateManualStockAdjustmentRequest()** (5 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **consumeTransactionBatchQuantities()** (5 connections) — `lib/utils/transactionBatchLinks.ts`
- **manualStockAdjustment.ts** (3 connections) — `lib/utils/manualStockAdjustment.ts`
- **buildManualStockAdjustmentNote()** (3 connections) — `lib/utils/manualStockAdjustment.ts`
- **TransactionBatchLinkInput** (3 connections) — `lib/utils/transactionBatchLinks.ts`
- **restoreTransactionBatchQuantities()** (3 connections) — `lib/utils/transactionBatchLinks.ts`
- **normalizeTransactionBatchLinks()** (3 connections) — `lib/utils/transactionBatchLinks.ts`
- **isReconcileTransaction()** (2 connections) — `app/api/transactions/[id]/route.ts`
- **summarizeManualStockAdjustmentPolicy()** (2 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **buildReferenceNumber()** (2 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **ManualStockAdjustmentLineSchema** (1 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **ManualStockAdjustmentSchema** (1 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **parseManualStockAdjustmentMetadata()** (1 connections) — `lib/utils/manualStockAdjustment.ts`
- **Tx** (1 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- *... and 4 more nodes in this community*

## Relationships

- [[Lib Utils, Warehouses, and Stock]] (12 shared connections)
- [[API Stock Count Sessions, Jobs, and Users]] (10 shared connections)
- [[Lib, API, and Tests]] (10 shared connections)
- [[Lib Utils, Dispatch Entry Revision, and Db]] (10 shared connections)
- [[Lib Stock, Utils, and Warehouses]] (10 shared connections)
- [[API Materials, Me, and Reports]] (8 shared connections)
- [[API Stock Exception Approvals, Transactions, and Categories]] (6 shared connections)
- [[Stock, Customers, and Components]] (6 shared connections)
- [[Tests Integration]] (5 shared connections)
- [[API, Lib, and Auth]] (2 shared connections)
- [[API HR, Settings, and Stock Exception Approvals]] (1 shared connections)
- [[Lib Import Export and Jobs]] (1 shared connections)

## Source Files

- `app/api/transactions/[id]/route.ts`
- `app/api/transactions/manual-adjustment/route.ts`
- `lib/utils/fifoConsumption.ts`
- `lib/utils/manualStockAdjustment.ts`
- `lib/utils/manualStockAdjustmentExecution.ts`
- `lib/utils/manualStockAdjustmentPolicy.ts`
- `lib/utils/manualStockAdjustmentRequest.ts`
- `lib/utils/transactionBatchLinks.ts`

## Audit Trail

- EXTRACTED: 184 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*