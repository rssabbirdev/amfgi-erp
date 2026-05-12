# API Transactions and Upload

> 8 nodes · cohesion 0.36

## Key Concepts

- **route.ts** (5 connections) — `app/api/transactions/batch/route.ts`
- **parseDeliveryNoteLabel()** (5 connections) — `app/api/upload/signed-copy/route.ts`
- **route.ts** (5 connections) — `app/api/transactions/batch/route.ts`
- **buildStockInReceiptNote()** (2 connections) — `app/api/transactions/batch/route.ts`
- **buildStockOutOverrideNote()** (2 connections) — `app/api/transactions/batch/route.ts`
- **buildReturnBatchLinks()** (2 connections) — `app/api/transactions/batch/route.ts`
- **route.ts** (2 connections) — `app/api/upload/signed-copy/route.ts`
- **route.ts** (2 connections) — `app/api/upload/signed-copy/route.ts`

## Relationships

- [[API HR, Materials, and Upload]] (5 shared connections)

## Source Files

- `app/api/transactions/batch/route.ts`
- `app/api/upload/signed-copy/route.ts`

## Audit Trail

- EXTRACTED: 25 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*