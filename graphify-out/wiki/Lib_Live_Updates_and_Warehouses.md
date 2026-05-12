# Lib Live Updates and Warehouses

> 23 nodes · cohesion 0.12

## Key Concepts

- **server.ts** (18 connections) — `lib/live-updates/server.ts`
- **route.ts** (10 connections) — `app/api/companies/route.ts`
- **publishLiveUpdate()** (7 connections) — `lib/live-updates/server.ts`
- **POST()** (6 connections) — `app/api/companies/route.ts`
- **companyWarehouseMode.ts** (5 connections) — `lib/warehouses/companyWarehouseMode.ts`
- **ensureCompanyFallbackWarehouse()** (5 connections) — `lib/warehouses/companyWarehouseMode.ts`
- **normalizeWarehouseMode()** (4 connections) — `lib/warehouses/companyWarehouseMode.ts`
- **server.ts** (4 connections) — `lib/live-updates/server.ts`
- **GET()** (3 connections) — `app/api/companies/route.ts`
- **assertWarehouseModeTransition()** (3 connections) — `lib/warehouses/companyWarehouseMode.ts`
- **getLatestLiveUpdateCursor()** (3 connections) — `lib/live-updates/server.ts`
- **companyWarehouseMode.ts** (3 connections) — `lib/warehouses/companyWarehouseMode.ts`
- **normalizeCompanySlug()** (2 connections) — `app/api/companies/route.ts`
- **ensureLiveUpdateCompanyFkTarget()** (2 connections) — `lib/live-updates/server.ts`
- **getLatestLiveUpdateCursor()** (2 connections) — `lib/live-updates/server.ts`
- **mapRowToEvent()** (2 connections) — `lib/live-updates/server.ts`
- **getLiveUpdatesAfterCursor()** (2 connections) — `lib/live-updates/server.ts`
- **CreateSchema** (1 connections) — `app/api/companies/route.ts`
- **LiveUpdateChannel** (1 connections) — `lib/live-updates/server.ts`
- **LiveUpdateEvent** (1 connections) — `lib/live-updates/server.ts`
- **LiveUpdateRow** (1 connections) — `lib/live-updates/server.ts`
- **mapRowToEvent()** (1 connections) — `lib/live-updates/server.ts`
- **getLiveUpdatesAfterCursor()** (1 connections) — `lib/live-updates/server.ts`

## Relationships

- [[API Settings, Companies, and Materials]] (15 shared connections)
- [[API HR, Jobs, and Materials]] (3 shared connections)
- [[Lib Utils, Media, and Db]] (2 shared connections)
- [[API Reports, Materials, and HR]] (2 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (2 shared connections)
- [[API Media and Settings]] (1 shared connections)
- [[API HR, Materials, and Upload]] (1 shared connections)
- [[API HR, User, and Jobs]] (1 shared connections)

## Source Files

- `app/api/companies/route.ts`
- `lib/live-updates/server.ts`
- `lib/warehouses/companyWarehouseMode.ts`

## Audit Trail

- EXTRACTED: 78 (90%)
- INFERRED: 9 (10%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*