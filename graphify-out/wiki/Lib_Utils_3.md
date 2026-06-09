# Lib Utils

> 22 nodes · cohesion 0.16

## Key Concepts

- **manualStockAdjustmentExecution.ts** (20 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **manualStockAdjustmentRequest.ts** (17 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **applyManualStockAdjustmentApproval()** (11 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **manualStockAdjustmentPolicy.ts** (10 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **createManualStockAdjustmentRequest()** (9 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **calculateFIFOConsumption()** (8 connections) — `lib/utils/fifoConsumption.ts`
- **stockExceptionApproval.ts** (7 connections) — `lib/utils/stockExceptionApproval.ts`
- **upsertStockExceptionApproval()** (6 connections) — `lib/utils/stockExceptionApproval.ts`
- **ManualStockAdjustmentLinePayload** (5 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **validateManualStockAdjustmentRequest()** (5 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **consumeTransactionBatchQuantities()** (5 connections) — `lib/utils/transactionBatchLinks.ts`
- **manualStockAdjustment.ts** (3 connections) — `lib/utils/manualStockAdjustment.ts`
- **buildManualStockAdjustmentNote()** (3 connections) — `lib/utils/manualStockAdjustment.ts`
- **summarizeManualStockAdjustmentPolicy()** (2 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **buildReferenceNumber()** (2 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **parseManualStockAdjustmentMetadata()** (1 connections) — `lib/utils/manualStockAdjustment.ts`
- **Tx** (1 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **EvidenceType** (1 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **Tx** (1 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **ManualStockAdjustmentRequestSource** (1 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **Tx** (1 connections) — `lib/utils/stockExceptionApproval.ts`
- **StockExceptionApprovalInput** (1 connections) — `lib/utils/stockExceptionApproval.ts`

## Relationships

- [[API and Lib]] (20 shared connections)
- [[Lib Utils, Dispatch Entry Revision, and Db]] (7 shared connections)
- [[API Job Costing, Stock Count Sessions, and Jobs]] (7 shared connections)
- [[Stock Manual Adjustments and Count Session]] (6 shared connections)
- [[API Customers, Categories, and Companies]] (4 shared connections)
- [[Lib Utils]] (2 shared connections)
- [[Lib Stock and Utils]] (2 shared connections)

## Source Files

- `lib/utils/fifoConsumption.ts`
- `lib/utils/manualStockAdjustment.ts`
- `lib/utils/manualStockAdjustmentExecution.ts`
- `lib/utils/manualStockAdjustmentPolicy.ts`
- `lib/utils/manualStockAdjustmentRequest.ts`
- `lib/utils/stockExceptionApproval.ts`
- `lib/utils/transactionBatchLinks.ts`

## Audit Trail

- EXTRACTED: 120 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*