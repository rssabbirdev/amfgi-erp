# Lib Utils and Job Costing

> 21 nodes · cohesion 0.14

## Key Concepts

- **serializeMaterialUoms()** (7 connections) — `lib/utils/materialUom.ts`
- **canEdit()** (6 connections) — `app/api/materials/[id]/uoms/[uomId]/route.ts`
- **resolvePricingSnapshot()** (6 connections) — `lib/job-costing/pricing.ts`
- **computeFactorToBase()** (6 connections) — `lib/utils/materialUom.ts`
- **route.ts** (5 connections) — `app/api/materials/[id]/uoms/route.ts`
- **getSerializedMaterialUoms()** (5 connections) — `app/api/materials/[id]/uoms/route.ts`
- **route.ts** (5 connections) — `app/api/materials/[id]/uoms/route.ts`
- **getFactorToBase()** (4 connections) — `lib/job-costing/pricing.ts`
- **materialUom.ts** (4 connections) — `lib/utils/materialUom.ts`
- **assertAcyclicNewParent()** (4 connections) — `lib/utils/materialUom.ts`
- **canView()** (3 connections) — `app/api/materials/[id]/uoms/route.ts`
- **pricing.ts** (3 connections) — `lib/job-costing/pricing.ts`
- **weightedAverage()** (3 connections) — `lib/job-costing/pricing.ts`
- **resolveQuantityToBase()** (3 connections) — `lib/utils/materialUomDb.ts`
- **resolveFactorToBase()** (3 connections) — `lib/utils/materialUomDb.ts`
- **pricing.ts** (3 connections) — `lib/job-costing/pricing.ts`
- **materialUom.ts** (3 connections) — `lib/utils/materialUom.ts`
- **route.ts** (2 connections) — `app/api/materials/[id]/uoms/[uomId]/route.ts`
- **materialUomDb.ts** (2 connections) — `lib/utils/materialUomDb.ts`
- **route.ts** (2 connections) — `app/api/materials/[id]/uoms/[uomId]/route.ts`
- **materialUomDb.ts** (2 connections) — `lib/utils/materialUomDb.ts`

## Relationships

- [[API Reports, Materials, and HR]] (8 shared connections)
- [[API HR, Materials, and Upload]] (8 shared connections)
- [[API HR, Jobs, and Materials]] (4 shared connections)
- [[API Companies, Materials, and Suppliers]] (2 shared connections)
- [[Lib Utils, Job Costing, and Stock]] (1 shared connections)

## Source Files

- `app/api/materials/[id]/uoms/[uomId]/route.ts`
- `app/api/materials/[id]/uoms/route.ts`
- `lib/job-costing/pricing.ts`
- `lib/utils/materialUom.ts`
- `lib/utils/materialUomDb.ts`

## Audit Trail

- EXTRACTED: 63 (78%)
- INFERRED: 18 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*