# Lib Utils, Job Costing, and Stock

> 27 nodes · cohesion 0.15

## Key Concepts

- **decimalToNumberOrZero()** (19 connections) — `lib/utils/decimal.ts`
- **calculateJobCostEngine()** (13 connections) — `lib/job-costing/costEngine.ts`
- **costEngine.ts** (8 connections) — `lib/job-costing/costEngine.ts`
- **decimal.ts** (8 connections) — `lib/utils/decimal.ts`
- **decimalToNumber()** (8 connections) — `lib/utils/decimal.ts`
- **costEngine.ts** (8 connections) — `lib/job-costing/costEngine.ts`
- **buildDailyQuantityLogPayload()** (6 connections) — `lib/stock/buildDailyQuantityLog.ts`
- **loadEligibleJobs()** (6 connections) — `lib/stock/buildDailyQuantityLog.ts`
- **decimal.ts** (6 connections) — `lib/utils/decimal.ts`
- **isPrismaDecimal()** (5 connections) — `lib/utils/decimal.ts`
- **serializePrismaDecimals()** (5 connections) — `lib/utils/decimal.ts`
- **getTransactionCost()** (4 connections) — `lib/job-costing/costEngine.ts`
- **attendanceWorkedMinutesFromPunches()** (4 connections) — `lib/job-costing/costEngine.ts`
- **resolveCurrentUnitCostFromLogs()** (4 connections) — `lib/job-costing/costEngine.ts`
- **decimalEqualsNullable()** (4 connections) — `lib/utils/decimal.ts`
- **isRecord()** (3 connections) — `lib/job-costing/costEngine.ts`
- **mergeDefaultMaterialSelections()** (3 connections) — `lib/job-costing/costEngine.ts`
- **diffMinutes()** (3 connections) — `lib/job-costing/costEngine.ts`
- **buildDailyQuantityLog.ts** (3 connections) — `lib/stock/buildDailyQuantityLog.ts`
- **nullableDecimalToNumber()** (3 connections) — `lib/utils/decimal.ts`
- **mapStockCountSessionLine()** (3 connections) — `lib/utils/stockCountSessionServer.ts`
- **buildDailyQuantityLog.ts** (3 connections) — `lib/stock/buildDailyQuantityLog.ts`
- **getSelectedMaterialIdsFromSpecifications()** (2 connections) — `lib/job-costing/costEngine.ts`
- **isQuantityLogDayFinalized()** (2 connections) — `lib/stock/buildDailyQuantityLog.ts`
- **stockCountSessionServer.ts** (2 connections) — `lib/utils/stockCountSessionServer.ts`
- *... and 2 more nodes in this community*

## Relationships

- [[API Reports, Materials, and HR]] (6 shared connections)
- [[API HR, Materials, and Upload]] (4 shared connections)
- [[Components Job Costing]] (3 shared connections)
- [[API Companies, Materials, and Suppliers]] (3 shared connections)
- [[API HR, Jobs, and Materials]] (3 shared connections)
- [[API HR, User, and Jobs]] (2 shared connections)
- [[Lib, Scripts, and Settings]] (2 shared connections)
- [[Lib Utils and Job Costing]] (1 shared connections)
- [[Lib, Job Costing, and Settings]] (1 shared connections)
- [[Lib, HR, and Work Date]] (1 shared connections)
- [[HR Schedule and Settings]] (1 shared connections)
- [[Lib Integrations, Party Lists API, and Party List Sync]] (1 shared connections)

## Source Files

- `lib/job-costing/costEngine.ts`
- `lib/stock/buildDailyQuantityLog.ts`
- `lib/utils/decimal.ts`
- `lib/utils/stockCountSessionServer.ts`

## Audit Trail

- EXTRACTED: 100 (72%)
- INFERRED: 39 (28%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*