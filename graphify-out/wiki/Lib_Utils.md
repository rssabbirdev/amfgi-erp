# Lib Utils

> 18 nodes · cohesion 0.17

## Key Concepts

- **route.ts** (11 connections) — `app/api/materials/price-logs/route.ts`
- **route.ts** (11 connections) — `app/api/materials/[id]/assembly/route.ts`
- **decimalEqualsNullable()** (10 connections) — `lib/utils/decimal.ts`
- **receiptPriceLogs.ts** (10 connections) — `lib/utils/receiptPriceLogs.ts`
- **materialAssembly.ts** (8 connections) — `lib/utils/materialAssembly.ts`
- **recalculateAssemblyAncestorsTx()** (6 connections) — `lib/utils/materialAssembly.ts`
- **reverseReceiptPriceLogUpdates()** (6 connections) — `lib/utils/receiptPriceLogs.ts`
- **POST()** (5 connections) — `app/api/materials/price-logs/route.ts`
- **GET()** (4 connections) — `app/api/materials/[id]/assembly/route.ts`
- **PUT()** (4 connections) — `app/api/materials/[id]/assembly/route.ts`
- **isPrismaDecimal()** (4 connections) — `lib/utils/decimal.ts`
- **recalculateAssemblyUnitCostTx()** (4 connections) — `lib/utils/materialAssembly.ts`
- **buildReceiptPriceLogNote()** (3 connections) — `lib/utils/receiptPriceLogs.ts`
- **roundMoney()** (2 connections) — `lib/utils/materialAssembly.ts`
- **PriceLogSchema** (1 connections) — `app/api/materials/price-logs/route.ts`
- **UpdateAssemblySchema** (1 connections) — `app/api/materials/[id]/assembly/route.ts`
- **TxClient** (1 connections) — `lib/utils/materialAssembly.ts`
- **TxClient** (1 connections) — `lib/utils/receiptPriceLogs.ts`

## Relationships

- [[API HR, Materials, and Me]] (17 shared connections)
- [[Tests, API, and Lib]] (8 shared connections)
- [[Lib Utils, Stock, and Dispatch Entry Revision]] (8 shared connections)
- [[API Jobs, Suppliers, and Customers]] (6 shared connections)
- [[Lib Integrations and Party List Record Payload]] (1 shared connections)

## Source Files

- `app/api/materials/[id]/assembly/route.ts`
- `app/api/materials/price-logs/route.ts`
- `lib/utils/decimal.ts`
- `lib/utils/materialAssembly.ts`
- `lib/utils/receiptPriceLogs.ts`

## Audit Trail

- EXTRACTED: 92 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*