# Lib, Live Updates, and Server

> 13 nodes · cohesion 0.19

## Key Concepts

- **server.ts** (18 connections) — `lib/live-updates/server.ts`
- **publishLiveUpdate()** (7 connections) — `lib/live-updates/server.ts`
- **server.ts** (4 connections) — `lib/live-updates/server.ts`
- **getLatestLiveUpdateCursor()** (3 connections) — `lib/live-updates/server.ts`
- **ensureLiveUpdateCompanyFkTarget()** (2 connections) — `lib/live-updates/server.ts`
- **getLatestLiveUpdateCursor()** (2 connections) — `lib/live-updates/server.ts`
- **mapRowToEvent()** (2 connections) — `lib/live-updates/server.ts`
- **getLiveUpdatesAfterCursor()** (2 connections) — `lib/live-updates/server.ts`
- **LiveUpdateChannel** (1 connections) — `lib/live-updates/server.ts`
- **LiveUpdateEvent** (1 connections) — `lib/live-updates/server.ts`
- **LiveUpdateRow** (1 connections) — `lib/live-updates/server.ts`
- **mapRowToEvent()** (1 connections) — `lib/live-updates/server.ts`
- **getLiveUpdatesAfterCursor()** (1 connections) — `lib/live-updates/server.ts`

## Relationships

- [[API Companies, Materials, and Suppliers]] (8 shared connections)
- [[API Reports, Materials, and HR]] (2 shared connections)
- [[API HR, Jobs, and Materials]] (2 shared connections)
- [[Lib Party List Record Payload and Integrations]] (1 shared connections)
- [[API HR, Materials, and Upload]] (1 shared connections)
- [[API HR, User, and Jobs]] (1 shared connections)

## Source Files

- `lib/live-updates/server.ts`

## Audit Trail

- EXTRACTED: 39 (87%)
- INFERRED: 6 (13%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*