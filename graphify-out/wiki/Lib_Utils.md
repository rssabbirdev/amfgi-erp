# Lib Utils

> 22 nodes · cohesion 0.15

## Key Concepts

- **route.ts** (24 connections) — `app/api/stock-exception-approvals/[id]/route.ts`
- **manualStockAdjustmentRequest.ts** (17 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **route.ts** (16 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **manual-stock-adjustment-approval.test.ts** (13 connections) — `__tests__/integration/manual-stock-adjustment-approval.test.ts`
- **manualStockAdjustmentPolicy.ts** (10 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **createManualStockAdjustmentRequest()** (9 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **POST()** (7 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **stockExceptionApproval.ts** (7 connections) — `lib/utils/stockExceptionApproval.ts`
- **upsertStockExceptionApproval()** (6 connections) — `lib/utils/stockExceptionApproval.ts`
- **ManualStockAdjustmentLinePayload** (5 connections) — `lib/utils/manualStockAdjustmentExecution.ts`
- **validateManualStockAdjustmentRequest()** (5 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **summarizeManualStockAdjustmentPolicy()** (2 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **buildReferenceNumber()** (2 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **ManualStockAdjustmentLineSchema** (1 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **ManualStockAdjustmentSchema** (1 connections) — `app/api/transactions/manual-adjustment/route.ts`
- **EvidenceType** (1 connections) — `lib/utils/manualStockAdjustmentPolicy.ts`
- **Tx** (1 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **ManualStockAdjustmentRequestSource** (1 connections) — `lib/utils/manualStockAdjustmentRequest.ts`
- **Tx** (1 connections) — `lib/utils/stockExceptionApproval.ts`
- **StockExceptionApprovalInput** (1 connections) — `lib/utils/stockExceptionApproval.ts`
- **decreaseTxn** (1 connections) — `__tests__/integration/manual-stock-adjustment-approval.test.ts`
- **increaseTxn** (1 connections) — `__tests__/integration/manual-stock-adjustment-approval.test.ts`

## Relationships

- [[API Materials, Transactions, and Stock Exception Approvals]] (13 shared connections)
- [[Tests Integration]] (12 shared connections)
- [[Lib Utils, Stock, and Warehouses]] (8 shared connections)
- [[Stock, Lib, and Components]] (8 shared connections)
- [[API and Lib]] (7 shared connections)
- [[Lib, API, and Tests]] (7 shared connections)
- [[API HR and Stock Exception Approvals]] (3 shared connections)
- [[API Me, Settings, and Jobs]] (2 shared connections)
- [[Lib Stock and Utils]] (2 shared connections)
- [[Lib and API]] (2 shared connections)

## Source Files

- `__tests__/integration/manual-stock-adjustment-approval.test.ts`
- `app/api/stock-exception-approvals/[id]/route.ts`
- `app/api/transactions/manual-adjustment/route.ts`
- `lib/utils/manualStockAdjustmentExecution.ts`
- `lib/utils/manualStockAdjustmentPolicy.ts`
- `lib/utils/manualStockAdjustmentRequest.ts`
- `lib/utils/stockExceptionApproval.ts`

## Audit Trail

- EXTRACTED: 132 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*